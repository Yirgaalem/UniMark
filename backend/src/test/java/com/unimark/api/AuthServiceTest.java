package com.unimark.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.sql.ResultSet;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;

class AuthServiceTest {
    private final NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
    private final PasswordEncoder passwords = mock(PasswordEncoder.class);
    private final EmailCodeService emailCodes = mock(EmailCodeService.class);
    private final AuthService service = new AuthService(jdbc, passwords, emailCodes);
    private final UUID userId = UUID.randomUUID();

    @BeforeEach
    void setUp() throws Exception {
        doAnswer(invocation -> {
            Map<String, ?> params = invocation.getArgument(1);
            assertEquals("reader42", params.get("identifier"));
            RowMapper<?> mapper = invocation.getArgument(2);
            ResultSet rs = mock(ResultSet.class);
            when(rs.getObject("id", UUID.class)).thenReturn(userId);
            when(rs.getString("email")).thenReturn("reader@example.com");
            when(rs.getString("password_hash")).thenReturn("password-hash");
            return java.util.List.of(mapper.mapRow(rs, 0));
        }).when(jdbc).query(anyString(), anyMap(), any(RowMapper.class));
        when(passwords.matches("correct-password", "password-hash")).thenReturn(true);
    }

    @Test
    void acceptsUsernameAndEmailsCodeBeforeIssuingTokens() {
        var challenge = new ApiModels.EmailCodeChallengeResponse("challenge-token", "reader@example.com");
        when(emailCodes.send(userId, "reader@example.com")).thenReturn(challenge);

        ApiModels.LoginResponse result = service.login(new ApiModels.LoginRequest("  Reader42  ", "correct-password"));

        assertEquals(challenge, result.emailCode());
        assertNull(result.tokens());
        verify(passwords).matches("correct-password", "password-hash");
        verify(emailCodes).send(userId, "reader@example.com");
    }

    @Test
    void incorrectPasswordDoesNotSendCode() {
        assertThrows(ApiException.class, () -> service.login(new ApiModels.LoginRequest("reader42", "wrong-password")));
        verify(emailCodes, never()).send(any(), anyString());
    }
}
