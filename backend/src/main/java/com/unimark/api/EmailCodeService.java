package com.unimark.api;

import static com.unimark.api.ApiModels.AccountResponse;
import static com.unimark.api.ApiModels.EmailCodeChallengeResponse;
import static com.unimark.api.ApiModels.TokenResponse;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;
import javax.crypto.Mac;
import javax.crypto.SecretKey;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** One-time email codes for account creation and sign-in. */
@Service
public class EmailCodeService {
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int MAX_ATTEMPTS = 5;
    private final NamedParameterJdbcTemplate jdbc;
    private final TokenService tokens;
    private final EmailCodeSender sender;
    private final SecretKey hashKey;

    public EmailCodeService(NamedParameterJdbcTemplate jdbc, TokenService tokens, EmailCodeSender sender, SecretKey jwtKey) {
        this.jdbc = jdbc;
        this.tokens = tokens;
        this.sender = sender;
        this.hashKey = jwtKey;
    }

    @Transactional
    public EmailCodeChallengeResponse send(UUID userId, String email) {
        sender.requireConfigured();
        Instant now = Instant.now();
        var previous = jdbc.query("SELECT sent_at FROM email_code_challenge WHERE user_id = :userId FOR UPDATE",
                Map.of("userId", userId), (rs, row) -> rs.getTimestamp("sent_at").toInstant());
        if (!previous.isEmpty() && previous.get(0).isAfter(now.minusSeconds(60))) {
            throw ApiException.tooManyRequests("Please wait one minute before requesting another email code.");
        }

        byte[] tokenBytes = new byte[32];
        RANDOM.nextBytes(tokenBytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(tokenBytes);
        String tokenHash = sha256(token);
        String code = String.format(java.util.Locale.ROOT, "%06d", RANDOM.nextInt(1_000_000));
        MapSqlParameterSource params = new MapSqlParameterSource().addValue("userId", userId)
                .addValue("tokenHash", tokenHash).addValue("codeHash", codeHash(userId, tokenHash, code))
                .addValue("expiresAt", Timestamp.from(now.plusSeconds(600))).addValue("sentAt", Timestamp.from(now));
        try {
            int saved;
            if (previous.isEmpty()) {
                saved = jdbc.update("INSERT INTO email_code_challenge(token_hash, user_id, code_hash, expires_at, sent_at, attempts) "
                                + "VALUES (:tokenHash, :userId, :codeHash, :expiresAt, :sentAt, 0)", params);
            } else {
                saved = jdbc.update("UPDATE email_code_challenge SET token_hash = :tokenHash, code_hash = :codeHash, "
                                + "expires_at = :expiresAt, sent_at = :sentAt, attempts = 0 WHERE user_id = :userId", params);
            }
            if (saved != 1) throw ApiException.unauthorized("Please sign in again to request a new email code.");
        } catch (DuplicateKeyException exception) {
            throw ApiException.tooManyRequests("Please wait one minute before requesting another email code.");
        }
        sender.send(email, code);
        return new EmailCodeChallengeResponse(token, email);
    }

    @Transactional(noRollbackFor = ApiException.class)
    public TokenResponse verify(String token, String code) {
        String tokenHash = sha256(token);
        var rows = jdbc.query("SELECT u.id, u.email, u.username, u.created_at, c.code_hash, c.expires_at, c.attempts "
                        + "FROM email_code_challenge c JOIN app_user u ON u.id = c.user_id "
                        + "WHERE c.token_hash = :tokenHash FOR UPDATE",
                Map.of("tokenHash", tokenHash), (rs, row) -> new Object[] {
                        rs.getObject("id", UUID.class), rs.getString("email"), rs.getString("username"),
                        rs.getTimestamp("created_at").toInstant(), rs.getString("code_hash"),
                        rs.getTimestamp("expires_at").toInstant(), rs.getInt("attempts")
                });
        if (rows.isEmpty()) throw ApiException.unauthorized("This email code has expired. Sign in again to request a new one.");
        Object[] row = rows.get(0);
        if (!((Instant) row[5]).isAfter(Instant.now()) || (Integer) row[6] >= MAX_ATTEMPTS) {
            jdbc.update("DELETE FROM email_code_challenge WHERE token_hash = :tokenHash", Map.of("tokenHash", tokenHash));
            throw ApiException.unauthorized("This email code has expired. Sign in again to request a new one.");
        }
        byte[] supplied = codeHash((UUID) row[0], tokenHash, code).getBytes(StandardCharsets.US_ASCII);
        byte[] expected = ((String) row[4]).getBytes(StandardCharsets.US_ASCII);
        if (!MessageDigest.isEqual(supplied, expected)) {
            jdbc.update("UPDATE email_code_challenge SET attempts = attempts + 1 WHERE token_hash = :tokenHash",
                    Map.of("tokenHash", tokenHash));
            throw ApiException.unauthorized("That email code is incorrect. Check the latest message and try again.");
        }
        jdbc.update("DELETE FROM email_code_challenge WHERE token_hash = :tokenHash", Map.of("tokenHash", tokenHash));
        return tokens.issue(new AccountResponse((UUID) row[0], (String) row[1], (String) row[2], (Instant) row[3]));
    }

    @Transactional
    public EmailCodeChallengeResponse resend(String token) {
        String tokenHash = sha256(token);
        var rows = jdbc.query("SELECT u.id, u.email, c.expires_at FROM email_code_challenge c "
                        + "JOIN app_user u ON u.id = c.user_id WHERE c.token_hash = :tokenHash FOR UPDATE",
                Map.of("tokenHash", tokenHash), (rs, row) -> new Object[] {
                        rs.getObject("id", UUID.class), rs.getString("email"), rs.getTimestamp("expires_at").toInstant()
                });
        if (rows.isEmpty() || !((Instant) rows.get(0)[2]).isAfter(Instant.now())) {
            throw ApiException.unauthorized("This email code has expired. Sign in again to request a new one.");
        }
        return send((UUID) rows.get(0)[0], (String) rows.get(0)[1]);
    }

    private String codeHash(UUID userId, String tokenHash, String code) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(hashKey);
            return HexFormat.of().formatHex(mac.doFinal((userId + ":" + tokenHash + ":" + code).getBytes(StandardCharsets.UTF_8)));
        } catch (Exception exception) {
            throw new IllegalStateException("Could not secure the email code.", exception);
        }
    }

    private static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception exception) {
            throw new IllegalStateException("SHA-256 is unavailable.", exception);
        }
    }
}
