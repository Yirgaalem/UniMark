package com.unimark.api;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.core.namedparam.SqlParameterSource;

class FolderServiceTest {
    private final NamedParameterJdbcTemplate jdbc = mock(NamedParameterJdbcTemplate.class);
    private final FolderService service = new FolderService(jdbc);
    private final UUID userId = UUID.randomUUID();
    private final Instant now = Instant.parse("2026-10-21T12:00:00Z");
    private UUID folderId;
    private String folderName;

    @BeforeEach
    void stubFolderLookup() throws Exception {
        doAnswer(invocation -> {
            RowMapper<?> mapper = invocation.getArgument(2);
            ResultSet rs = mock(ResultSet.class);
            org.mockito.Mockito.when(rs.getObject("id", UUID.class)).thenReturn(folderId);
            org.mockito.Mockito.when(rs.getString("name")).thenReturn(folderName);
            org.mockito.Mockito.when(rs.getLong("bookmark_count")).thenReturn(2L);
            org.mockito.Mockito.when(rs.getTimestamp("created_at")).thenReturn(Timestamp.from(now));
            org.mockito.Mockito.when(rs.getTimestamp("updated_at")).thenReturn(Timestamp.from(now));
            return List.of(mapper.mapRow(rs, 0));
        }).when(jdbc).query(anyString(), any(SqlParameterSource.class), any(RowMapper.class));
    }

    @Test
    void createsFolderWithTrimmedName() {
        doAnswer(invocation -> {
            var params = (org.springframework.jdbc.core.namedparam.MapSqlParameterSource) invocation.getArgument(1);
            folderId = (UUID) params.getValue("id");
            folderName = (String) params.getValue("name");
            return 1;
        }).when(jdbc).update(anyString(), any(SqlParameterSource.class));

        ApiModels.FolderResponse result = service.create(userId, new ApiModels.FolderCreateRequest("  Reading list  "));

        assertEquals("Reading list", result.name());
        assertEquals(2, result.bookmarkCount());
        verify(jdbc).update(anyString(), any(SqlParameterSource.class));
    }

    @Test
    void rejectsBlankFolderNamesBeforeWriting() {
        assertThrows(ApiException.class, () -> service.create(userId, new ApiModels.FolderCreateRequest("  ")));
        org.mockito.Mockito.verifyNoInteractions(jdbc);
    }

    @Test
    void reportsDuplicateFolderNamesAsConflict() {
        org.mockito.Mockito.doThrow(new DuplicateKeyException("duplicate"))
                .when(jdbc).update(anyString(), any(SqlParameterSource.class));

        ApiException error = assertThrows(ApiException.class,
                () -> service.create(userId, new ApiModels.FolderCreateRequest("Reading list")));

        assertEquals(409, error.status().value());
    }
}
