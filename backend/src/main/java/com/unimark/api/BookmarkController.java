package com.unimark.api;

import static com.unimark.api.ApiModels.*;

import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1/bookmarks")
public class BookmarkController {
    private final BookmarkService bookmarks;

    public BookmarkController(BookmarkService bookmarks) { this.bookmarks = bookmarks; }

    @GetMapping
    public BookmarkPage list(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false) UUID folderId,
            @RequestParam(required = false) String platform,
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "30") int limit) {
        return bookmarks.list(userId(jwt), folderId, platform, cursor, limit);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public BookmarkResponse create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody BookmarkCreateRequest request) {
        return bookmarks.create(userId(jwt), request);
    }

    @GetMapping("/{bookmarkId}")
    public BookmarkResponse get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID bookmarkId) {
        return bookmarks.get(userId(jwt), bookmarkId);
    }

    @PostMapping("/{bookmarkId}/preview/refresh")
    public BookmarkResponse refreshPreview(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID bookmarkId) {
        return bookmarks.refreshPreview(userId(jwt), bookmarkId);
    }

    @PatchMapping("/{bookmarkId}")
    public BookmarkResponse update(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID bookmarkId,
            @Valid @RequestBody BookmarkPatchRequest request) {
        return bookmarks.update(userId(jwt), bookmarkId, request);
    }

    @PutMapping("/{bookmarkId}/folders")
    public BookmarkResponse replaceFolders(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID bookmarkId,
            @RequestBody FolderMembershipRequest request) {
        return bookmarks.replaceFolders(userId(jwt), bookmarkId, request.folderIds());
    }

    @DeleteMapping("/{bookmarkId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID bookmarkId) {
        bookmarks.delete(userId(jwt), bookmarkId);
    }

    private static UUID userId(Jwt jwt) { return UUID.fromString(jwt.getSubject()); }
}
