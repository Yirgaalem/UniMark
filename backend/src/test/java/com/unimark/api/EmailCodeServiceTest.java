package com.unimark.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;

class EmailCodeServiceTest {
    private final NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
    private final TokenService tokens = mock(TokenService.class);
    private final EmailCodeSender sender = mock(EmailCodeSender.class);
    private final EmailCodeService service = new EmailCodeService(jdbc, tokens, sender,
            new SecretKeySpec("test-key-with-at-least-32-characters".getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
    private final UUID userId = UUID.randomUUID();
    private final Instant createdAt = Instant.parse("2026-10-21T12:00:00Z");
    private String storedTokenHash;
    private String storedCodeHash;
    private Instant sentAt;
    private Instant expiresAt;
    private int attempts;
    private String deliveredCode;

    @BeforeEach
    void setUp() throws Exception {
        doAnswer(invocation -> {
            String sql = invocation.getArgument(0);
            Map<String, ?> params = invocation.getArgument(1);
            if (sql.startsWith("SELECT sent_at")) {
                if (sentAt == null) return List.of();
                ResultSet rs = mock(ResultSet.class);
                when(rs.getTimestamp("sent_at")).thenReturn(Timestamp.from(sentAt));
                RowMapper<?> mapper = invocation.getArgument(2);
                return List.of(mapper.mapRow(rs, 0));
            }
            if (storedTokenHash == null || !storedTokenHash.equals(params.get("tokenHash"))) return List.of();
            RowMapper<?> mapper = invocation.getArgument(2);
            ResultSet rs = mock(ResultSet.class);
            when(rs.getObject("id", UUID.class)).thenReturn(userId);
            when(rs.getString("email")).thenReturn("reader@example.com");
            when(rs.getTimestamp("expires_at")).thenReturn(Timestamp.from(expiresAt));
            if (sql.contains("code_hash")) {
                when(rs.getString("username")).thenReturn("reader42");
                when(rs.getTimestamp("created_at")).thenReturn(Timestamp.from(createdAt));
                when(rs.getString("code_hash")).thenReturn(storedCodeHash);
                when(rs.getInt("attempts")).thenReturn(attempts);
            }
            return List.of(mapper.mapRow(rs, 0));
        }).when(jdbc).query(anyString(), anyMap(), any(RowMapper.class));

        doAnswer(invocation -> {
            MapSqlParameterSource params = invocation.getArgument(1);
            storedTokenHash = (String) params.getValue("tokenHash");
            storedCodeHash = (String) params.getValue("codeHash");
            sentAt = ((Timestamp) params.getValue("sentAt")).toInstant();
            expiresAt = ((Timestamp) params.getValue("expiresAt")).toInstant();
            attempts = 0;
            return 1;
        }).when(jdbc).update(anyString(), any(SqlParameterSource.class));

        doAnswer(invocation -> {
            String sql = invocation.getArgument(0);
            if (sql.startsWith("DELETE")) storedTokenHash = null;
            if (sql.startsWith("UPDATE")) attempts++;
            return 1;
        }).when(jdbc).update(anyString(), anyMap());
        doAnswer(invocation -> { deliveredCode = invocation.getArgument(1); return null; })
                .when(sender).send(anyString(), anyString());
    }

    @Test
    void sendsAOneTimeCodeAndIssuesTokensOnlyAfterVerification() {
        var expected = new ApiModels.TokenResponse("access", "refresh", "Bearer", 900, null);
        when(tokens.issue(any(ApiModels.AccountResponse.class))).thenReturn(expected);

        var challenge = service.send(userId, "reader@example.com");
        assertEquals("reader@example.com", challenge.email());
        verify(sender).send("reader@example.com", deliveredCode);
        assertEquals(6, deliveredCode.length());
        assertEquals(expected, service.verify(challenge.challengeToken(), deliveredCode));
        assertThrows(ApiException.class, () -> service.verify(challenge.challengeToken(), deliveredCode));
    }

    @Test
    void wrongCodeCountsAsAnAttemptAndCannotBeUsedAfterFiveTries() {
        var challenge = service.send(userId, "reader@example.com");
        String incorrect = deliveredCode.equals("000000") ? "000001" : "000000";

        for (int attempt = 0; attempt < 5; attempt++) {
            assertThrows(ApiException.class, () -> service.verify(challenge.challengeToken(), incorrect));
        }
        assertEquals(5, attempts);
        assertThrows(ApiException.class, () -> service.verify(challenge.challengeToken(), deliveredCode));
    }

    @Test
    void limitsRequestsToOneCodePerMinutePerAccount() {
        service.send(userId, "reader@example.com");

        ApiException error = assertThrows(ApiException.class, () -> service.send(userId, "reader@example.com"));
        assertEquals(429, error.status().value());
    }

    @Test
    void resendReplacesTheOldCodeAndChallengeAfterTheCooldown() {
        var first = service.send(userId, "reader@example.com");
        sentAt = Instant.now().minusSeconds(61);

        var replacement = service.resend(first.challengeToken());

        org.junit.jupiter.api.Assertions.assertNotEquals(first.challengeToken(), replacement.challengeToken());
        assertThrows(ApiException.class, () -> service.verify(first.challengeToken(), deliveredCode));
    }

    @Test
    void expiredCodeCannotBeVerified() {
        var challenge = service.send(userId, "reader@example.com");
        expiresAt = Instant.now().minusSeconds(1);

        assertThrows(ApiException.class, () -> service.verify(challenge.challengeToken(), deliveredCode));
        assertThrows(ApiException.class, () -> service.verify(challenge.challengeToken(), deliveredCode));
    }
}
