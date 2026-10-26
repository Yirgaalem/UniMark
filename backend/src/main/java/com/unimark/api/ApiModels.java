package com.unimark.api;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class ApiModels {
    private ApiModels() {}

    public record RegisterRequest(
            @NotBlank @Email @Size(max = 320) String email,
            @NotBlank @Size(min = 10, max = 72) String password) {}

    public record LoginRequest(
            @NotBlank @Size(max = 320) String identifier,
            @NotBlank @Size(max = 72) String password) {}

    public record EmailCodeVerifyRequest(@NotBlank String token, @NotBlank @Pattern(regexp = "^[0-9]{6}$", message = "Enter the 6-digit email code.") String code) {}

    public record EmailCodeResendRequest(@NotBlank String token) {}

    public record EmailCodeChallengeResponse(String challengeToken, String email) {}

    public record LoginResponse(EmailCodeChallengeResponse emailCode, TokenResponse tokens) {}

    public record GoogleLoginRequest(@NotBlank String idToken) {}

    public record UsernameUpdateRequest(
            @NotBlank @Pattern(regexp = "^[A-Za-z0-9_]{3,24}$", message = "Username must be 3–24 characters using letters, numbers, or underscores.") String username) {}

    public record RefreshRequest(@NotBlank String refreshToken) {}

    public record LogoutRequest(@NotBlank String refreshToken) {}

    public record AccountResponse(UUID id, String email, String username, Instant createdAt) {}

    public record TokenResponse(
            String accessToken,
            String refreshToken,
            String tokenType,
            long expiresIn,
            AccountResponse account) {}

    public record BookmarkCreateRequest(
            @NotBlank @Size(max = 4096) String originalUrl,
            @Size(max = 300) String customTitle,
            @Size(max = 5000) String userNotes,
            List<UUID> folderIds) {}

    // Null means unchanged; an empty string clears either optional field.
    public record BookmarkPatchRequest(
            @Size(max = 300) String customTitle,
            @Size(max = 5000) String userNotes) {}

    public record FolderMembershipRequest(List<UUID> folderIds) {}

    public record BookmarkResponse(
            UUID id,
            String originalUrl,
            String sourcePlatform,
            String originalTitle,
            String customTitle,
            String description,
            String thumbnailUrl,
            Integer videoDurationSeconds,
            String contentType,
            String userNotes,
            Instant savedAt,
            List<UUID> folderIds) {}

    public record BookmarkPage(List<BookmarkResponse> items, String nextCursor) {}

    public record FolderCreateRequest(@NotBlank @Size(max = 120) String name) {}

    public record FolderRenameRequest(@NotBlank @Size(max = 120) String name) {}

    public record FolderResponse(UUID id, String name, long bookmarkCount, Instant createdAt, Instant updatedAt) {}

    public record ErrorResponse(String type, String title, int status, String detail, List<FieldError> fieldErrors) {}

    public record FieldError(String field, String message) {}
}
