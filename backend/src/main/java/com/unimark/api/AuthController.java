package com.unimark.api;

import static com.unimark.api.ApiModels.*;

import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1")
public class AuthController {
    private final AuthService authService;
    private final TokenService tokenService;
    private final GoogleAuthService googleAuthService;
    private final EmailCodeService emailCodes;

    public AuthController(AuthService authService, TokenService tokenService, GoogleAuthService googleAuthService, EmailCodeService emailCodes) {
        this.authService = authService;
        this.tokenService = tokenService;
        this.googleAuthService = googleAuthService;
        this.emailCodes = emailCodes;
    }

    @PostMapping("/auth/register")
    @ResponseStatus(HttpStatus.CREATED)
    public EmailCodeChallengeResponse register(@Valid @RequestBody RegisterRequest request) { return authService.register(request); }

    @PostMapping("/auth/login")
    public LoginResponse login(@Valid @RequestBody LoginRequest request) { return authService.login(request); }

    @PostMapping("/auth/email-code/verify")
    public TokenResponse verifyEmailCode(@Valid @RequestBody EmailCodeVerifyRequest request) {
        return emailCodes.verify(request.token(), request.code());
    }

    @PostMapping("/auth/email-code/resend")
    public EmailCodeChallengeResponse resendEmailCode(@Valid @RequestBody EmailCodeResendRequest request) {
        return emailCodes.resend(request.token());
    }

    @PostMapping("/auth/google")
    public LoginResponse googleLogin(@Valid @RequestBody GoogleLoginRequest request) {
        return googleAuthService.authenticate(request.idToken());
    }

    @PostMapping("/auth/refresh")
    public TokenResponse refresh(@Valid @RequestBody RefreshRequest request) { return tokenService.refresh(request.refreshToken()); }

    @PostMapping("/auth/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody LogoutRequest request) {
        tokenService.revoke(request.refreshToken(), UUID.fromString(jwt.getSubject()));
    }

    @GetMapping("/me")
    public AccountResponse me(@AuthenticationPrincipal Jwt jwt) { return authService.findAccount(UUID.fromString(jwt.getSubject())); }

    @org.springframework.web.bind.annotation.PatchMapping("/me")
    public AccountResponse updateUsername(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody UsernameUpdateRequest request) {
        return authService.updateUsername(UUID.fromString(jwt.getSubject()), request);
    }
}
