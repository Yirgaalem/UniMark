ALTER TABLE app_user ADD COLUMN username VARCHAR(24);

ALTER TABLE app_user ADD CONSTRAINT app_user_username_format_check
    CHECK (username IS NULL OR username ~ '^[A-Za-z0-9_]{3,24}$');

CREATE UNIQUE INDEX app_user_username_unique
    ON app_user (lower(username))
    WHERE username IS NOT NULL;
