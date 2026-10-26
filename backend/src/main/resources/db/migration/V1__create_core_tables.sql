CREATE TABLE app_user (
    id              UUID PRIMARY KEY,
    email           VARCHAR(320) NOT NULL,
    password_hash   TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT app_user_email_lowercase CHECK (email = lower(email)),
    CONSTRAINT app_user_email_unique UNIQUE (email)
);

CREATE TABLE bookmark (
    id                  UUID PRIMARY KEY,
    user_id             UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    original_url        TEXT NOT NULL,
    normalized_url      TEXT NOT NULL,
    source_platform     VARCHAR(32) NOT NULL DEFAULT 'unknown',
    original_title      TEXT,
    custom_title        VARCHAR(300),
    description         TEXT,
    thumbnail_url       TEXT,
    content_type        VARCHAR(32) NOT NULL DEFAULT 'unknown',
    creator_name        TEXT,
    user_notes          VARCHAR(5000),
    saved_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT bookmark_platform_check CHECK (
        source_platform IN ('unknown', 'tiktok', 'instagram', 'youtube', 'reddit', 'x', 'web')
    ),
    CONSTRAINT bookmark_content_type_check CHECK (
        content_type IN ('unknown', 'video', 'article', 'image', 'post', 'other')
    ),
    CONSTRAINT bookmark_url_nonempty CHECK (length(trim(original_url)) > 0),
    CONSTRAINT bookmark_normalized_url_nonempty CHECK (length(trim(normalized_url)) > 0),
    CONSTRAINT bookmark_id_user_unique UNIQUE (id, user_id)
);

CREATE INDEX bookmark_user_saved_idx ON bookmark (user_id, saved_at DESC, id DESC);
CREATE INDEX bookmark_user_platform_idx ON bookmark (user_id, source_platform);

CREATE TABLE folder (
    id          UUID PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    name        VARCHAR(120) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT folder_name_nonempty CHECK (length(trim(name)) > 0),
    CONSTRAINT folder_id_user_unique UNIQUE (id, user_id)
);

CREATE UNIQUE INDEX folder_name_unique_per_user ON folder (user_id, lower(name));

CREATE TABLE bookmark_folder (
    bookmark_id UUID NOT NULL,
    folder_id   UUID NOT NULL,
    user_id     UUID NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (bookmark_id, folder_id),
    CONSTRAINT bookmark_folder_bookmark_owner_fk
        FOREIGN KEY (bookmark_id, user_id) REFERENCES bookmark(id, user_id) ON DELETE CASCADE,
    CONSTRAINT bookmark_folder_folder_owner_fk
        FOREIGN KEY (folder_id, user_id) REFERENCES folder(id, user_id) ON DELETE CASCADE
);

CREATE INDEX bookmark_folder_folder_idx ON bookmark_folder (folder_id, bookmark_id);

CREATE TABLE refresh_token (
    token_hash  CHAR(64) PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX refresh_token_user_idx ON refresh_token (user_id, expires_at);

-- URL duplicates are allowed. Phase 4 will define canonicalization and duplicate behavior.
