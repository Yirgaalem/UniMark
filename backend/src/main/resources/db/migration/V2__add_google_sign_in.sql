ALTER TABLE app_user ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE app_user ADD COLUMN google_subject VARCHAR(255);
CREATE UNIQUE INDEX app_user_google_subject_unique
    ON app_user (google_subject)
    WHERE google_subject IS NOT NULL;
