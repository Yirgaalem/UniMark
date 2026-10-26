package com.unimark.api;

import static com.unimark.api.ApiModels.*;

import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1/folders")
public class FolderController {
    private final FolderService folders;

    public FolderController(FolderService folders) { this.folders = folders; }

    @GetMapping
    public List<FolderResponse> list(@AuthenticationPrincipal Jwt jwt) { return folders.list(userId(jwt)); }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public FolderResponse create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody FolderCreateRequest request) {
        return folders.create(userId(jwt), request);
    }

    @PatchMapping("/{folderId}")
    public FolderResponse rename(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID folderId, @Valid @RequestBody FolderRenameRequest request) {
        return folders.rename(userId(jwt), folderId, request);
    }

    @DeleteMapping("/{folderId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID folderId) { folders.delete(userId(jwt), folderId); }

    private static UUID userId(Jwt jwt) { return UUID.fromString(jwt.getSubject()); }
}
