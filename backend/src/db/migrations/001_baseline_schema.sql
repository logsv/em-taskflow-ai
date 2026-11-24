-- 001: baseline schema.
-- Every statement is idempotent so databases created before migrations existed
-- (by the old createTables()) are adopted without changes.

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  active_thread_id TEXT,
  client_info TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_threads (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  strategy TEXT,
  executor_path TEXT,
  trace_id TEXT,
  citations_json TEXT,
  metadata TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  thread_id TEXT REFERENCES chat_threads(id) ON DELETE SET NULL,
  message_id BIGINT REFERENCES chat_messages(id) ON DELETE SET NULL,
  trace_id TEXT,
  score TEXT NOT NULL,
  comment TEXT,
  metadata TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE chat_threads
ADD COLUMN IF NOT EXISTS session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL;

ALTER TABLE chat_threads
ADD COLUMN IF NOT EXISTS context_matrix JSONB DEFAULT '{}'::jsonb;

ALTER TABLE chat_messages
ADD COLUMN IF NOT EXISTS trace_id TEXT;

ALTER TABLE chat_messages
ADD COLUMN IF NOT EXISTS citations_json TEXT;

ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_sessions_last_active_at ON sessions(last_active_at);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_active_thread_fk') THEN
    ALTER TABLE sessions
      ADD CONSTRAINT sessions_active_thread_fk
      FOREIGN KEY (active_thread_id) REFERENCES chat_threads(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS chat_history (
  id BIGSERIAL PRIMARY KEY,
  user_message TEXT NOT NULL,
  ai_response TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  session_id TEXT,
  metadata TEXT
);

CREATE TABLE IF NOT EXISTS user_preferences (
  id BIGSERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_cache (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  task_id TEXT NOT NULL,
  data TEXT NOT NULL,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source, task_id)
);

CREATE TABLE IF NOT EXISTS github_issues (
  id TEXT PRIMARY KEY,
  issue_number INT NOT NULL,
  repo TEXT NOT NULL,
  title TEXT NOT NULL,
  state TEXT NOT NULL,
  assignee TEXT,
  html_url TEXT,
  labels_json JSONB,
  data_json JSONB NOT NULL,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_github_issues_repo_state ON github_issues(repo, state);

CREATE TABLE IF NOT EXISTS pdf_chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  chunk_index INT NOT NULL,
  content TEXT NOT NULL,
  parent_content TEXT NOT NULL,
  embedding_json TEXT,
  tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', content || ' ' || filename)) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pdf_chunks_filename ON pdf_chunks(filename);
CREATE INDEX IF NOT EXISTS idx_pdf_chunks_tsv ON pdf_chunks USING GIN(tsv);

CREATE TABLE IF NOT EXISTS dora_snapshots (
  id SERIAL PRIMARY KEY,
  team_id VARCHAR(64) NOT NULL,
  deployment_frequency NUMERIC(5,2),
  lead_time_hours NUMERIC(8,2),
  change_failure_rate NUMERIC(5,2),
  mttr_hours NUMERIC(8,2),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sbi_feedback_records (
  id SERIAL PRIMARY KEY,
  engineer_id VARCHAR(64) NOT NULL,
  situation TEXT NOT NULL,
  behavior TEXT NOT NULL,
  impact TEXT NOT NULL,
  action_plan TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sprint_analytics (
  id SERIAL PRIMARY KEY,
  sprint_id VARCHAR(64) UNIQUE NOT NULL,
  total_points INT DEFAULT 0,
  completed_points INT DEFAULT 0,
  wip_violations INT DEFAULT 0,
  retro_action_items JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS okr_tracker (
  id SERIAL PRIMARY KEY,
  objective TEXT NOT NULL,
  key_result TEXT NOT NULL,
  target_value NUMERIC(10,2) NOT NULL,
  current_value NUMERIC(10,2) DEFAULT 0,
  status VARCHAR(32) DEFAULT 'ON_TRACK',
  quarter VARCHAR(16) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  source TEXT DEFAULT 'database',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_members (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  email TEXT UNIQUE,
  aliases JSONB DEFAULT '[]',
  github_username TEXT,
  jira_email TEXT,
  jira_account_id TEXT,
  gcal_email TEXT,
  notion_name TEXT,
  current_level TEXT DEFAULT 'L4_MID',
  target_level TEXT DEFAULT 'L5_SENIOR',
  track TEXT DEFAULT 'INDIVIDUAL_CONTRIBUTOR',
  tenure_months INT DEFAULT 12,
  skills JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS em_audit_runs (
  id BIGSERIAL PRIMARY KEY,
  triggered_by VARCHAR(32) DEFAULT 'CRON_4H',
  status VARCHAR(32) DEFAULT 'COMPLETED',
  health_score INT DEFAULT 100,
  summary_markdown TEXT,
  dora_summary JSONB DEFAULT '{}'::jsonb,
  delivery_summary JSONB DEFAULT '{}'::jsonb,
  people_summary JSONB DEFAULT '{}'::jsonb,
  sprint_okr_summary JSONB DEFAULT '{}'::jsonb,
  sop_summary JSONB DEFAULT '{}'::jsonb,
  slack_status JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_em_audit_runs_created_at ON em_audit_runs(created_at DESC);

CREATE TABLE IF NOT EXISTS em_action_items (
  id VARCHAR(64) PRIMARY KEY,
  audit_run_id BIGINT REFERENCES em_audit_runs(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  category VARCHAR(32) NOT NULL,
  severity VARCHAR(16) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  suggested_action TEXT,
  assignee_name TEXT,
  assignee_email TEXT,
  external_reference JSONB DEFAULT '{}'::jsonb,
  resolution_notes TEXT,
  completed_at TIMESTAMPTZ,
  completed_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_em_action_items_status ON em_action_items(status);
CREATE INDEX IF NOT EXISTS idx_em_action_items_category ON em_action_items(category);
CREATE INDEX IF NOT EXISTS idx_em_action_items_severity ON em_action_items(severity);
