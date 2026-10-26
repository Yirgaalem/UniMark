CREATE TABLE email_code_challenge (
    token_hash CHAR(64) PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE REFERENCES app_user(id) ON DELETE CASCADE,
    code_hash CHAR(64) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT email_code_attempts_nonnegative CHECK (attempts >= 0)
);
