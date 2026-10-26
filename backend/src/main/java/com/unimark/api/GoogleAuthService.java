package com.unimark.api;

import static com.unimark.api.ApiModels.AccountResponse;
import static com.unimark.api.ApiModels.LoginResponse;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class GoogleAuthService {
    private final NamedParameterJdbcTemplate jdbc;
    private final EmailCodeService emailCodes;
    private final ObjectProvider<JwtDecoder> tokenDecoder;
    private final String googleClientId;

    public GoogleAuthService(
            NamedParameterJdbcTemplate jdbc,
            EmailCodeService emailCodes,
            @Qualifier("googleIdTokenDecoder") ObjectProvider<JwtDecoder> tokenDecoder,
            @Value("${unimark.google.client-id:}") String googleClientId) {
        this.jdbc = jdbc;
        this.emailCodes = emailCodes;
        this.tokenDecoder = tokenDecoder;
        this.googleClientId = googleClientId;
    }

    @Transactional
    public LoginResponse authenticate(String presentedIdToken) {
        if (googleClientId.isBlank()) {
            throw ApiException.badRequest("Google sign-in is not configured. Set GOOGLE_CLIENT_ID and the mobile web client ID.");
        }

        Jwt jwt;
        try {
            JwtDecoder decoder = tokenDecoder.getIfAvailable();
            if (decoder == null) throw new IllegalStateException("Google token verifier is not configured.");
            jwt = decoder.decode(presentedIdToken);
        } catch (Exception exception) {
            throw ApiException.unauthorized("Google could not verify this sign-in. Please try again.");
        }

        String subject = jwt.getSubject();
        String email = jwt.getClaimAsString("email");
        Boolean emailVerified = jwt.getClaim("email_verified");
        if (subject == null || subject.isBlank() || email == null || email.isBlank() || !Boolean.TRUE.equals(emailVerified)) {
            throw ApiException.unauthorized("Google did not provide a verified email address.");
        }
        email = email.trim().toLowerCase(java.util.Locale.ROOT);
        Instant now = Instant.now();

        var linkedAccounts = jdbc.query(
                "SELECT id, email, username, created_at FROM app_user WHERE google_subject = :subject",
                Map.of("subject", subject), (rs, row) -> new Object[] {
                        new AccountResponse(rs.getObject("id", UUID.class), rs.getString("email"), rs.getString("username"), rs.getTimestamp("created_at").toInstant())
                });
        if (!linkedAccounts.isEmpty()) {
            Object[] linked = linkedAccounts.get(0);
            return respond((AccountResponse) linked[0]);
        }

        var emailAccounts = jdbc.query(
                "SELECT id, email, username, google_subject, created_at FROM app_user WHERE email = :email",
                Map.of("email", email), (rs, row) -> new Object[] {
                        rs.getObject("id", UUID.class), rs.getString("email"), rs.getString("username"), rs.getString("google_subject"),
                        rs.getTimestamp("created_at").toInstant()
                });
        if (!emailAccounts.isEmpty()) {
            Object[] existing = emailAccounts.get(0);
            if (existing[3] != null) throw ApiException.conflict("This email is already linked to a different Google account.");
            UUID id = (UUID) existing[0];
            int linked = jdbc.update("UPDATE app_user SET google_subject = :subject, updated_at = :now WHERE id = :id AND google_subject IS NULL",
                    new MapSqlParameterSource().addValue("subject", subject).addValue("now", Timestamp.from(now)).addValue("id", id));
            if (linked != 1) throw ApiException.conflict("This email was linked to another Google account. Please try again.");
            AccountResponse account = new AccountResponse(id, (String) existing[1], (String) existing[2], (Instant) existing[4]);
            return respond(account);
        }

        UUID id = UUID.randomUUID();
        try {
            jdbc.update("INSERT INTO app_user(id, email, password_hash, google_subject, created_at, updated_at) "
                            + "VALUES (:id, :email, NULL, :subject, :now, :now)",
                    new MapSqlParameterSource().addValue("id", id).addValue("email", email)
                            .addValue("subject", subject).addValue("now", Timestamp.from(now)));
        } catch (DuplicateKeyException exception) {
            throw ApiException.conflict("An account with this Google email already exists. Please try signing in again.");
        }
        return respond(new AccountResponse(id, email, null, now));
    }

    private LoginResponse respond(AccountResponse account) {
        return new LoginResponse(emailCodes.send(account.id(), account.email()), null);
    }
}
