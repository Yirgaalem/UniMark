ALTER TABLE bookmark ADD COLUMN video_duration_seconds INTEGER;

ALTER TABLE bookmark ADD CONSTRAINT bookmark_video_duration_nonnegative
    CHECK (video_duration_seconds IS NULL OR video_duration_seconds > 0);
