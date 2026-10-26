ALTER TABLE app_user ADD COLUMN totp_secret_encrypted TEXT;
ALTER TABLE app_user ADD COLUMN totp_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE app_user ADD COLUMN totp_enrollment_token_hash CHAR(64);
ALTER TABLE app_user ADD COLUMN totp_enrollment_expires_at TIMESTAMPTZ;
ALTER TABLE app_user ADD COLUMN totp_login_challenge_hash CHAR(64);
ALTER TABLE app_user ADD COLUMN totp_login_challenge_expires_at TIMESTAMPTZ;
ALTER TABLE app_user ADD COLUMN totp_last_used_step BIGINT;

CREATE UNIQUE INDEX app_user_totp_enrollment_token_unique
    ON app_user (totp_enrollment_token_hash)
    WHERE totp_enrollment_token_hash IS NOT NULL;

CREATE UNIQUE INDEX app_user_totp_login_challenge_unique
    ON app_user (totp_login_challenge_hash)
    WHERE totp_login_challenge_hash IS NOT NULL;
