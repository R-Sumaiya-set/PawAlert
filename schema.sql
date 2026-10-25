-- ============================================================
-- PawAlert – Supabase (PostgreSQL) Schema
-- Run this once in Supabase SQL Editor
-- ============================================================

-- Organizations
CREATE TABLE IF NOT EXISTS organizations (
  org_id        SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  service_area  TEXT,
  contact_info  TEXT,
  is_active     BOOLEAN DEFAULT TRUE,
  registered_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users (custom auth – passwords hashed with scrypt on the server)
CREATE TABLE IF NOT EXISTS users (
  user_id       SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  phone         TEXT,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('Admin','Coordinator','Rescuer','Reporter')),
  org_id        INTEGER REFERENCES organizations(org_id) ON DELETE SET NULL,
  is_approved   BOOLEAN DEFAULT FALSE,
  is_available  BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role  ON users(role);

-- Rescue teams
CREATE TABLE IF NOT EXISTS teams (
  team_id             SERIAL PRIMARY KEY,
  org_id              INTEGER NOT NULL REFERENCES organizations(org_id) ON DELETE CASCADE,
  team_name           TEXT NOT NULL,
  availability_status BOOLEAN DEFAULT TRUE,
  service_area        TEXT,
  is_active           BOOLEAN DEFAULT TRUE
);

-- Rescue cases
CREATE TABLE IF NOT EXISTS cases (
  case_id              TEXT PRIMARY KEY,          -- e.g. AR-2026-001
  tracking_code        TEXT NOT NULL UNIQUE,
  reporter_id          INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
  reporter_name        TEXT,
  reporter_phone       TEXT,
  animal_type          TEXT NOT NULL,
  condition_type       TEXT,
  urgency_level        TEXT NOT NULL CHECK (urgency_level IN ('Critical','High','Medium','Low')),
  location_text        TEXT NOT NULL,
  geo_lat              DOUBLE PRECISION,
  geo_lng              DOUBLE PRECISION,
  description          TEXT,
  photo_url            TEXT,
  status               TEXT NOT NULL DEFAULT 'Pending',
  assigned_team_id     INTEGER REFERENCES teams(team_id) ON DELETE SET NULL,
  assigned_rescuer_id  INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
  org_id               INTEGER REFERENCES organizations(org_id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cases_status   ON cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_urgency  ON cases(urgency_level);
CREATE INDEX IF NOT EXISTS idx_cases_created  ON cases(created_at DESC);

-- Immutable status history (audit trail)
CREATE TABLE IF NOT EXISTS status_updates (
  update_id     SERIAL PRIMARY KEY,
  case_id       TEXT NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
  updated_by    INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
  status_value  TEXT NOT NULL,
  notes         TEXT,
  photo_url     TEXT,
  timestamp     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_status_case ON status_updates(case_id);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  notification_id  SERIAL PRIMARY KEY,
  recipient_id     INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  case_id          TEXT REFERENCES cases(case_id) ON DELETE SET NULL,
  channel          TEXT DEFAULT 'InApp',
  message          TEXT NOT NULL,
  delivery_status  TEXT DEFAULT 'Sent',
  is_read          BOOLEAN DEFAULT FALSE,
  sent_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(recipient_id, is_read);

-- Sequence helper for case numbers (year-based)
CREATE TABLE IF NOT EXISTS app_meta (
  key   TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);
INSERT INTO app_meta (key, value) VALUES ('case_num_2026', 0)
  ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- Row Level Security – allow service role full access
-- (Backend uses service_role key; anon key is not used for writes)
-- ============================================================
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_meta ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS automatically.
-- For safety we still add permissive policies so the project can be queried from SQL editor.
CREATE POLICY "allow_all_orgs"   ON organizations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_users"  ON users         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_teams"  ON teams         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_cases"  ON cases         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_status" ON status_updates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_notif"  ON notifications FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_meta"   ON app_meta      FOR ALL USING (true) WITH CHECK (true);
