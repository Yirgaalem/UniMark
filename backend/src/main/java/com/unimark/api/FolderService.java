package com.unimark.api;

import static com.unimark.api.ApiModels.*;

import java.time.Instant;
import java.sql.Timestamp;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class FolderService {
    private final NamedParameterJdbcTemplate jdbc;

    public FolderService(NamedParameterJdbcTemplate jdbc) { this.jdbc = jdbc; }

    public List<FolderResponse> list(UUID userId) {
        return jdbc.query("SELECT f.id, f.name, f.created_at, f.updated_at, count(bf.bookmark_id) AS bookmark_count " +
                        "FROM folder f LEFT JOIN bookmark_folder bf ON bf.folder_id = f.id AND bf.user_id = f.user_id " +
                        "WHERE f.user_id = :userId GROUP BY f.id ORDER BY lower(f.name), f.id",
                Map.of("userId", userId), (rs, row) -> new FolderResponse(rs.getObject("id", UUID.class), rs.getString("name"),
                        rs.getLong("bookmark_count"), rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("updated_at").toInstant()));
    }

    @Transactional
    public FolderResponse create(UUID userId, FolderCreateRequest request) {
        String name = cleanName(request.name());
        UUID id = UUID.randomUUID();
        Instant now = Instant.now();
        try {
            jdbc.update("INSERT INTO folder(id, user_id, name, created_at, updated_at) VALUES (:id, :userId, :name, :now, :now)",
                    new MapSqlParameterSource().addValue("id", id).addValue("userId", userId).addValue("name", name).addValue("now", Timestamp.from(now)));
        } catch (DuplicateKeyException exception) {
            throw ApiException.conflict("A folder with this name already exists in your account.");
        }
        return find(userId, id);
    }

    @Transactional
    public FolderResponse rename(UUID userId, UUID folderId, FolderRenameRequest request) {
        String name = cleanName(request.name());
        try {
            int changed = jdbc.update("UPDATE folder SET name = :name, updated_at = now() WHERE id = :id AND user_id = :userId",
                    new MapSqlParameterSource().addValue("name", name).addValue("id", folderId).addValue("userId", userId));
            if (changed == 0) throw ApiException.notFound();
        } catch (DuplicateKeyException exception) {
            throw ApiException.conflict("A folder with this name already exists in your account.");
        }
        return find(userId, folderId);
    }

    @Transactional
    public void delete(UUID userId, UUID folderId) {
        int deleted = jdbc.update("DELETE FROM folder WHERE id = :id AND user_id = :userId",
                new MapSqlParameterSource().addValue("id", folderId).addValue("userId", userId));
        if (deleted == 0) throw ApiException.notFound();
        // The database cascades folder memberships only; bookmark rows remain.
    }

    private FolderResponse find(UUID userId, UUID folderId) {
        var folders = jdbc.query("SELECT f.id, f.name, f.created_at, f.updated_at, count(bf.bookmark_id) AS bookmark_count " +
                        "FROM folder f LEFT JOIN bookmark_folder bf ON bf.folder_id = f.id AND bf.user_id = f.user_id " +
                        "WHERE f.id = :id AND f.user_id = :userId GROUP BY f.id",
                new MapSqlParameterSource().addValue("id", folderId).addValue("userId", userId),
                (rs, row) -> new FolderResponse(rs.getObject("id", UUID.class), rs.getString("name"), rs.getLong("bookmark_count"),
                        rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("updated_at").toInstant()));
        if (folders.isEmpty()) throw ApiException.notFound();
        return folders.get(0);
    }

    private static String cleanName(String value) {
        String name = value.trim();
        if (name.isBlank()) throw ApiException.badRequest("Folder name cannot be empty.");
        return name;
    }
}
