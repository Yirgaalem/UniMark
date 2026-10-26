package com.unimark.api;

import static com.unimark.api.ApiModels.*;

import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TokenService {
    private final NamedParameterJdbcTemplate jdbc;
    private final JwtEncoder encoder;
    private final String issuer;
    private final long accessMinutes;
    private final long refreshDays;
    private final SecureRandom random = new SecureRandom();

    public TokenService(
            NamedParameterJdbcTemplate jdbc,
            JwtEncoder encoder,
            @Value("${unimark.security.issuer}") String issuer,
            @Value("${unimark.security.access-token-minutes}") long accessMinutes,
            @Value("${unimark.security.refresh-token-days}") long refreshDays) {
        this.jdbc = jdbc;
        this.encoder = encoder;
        this.issuer = issuer;
        this.accessMinutes = accessMinutes;
        this.refreshDays = refreshDays;
    }

    @Transactional
    public TokenResponse issue(AccountResponse account) {
        return issueAndStore(account);
    }

    @Transactional
    public TokenResponse refresh(String presentedToken) {
        String hash = hash(presentedToken);
        var params = new org.springframework.jdbc.core.namedparam.MapSqlParameterSource("tokenHash", hash);
        var matches = jdbc.query("SELECT u.id, u.email, u.username, u.created_at, rt.expires_at, rt.revoked_at " +
                        "FROM refresh_token rt JOIN app_user u ON u.id = rt.user_id WHERE rt.token_hash = :tokenHash FOR UPDATE",
                params, (rs, row) -> new Object[] {
                        rs.getObject("id", UUID.class), rs.getString("email"), rs.getString("username"), rs.getTimestamp("created_at").toInstant(),
                        rs.getTimestamp("expires_at").toInstant(), rs.getTimestamp("revoked_at") == null ? null : rs.getTimestamp("revoked_at").toInstant()
                });
        if (matches.isEmpty()) throw ApiException.unauthorized("Refresh token is invalid or expired.");
        Object[] row = matches.get(0);
        Instant now = Instant.now();
        if (row[5] != null || !((Instant) row[4]).isAfter(now)) {
            throw ApiException.unauthorized("Refresh token is invalid or expired.");
        }
        UUID id = (UUID) row[0];
        jdbc.update("UPDATE refresh_token SET revoked_at = :now WHERE token_hash = :tokenHash AND revoked_at IS NULL",
                new org.springframework.jdbc.core.namedparam.MapSqlParameterSource().addValue("now", Timestamp.from(now)).addValue("tokenHash", hash));
        return issueAndStore(new AccountResponse(id, (String) row[1], (String) row[2], (Instant) row[3]));
    }

    @Transactional
    public void revoke(String presentedToken, UUID userId) {
        jdbc.update("UPDATE refresh_token SET revoked_at = now() WHERE token_hash = :tokenHash AND user_id = :userId AND revoked_at IS NULL",
                new org.springframework.jdbc.core.namedparam.MapSqlParameterSource()
                        .addValue("tokenHash", hash(presentedToken)).addValue("userId", userId));
    }

    private TokenResponse issueAndStore(AccountResponse account) {
        Instant now = Instant.now();
        Instant accessExpiry = now.plus(accessMinutes, ChronoUnit.MINUTES);
        String access = encoder.encode(JwtEncoderParameters.from(
                JwsHeader.with(MacAlgorithm.HS256).build(),
                JwtClaimsSet.builder()
                        .issuer(issuer)
                        .subject(account.id().toString())
                        .claim("email", account.email())
                        .issuedAt(now)
                        .expiresAt(accessExpiry)
                        .build())).getTokenValue();

        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String refresh = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        jdbc.update("INSERT INTO refresh_token(token_hash, user_id, expires_at) VALUES (:hash, :userId, :expiresAt)",
                new org.springframework.jdbc.core.namedparam.MapSqlParameterSource()
                        .addValue("hash", hash(refresh)).addValue("userId", account.id())
                        .addValue("expiresAt", Timestamp.from(now.plus(refreshDays, ChronoUnit.DAYS))));
        return new TokenResponse(access, refresh, "Bearer", accessMinutes * 60, account);
    }

    private static String hash(String token) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (Exception exception) {
            throw new IllegalStateException("SHA-256 is not available.", exception);
        }
    }
}
