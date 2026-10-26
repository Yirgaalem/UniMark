package com.unimark.api;

import static com.unimark.api.ApiModels.*;

import java.net.URI;
import java.net.URISyntaxException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class BookmarkService {
    private final NamedParameterJdbcTemplate jdbc;
    private final LinkPreviewService previews;

    public BookmarkService(NamedParameterJdbcTemplate jdbc, LinkPreviewService previews) {
        this.jdbc = jdbc;
        this.previews = previews;
    }

    @Transactional
    public BookmarkResponse create(UUID userId, BookmarkCreateRequest request) {
        String url = validateUrl(request.originalUrl());
        LinkPreviewService.Preview preview = previews.fetch(url);
        List<UUID> folders = validateFolders(userId, request.folderIds());
        UUID id = UUID.randomUUID();
        Instant now = Instant.now();
        jdbc.update("INSERT INTO bookmark(id, user_id, original_url, normalized_url, source_platform, original_title, custom_title, description, thumbnail_url, video_duration_seconds, content_type, user_notes, preview_checked_at, saved_at, created_at, updated_at) " +
                        "VALUES (:id, :userId, :url, :normalizedUrl, :platform, :originalTitle, :customTitle, :description, :thumbnailUrl, :videoDurationSeconds, :contentType, :userNotes, :now, :now, :now, :now)",
                new MapSqlParameterSource().addValue("id", id).addValue("userId", userId).addValue("url", url)
                        .addValue("normalizedUrl", normalizeUrl(url)).addValue("platform", sourcePlatform(url))
                        .addValue("originalTitle", preview.title()).addValue("customTitle", clean(request.customTitle()))
                        .addValue("description", preview.description()).addValue("thumbnailUrl", preview.thumbnailUrl())
                        .addValue("videoDurationSeconds", preview.videoDurationSeconds())
                        .addValue("contentType", preview.contentType()).addValue("userNotes", clean(request.userNotes())).addValue("now", Timestamp.from(now)));
        addMemberships(id, userId, folders);
        return get(userId, id);
    }

    public BookmarkPage list(UUID userId, UUID folderId, String platform, String cursor, int requestedLimit) {
        int limit = Math.max(1, Math.min(requestedLimit, 100));
        String normalizedPlatform = normalizePlatform(platform);
        Cursor decoded = cursor == null || cursor.isBlank() ? null : decodeCursor(cursor);
        StringBuilder sql = new StringBuilder("SELECT b.id, b.original_url, b.source_platform, b.original_title, b.custom_title, b.description, b.thumbnail_url, b.video_duration_seconds, b.content_type, b.user_notes, b.saved_at " +
                "FROM bookmark b WHERE b.user_id = :userId");
        MapSqlParameterSource params = new MapSqlParameterSource("userId", userId).addValue("fetchLimit", limit + 1);
        if (folderId != null) {
            sql.append(" AND EXISTS (SELECT 1 FROM bookmark_folder bf WHERE bf.bookmark_id = b.id AND bf.user_id = b.user_id AND bf.folder_id = :folderId)");
            params.addValue("folderId", folderId);
        }
        if (normalizedPlatform != null) {
            sql.append(" AND b.source_platform = :platform");
            params.addValue("platform", normalizedPlatform);
        }
        if (decoded != null) {
            sql.append(" AND (b.saved_at < :cursorTime OR (b.saved_at = :cursorTime AND b.id < :cursorId))");
            params.addValue("cursorTime", Timestamp.from(decoded.savedAt())).addValue("cursorId", decoded.id());
        }
        sql.append(" ORDER BY b.saved_at DESC, b.id DESC LIMIT :fetchLimit");
        List<BookmarkRow> rows = jdbc.query(sql.toString(), params, (rs, row) -> new BookmarkRow(
                rs.getObject("id", UUID.class), rs.getString("original_url"), rs.getString("source_platform"),
                rs.getString("original_title"), rs.getString("custom_title"), rs.getString("description"),
                rs.getString("thumbnail_url"), (Integer) rs.getObject("video_duration_seconds"), rs.getString("content_type"), rs.getString("user_notes"), rs.getTimestamp("saved_at").toInstant()));
        boolean hasMore = rows.size() > limit;
        List<BookmarkRow> pageRows = hasMore ? rows.subList(0, limit) : rows;
        List<BookmarkResponse> items = toResponses(userId, pageRows);
        String next = hasMore && !pageRows.isEmpty() ? encodeCursor(pageRows.get(pageRows.size() - 1)) : null;
        return new BookmarkPage(items, next);
    }

    public BookmarkResponse get(UUID userId, UUID bookmarkId) {
        List<BookmarkRow> rows = jdbc.query("SELECT id, original_url, source_platform, original_title, custom_title, description, thumbnail_url, video_duration_seconds, content_type, user_notes, saved_at " +
                        "FROM bookmark WHERE id = :id AND user_id = :userId",
                new MapSqlParameterSource().addValue("id", bookmarkId).addValue("userId", userId),
                (rs, row) -> new BookmarkRow(rs.getObject("id", UUID.class), rs.getString("original_url"), rs.getString("source_platform"),
                        rs.getString("original_title"), rs.getString("custom_title"), rs.getString("description"), rs.getString("thumbnail_url"), (Integer) rs.getObject("video_duration_seconds"),
                        rs.getString("content_type"), rs.getString("user_notes"), rs.getTimestamp("saved_at").toInstant()));
        if (rows.isEmpty()) throw ApiException.notFound();
        return toResponses(userId, rows).get(0);
    }

    @Transactional
    public BookmarkResponse refreshPreview(UUID userId, UUID bookmarkId) {
        List<PreviewRefreshRow> rows = jdbc.query("SELECT original_url, preview_checked_at FROM bookmark WHERE id = :id AND user_id = :userId",
                new MapSqlParameterSource().addValue("id", bookmarkId).addValue("userId", userId),
                (rs, row) -> new PreviewRefreshRow(rs.getString("original_url"),
                        rs.getTimestamp("preview_checked_at") == null ? null : rs.getTimestamp("preview_checked_at").toInstant()));
        if (rows.isEmpty()) throw ApiException.notFound();
        PreviewRefreshRow existing = rows.get(0);
        Instant now = Instant.now();
        if (existing.checkedAt() != null && existing.checkedAt().isAfter(now.minusSeconds(86400))) return get(userId, bookmarkId);

        LinkPreviewService.Preview preview = previews.fetch(existing.url());
        jdbc.update("UPDATE bookmark SET original_title = COALESCE(original_title, :title), " +
                        "description = COALESCE(description, :description), thumbnail_url = COALESCE(thumbnail_url, :thumbnailUrl), " +
                        "video_duration_seconds = COALESCE(video_duration_seconds, :duration), " +
                        "content_type = CASE WHEN content_type = 'unknown' THEN :contentType ELSE content_type END, " +
                        "preview_checked_at = :checkedAt, updated_at = :checkedAt WHERE id = :id AND user_id = :userId",
                new MapSqlParameterSource().addValue("title", preview.title()).addValue("description", preview.description())
                        .addValue("thumbnailUrl", preview.thumbnailUrl()).addValue("duration", preview.videoDurationSeconds())
                        .addValue("contentType", preview.contentType()).addValue("checkedAt", Timestamp.from(now))
                        .addValue("id", bookmarkId).addValue("userId", userId));
        return get(userId, bookmarkId);
    }

    @Transactional
    public BookmarkResponse update(UUID userId, UUID bookmarkId, BookmarkPatchRequest request) {
        get(userId, bookmarkId);
        if (request.customTitle() == null && request.userNotes() == null) return get(userId, bookmarkId);
        StringBuilder sql = new StringBuilder("UPDATE bookmark SET updated_at = now()");
        MapSqlParameterSource params = new MapSqlParameterSource().addValue("id", bookmarkId).addValue("userId", userId);
        if (request.customTitle() != null) {
            sql.append(", custom_title = :customTitle");
            params.addValue("customTitle", clean(request.customTitle()));
        }
        if (request.userNotes() != null) {
            sql.append(", user_notes = :userNotes");
            params.addValue("userNotes", clean(request.userNotes()));
        }
        sql.append(" WHERE id = :id AND user_id = :userId");
        jdbc.update(sql.toString(), params);
        return get(userId, bookmarkId);
    }

    @Transactional
    public BookmarkResponse replaceFolders(UUID userId, UUID bookmarkId, List<UUID> folderIds) {
        get(userId, bookmarkId);
        List<UUID> folders = validateFolders(userId, folderIds);
        jdbc.update("DELETE FROM bookmark_folder WHERE bookmark_id = :bookmarkId AND user_id = :userId",
                new MapSqlParameterSource().addValue("bookmarkId", bookmarkId).addValue("userId", userId));
        addMemberships(bookmarkId, userId, folders);
        jdbc.update("UPDATE bookmark SET updated_at = now() WHERE id = :id AND user_id = :userId",
                new MapSqlParameterSource().addValue("id", bookmarkId).addValue("userId", userId));
        return get(userId, bookmarkId);
    }

    @Transactional
    public void delete(UUID userId, UUID bookmarkId) {
        int deleted = jdbc.update("DELETE FROM bookmark WHERE id = :id AND user_id = :userId",
                new MapSqlParameterSource().addValue("id", bookmarkId).addValue("userId", userId));
        if (deleted == 0) throw ApiException.notFound();
    }

    private List<BookmarkResponse> toResponses(UUID userId, List<BookmarkRow> rows) {
        if (rows.isEmpty()) return List.of();
        List<UUID> ids = rows.stream().map(BookmarkRow::id).toList();
        Map<UUID, List<UUID>> folders = new java.util.HashMap<>();
        jdbc.query("SELECT bookmark_id, folder_id FROM bookmark_folder WHERE user_id = :userId AND bookmark_id IN (:ids) ORDER BY folder_id",
                new MapSqlParameterSource().addValue("userId", userId).addValue("ids", ids),
                (org.springframework.jdbc.core.RowCallbackHandler) rs -> {
                    folders.computeIfAbsent(rs.getObject("bookmark_id", UUID.class), ignored -> new ArrayList<>())
                            .add(rs.getObject("folder_id", UUID.class));
                });
        return rows.stream().map(row -> new BookmarkResponse(row.id(), row.url(), row.platform(), row.originalTitle(), row.customTitle(),
                row.description(), row.thumbnailUrl(), row.videoDurationSeconds(), row.contentType(), row.notes(), row.savedAt(), folders.getOrDefault(row.id(), List.of()))).toList();
    }

    private List<UUID> validateFolders(UUID userId, List<UUID> requested) {
        if (requested == null || requested.isEmpty()) return List.of();
        List<UUID> ids = List.copyOf(new LinkedHashSet<>(requested));
        List<UUID> found = jdbc.query("SELECT id FROM folder WHERE user_id = :userId AND id IN (:ids)",
                new MapSqlParameterSource().addValue("userId", userId).addValue("ids", ids), (rs, row) -> rs.getObject("id", UUID.class));
        if (found.size() != ids.size()) throw ApiException.badRequest("One or more folders do not belong to this account.");
        return ids;
    }

    private void addMemberships(UUID bookmarkId, UUID userId, List<UUID> folderIds) {
        for (UUID folderId : folderIds) {
            jdbc.update("INSERT INTO bookmark_folder(bookmark_id, folder_id, user_id) VALUES (:bookmarkId, :folderId, :userId)",
                    new MapSqlParameterSource().addValue("bookmarkId", bookmarkId).addValue("folderId", folderId).addValue("userId", userId));
        }
    }

    static String validateUrl(String value) {
        try {
            URI uri = new URI(value.trim());
            String scheme = uri.getScheme();
            if (scheme == null || !(scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https")) || uri.getHost() == null || uri.getUserInfo() != null) {
                throw ApiException.badRequest("Must be a valid http or https URL without embedded credentials.");
            }
            return uri.toASCIIString();
        } catch (URISyntaxException exception) {
            throw ApiException.badRequest("Must be a valid http or https URL without embedded credentials.");
        }
    }

    static String normalizeUrl(String value) {
        try {
            URI uri = new URI(value);
            int port = uri.getPort();
            if ((uri.getScheme().equalsIgnoreCase("http") && port == 80) || (uri.getScheme().equalsIgnoreCase("https") && port == 443)) port = -1;
            return new URI(uri.getScheme().toLowerCase(java.util.Locale.ROOT), null,
                    uri.getHost().toLowerCase(java.util.Locale.ROOT), port, uri.getPath(), uri.getQuery(), null).toASCIIString();
        } catch (Exception exception) { return value; }
    }

    static String sourcePlatform(String value) {
        String host;
        try { host = new URI(value).getHost().toLowerCase(java.util.Locale.ROOT).replaceFirst("^www\\.", ""); }
        catch (Exception exception) { return "unknown"; }
        if (host.equals("tiktok.com") || host.endsWith(".tiktok.com")) return "tiktok";
        if (host.equals("instagram.com") || host.endsWith(".instagram.com")) return "instagram";
        if (host.equals("youtube.com") || host.endsWith(".youtube.com") || host.equals("youtu.be")) return "youtube";
        if (host.equals("reddit.com") || host.endsWith(".reddit.com") || host.equals("redd.it")) return "reddit";
        if (host.equals("x.com") || host.endsWith(".x.com") || host.equals("twitter.com") || host.endsWith(".twitter.com")) return "x";
        return "web";
    }

    private static String normalizePlatform(String platform) {
        if (platform == null || platform.isBlank()) return null;
        String value = platform.trim().toLowerCase(java.util.Locale.ROOT);
        if (!Set.of("unknown", "tiktok", "instagram", "youtube", "reddit", "x", "web").contains(value)) {
            throw ApiException.badRequest("Unsupported platform filter.");
        }
        return value;
    }

    private static String clean(String value) { return value == null || value.isBlank() ? null : value.trim(); }
    private static String encodeCursor(BookmarkRow row) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString((row.savedAt() + "|" + row.id()).getBytes(StandardCharsets.UTF_8));
    }
    private static Cursor decodeCursor(String encoded) {
        try {
            String[] fields = new String(Base64.getUrlDecoder().decode(encoded), StandardCharsets.UTF_8).split("\\|", 2);
            return new Cursor(Instant.parse(fields[0]), UUID.fromString(fields[1]));
        } catch (Exception exception) { throw ApiException.badRequest("Bookmark cursor is invalid."); }
    }

    private record Cursor(Instant savedAt, UUID id) {}
    private record PreviewRefreshRow(String url, Instant checkedAt) {}
    private record BookmarkRow(UUID id, String url, String platform, String originalTitle, String customTitle,
            String description, String thumbnailUrl, Integer videoDurationSeconds, String contentType, String notes, Instant savedAt) {}
}
