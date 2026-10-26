package com.unimark.api;

import static com.unimark.api.ApiModels.*;

import java.time.Instant;
import java.sql.Timestamp;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {
    private final NamedParameterJdbcTemplate jdbc;
    private final PasswordEncoder passwordEncoder;
    private final EmailCodeService emailCodes;

    public AuthService(NamedParameterJdbcTemplate jdbc, PasswordEncoder passwordEncoder, EmailCodeService emailCodes) {
        this.jdbc = jdbc;
        this.passwordEncoder = passwordEncoder;
        this.emailCodes = emailCodes;
    }

    @Transactional
    public EmailCodeChallengeResponse register(RegisterRequest request) {
        String email = normalizeEmail(request.email());
        if (request.password().getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 72) {
            throw ApiException.badRequest("Password must be no longer than 72 UTF-8 bytes.");
        }
        UUID id = UUID.randomUUID();
        Instant now = Instant.now();
        try {
            jdbc.update("INSERT INTO app_user(id, email, password_hash, created_at, updated_at) VALUES (:id, :email, :passwordHash, :now, :now)",
                    new MapSqlParameterSource().addValue("id", id).addValue("email", email)
                            .addValue("passwordHash", passwordEncoder.encode(request.password())).addValue("now", Timestamp.from(now)));
        } catch (DuplicateKeyException exception) {
            throw ApiException.conflict("An account with this email already exists.");
        }
        return emailCodes.send(id, email);
    }

    public LoginResponse login(LoginRequest request) {
        String identifier = request.identifier().trim().toLowerCase(java.util.Locale.ROOT);
        var users = jdbc.query("SELECT id, email, password_hash, username FROM app_user "
                        + "WHERE email = :identifier OR lower(username) = :identifier",
                Map.of("identifier", identifier), (rs, row) -> new Object[] {
                        rs.getObject("id", UUID.class), rs.getString("email"), rs.getString("password_hash"), rs.getString("username")
                });
        if (users.isEmpty() || users.get(0)[2] == null || !passwordEncoder.matches(request.password(), (String) users.get(0)[2])) {
            throw ApiException.unauthorized("Invalid email or password.");
        }
        Object[] user = users.get(0);
        return new LoginResponse(emailCodes.send((UUID) user[0], (String) user[1]), null);
    }

    public AccountResponse findAccount(UUID userId) {
        var accounts = jdbc.query("SELECT id, email, username, created_at FROM app_user WHERE id = :id",
                Map.of("id", userId), (rs, row) -> new AccountResponse(
                        rs.getObject("id", UUID.class), rs.getString("email"), rs.getString("username"), rs.getTimestamp("created_at").toInstant()));
        if (accounts.isEmpty()) throw ApiException.notFound();
        return accounts.get(0);
    }

    @Transactional
    public AccountResponse updateUsername(UUID userId, UsernameUpdateRequest request) {
        String username = request.username().trim();
        try {
            jdbc.update("UPDATE app_user SET username = :username, updated_at = now() WHERE id = :id",
                    new MapSqlParameterSource().addValue("username", username).addValue("id", userId));
        } catch (DuplicateKeyException exception) {
            throw ApiException.conflict("That username is already taken. Try another one.");
        }
        return findAccount(userId);
    }

    private static String normalizeEmail(String value) { return value.trim().toLowerCase(java.util.Locale.ROOT); }
}
