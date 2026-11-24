-- 002: sessions.archived was added at request time by archiveSession(). It is now part of the schema.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;
