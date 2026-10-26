package com.unimark.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;

class BookmarkServiceTest {
    private final NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
    private final LinkPreviewService previews = mock(LinkPreviewService.class);
    private final UUID userId = UUID.randomUUID();
    private final UUID folderId = UUID.randomUUID();
    private BookmarkService service;
    private UUID bookmarkId;
    private String savedUrl;
    private String savedPlatform;
    private String savedOriginalTitle;
    private String savedCustomTitle;
    private String savedDescription;
    private String savedThumbnail;
    private Integer savedDuration;
    private String savedContentType;
    private String savedNotes;
    private List<UUID> validFolders;
    private List<UUID> memberships;
    private int deletedRows = 1;

    @BeforeEach
    void setUp() throws Exception {
        service = new BookmarkService(jdbc, previews);
        validFolders = List.of(folderId);
        memberships = new ArrayList<>();
        doAnswer(invocation -> {
            String sql = invocation.getArgument(0);
            RowMapper<?> mapper = invocation.getArgument(2);
            if (sql.startsWith("SELECT id FROM folder")) {
                List<Object> rows = new ArrayList<>();
                for (UUID id : validFolders) rows.add(mapper.mapRow(folderResult(id), 0));
                return rows;
            }
            return List.of(mapper.mapRow(bookmarkResult(), 0));
        }).when(jdbc).query(anyString(), any(SqlParameterSource.class), any(RowMapper.class));

        doAnswer(invocation -> {
            RowCallbackHandler callback = invocation.getArgument(2);
            for (UUID id : memberships) {
                ResultSet rs = mock(ResultSet.class);
                when(rs.getObject("bookmark_id", UUID.class)).thenReturn(bookmarkId);
                when(rs.getObject("folder_id", UUID.class)).thenReturn(id);
                callback.processRow(rs);
            }
            return null;
        }).when(jdbc).query(anyString(), any(SqlParameterSource.class), any(RowCallbackHandler.class));

        doAnswer(invocation -> {
            String sql = invocation.getArgument(0);
            MapSqlParameterSource params = invocation.getArgument(1);
            if (sql.startsWith("INSERT INTO bookmark(")) {
                bookmarkId = (UUID) params.getValue("id");
                savedUrl = (String) params.getValue("url");
                savedPlatform = (String) params.getValue("platform");
                savedOriginalTitle = (String) params.getValue("originalTitle");
                savedCustomTitle = (String) params.getValue("customTitle");
                savedDescription = (String) params.getValue("description");
                savedThumbnail = (String) params.getValue("thumbnailUrl");
                savedDuration = (Integer) params.getValue("videoDurationSeconds");
                savedContentType = (String) params.getValue("contentType");
                savedNotes = (String) params.getValue("userNotes");
                memberships = new ArrayList<>();
            } else if (sql.startsWith("INSERT INTO bookmark_folder")) {
                memberships.add((UUID) params.getValue("folderId"));
            } else if (sql.startsWith("UPDATE bookmark SET updated_at = now(), custom_title")) {
                savedCustomTitle = (String) params.getValue("customTitle");
            } else if (sql.startsWith("DELETE FROM bookmark_folder")) {
                memberships.clear();
            } else if (sql.startsWith("DELETE FROM bookmark WHERE")) {
                return deletedRows;
            }
            return 1;
        }).when(jdbc).update(anyString(), any(SqlParameterSource.class));
    }

    @Test
    void savingLinkStoresPreviewSourceAndFolderMembership() {
        String url = "https://www.youtube.com/shorts/clip?id=7#share";
        when(previews.fetch(url)).thenReturn(new LinkPreviewService.Preview(
                "A useful clip", "A short summary", "https://img.example/clip.jpg", 95, "video"));

        ApiModels.BookmarkResponse saved = service.create(userId,
                new ApiModels.BookmarkCreateRequest(url, "  My title  ", "  Keep this note  ", List.of(folderId)));

        assertEquals(url, savedUrl);
        assertEquals("youtube", savedPlatform);
        assertEquals("A useful clip", savedOriginalTitle);
        assertEquals("My title", savedCustomTitle);
        assertEquals("A short summary", savedDescription);
        assertEquals("https://img.example/clip.jpg", savedThumbnail);
        assertEquals(95, savedDuration);
        assertEquals("video", savedContentType);
        assertEquals("Keep this note", savedNotes);
        assertEquals(List.of(folderId), saved.folderIds());
        verify(jdbc).update(contains("INSERT INTO bookmark("), any(SqlParameterSource.class));
        verify(jdbc).update(contains("INSERT INTO bookmark_folder"), any(SqlParameterSource.class));
    }

    @Test
    void changingTitleWritesOnlyTheTitleAndKeepsItTrimmed() {
        bookmarkId = UUID.randomUUID();
        savedUrl = "https://example.com/article";
        savedPlatform = "web";
        savedOriginalTitle = "Article title";
        savedCustomTitle = null;
        savedContentType = "article";
        when(previews.fetch(anyString())).thenReturn(new LinkPreviewService.Preview(null, null, null, null, "unknown"));

        ApiModels.BookmarkResponse updated = service.update(userId, bookmarkId,
                new ApiModels.BookmarkPatchRequest("  Short name  ", null));

        assertEquals("Short name", savedCustomTitle);
        assertEquals("https://example.com/article", updated.originalUrl());
        verify(jdbc).update(contains("custom_title = :customTitle"), any(SqlParameterSource.class));
    }

    @Test
    void addingFolderMembershipReplacesThePreviousSet() {
        bookmarkId = UUID.randomUUID();
        savedUrl = "https://example.com/article";
        savedPlatform = "web";
        savedContentType = "article";
        memberships = new ArrayList<>(List.of(UUID.randomUUID()));

        ApiModels.BookmarkResponse updated = service.replaceFolders(userId, bookmarkId, List.of(folderId));

        assertEquals(List.of(folderId), updated.folderIds());
        verify(jdbc).update(contains("DELETE FROM bookmark_folder"), any(SqlParameterSource.class));
        verify(jdbc).update(contains("INSERT INTO bookmark_folder"), any(SqlParameterSource.class));
    }

    @Test
    void rejectsFolderMembershipOwnedByAnotherAccount() {
        bookmarkId = UUID.randomUUID();
        savedUrl = "https://example.com/article";
        savedPlatform = "web";
        savedContentType = "article";
        validFolders = List.of();

        assertThrows(ApiException.class, () -> service.replaceFolders(userId, bookmarkId, List.of(folderId)));
    }

    @Test
    void deletesOnlyTheCurrentUsersBookmark() {
        bookmarkId = UUID.randomUUID();

        service.delete(userId, bookmarkId);

        verify(jdbc).update(contains("DELETE FROM bookmark WHERE id = :id AND user_id = :userId"), any(SqlParameterSource.class));
    }

    @Test
    void deletingAnotherUsersOrMissingBookmarkReturnsNotFound() {
        bookmarkId = UUID.randomUUID();
        deletedRows = 0;

        assertThrows(ApiException.class, () -> service.delete(userId, bookmarkId));
    }

    private ResultSet bookmarkResult() throws Exception {
        ResultSet rs = mock(ResultSet.class);
        when(rs.getObject("id", UUID.class)).thenReturn(bookmarkId);
        when(rs.getString("original_url")).thenReturn(savedUrl);
        when(rs.getString("source_platform")).thenReturn(savedPlatform);
        when(rs.getString("original_title")).thenReturn(savedOriginalTitle);
        when(rs.getString("custom_title")).thenReturn(savedCustomTitle);
        when(rs.getString("description")).thenReturn(savedDescription);
        when(rs.getString("thumbnail_url")).thenReturn(savedThumbnail);
        when(rs.getObject("video_duration_seconds")).thenReturn(savedDuration);
        when(rs.getString("content_type")).thenReturn(savedContentType);
        when(rs.getString("user_notes")).thenReturn(savedNotes);
        when(rs.getTimestamp("saved_at")).thenReturn(Timestamp.from(Instant.parse("2026-10-21T12:00:00Z")));
        return rs;
    }

    private static ResultSet folderResult(UUID id) throws Exception {
        ResultSet rs = mock(ResultSet.class);
        when(rs.getObject("id", UUID.class)).thenReturn(id);
        return rs;
    }
}
