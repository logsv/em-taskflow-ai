-- 003: roster levels and tenure are unknown until the owner enters them.
-- The old defaults (L4_MID -> L5_SENIOR, 12 months) made every new engineer look assessed.
-- Existing values are kept: we cannot tell an entered value from a default one.
ALTER TABLE team_members ALTER COLUMN current_level DROP DEFAULT;
ALTER TABLE team_members ALTER COLUMN target_level DROP DEFAULT;
ALTER TABLE team_members ALTER COLUMN tenure_months DROP DEFAULT;
