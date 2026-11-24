-- 004: action item lifecycle. Owner = assignee_name/assignee_email (existing columns).
ALTER TABLE em_action_items ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE em_action_items ADD COLUMN IF NOT EXISTS snoozed_until TIMESTAMPTZ;
ALTER TABLE em_action_items ADD COLUMN IF NOT EXISTS dismissed_reason TEXT;
CREATE INDEX IF NOT EXISTS idx_em_action_items_snoozed_until ON em_action_items(snoozed_until) WHERE status = 'SNOOZED';
