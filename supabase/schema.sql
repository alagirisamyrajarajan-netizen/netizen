-- Network Bypass App - Supabase Schema
-- Run this in your Supabase SQL Editor at: https://app.supabase.com/project/_/sql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- PROXY LOGS TABLE
-- Records every request proxied through the service
-- =============================================
CREATE TABLE IF NOT EXISTS proxy_logs (
  id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  target_url    TEXT NOT NULL,
  method        TEXT NOT NULL DEFAULT 'GET',
  status_code   INTEGER,
  latency_ms    INTEGER,
  success       BOOLEAN DEFAULT false,
  error_message TEXT,
  content_type  TEXT,
  response_size INTEGER,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast recent log queries
CREATE INDEX IF NOT EXISTS idx_proxy_logs_created_at ON proxy_logs(created_at DESC);

-- =============================================
-- PROXY RULES TABLE
-- User-defined allow/block rules
-- =============================================
CREATE TABLE IF NOT EXISTS proxy_rules (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  pattern     TEXT NOT NULL,
  action      TEXT NOT NULL CHECK (action IN ('allow', 'block')),
  description TEXT,
  enabled     BOOLEAN DEFAULT true,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- SESSIONS TABLE
-- Tracks active bypass sessions
-- =============================================
CREATE TABLE IF NOT EXISTS sessions (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  session_key TEXT UNIQUE NOT NULL,
  is_active   BOOLEAN DEFAULT true,
  requests    INTEGER DEFAULT 0,
  bytes_saved BIGINT DEFAULT 0,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_used   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- Allow public reads for demo (tighten in production)
-- =============================================
ALTER TABLE proxy_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE proxy_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Allow all reads and inserts for anon key (demo mode)
CREATE POLICY "Allow public read proxy_logs" ON proxy_logs FOR SELECT USING (true);
CREATE POLICY "Allow public insert proxy_logs" ON proxy_logs FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public read proxy_rules" ON proxy_rules FOR SELECT USING (true);
CREATE POLICY "Allow public insert proxy_rules" ON proxy_rules FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update proxy_rules" ON proxy_rules FOR UPDATE USING (true);

CREATE POLICY "Allow public read sessions" ON sessions FOR SELECT USING (true);
CREATE POLICY "Allow public insert sessions" ON sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update sessions" ON sessions FOR UPDATE USING (true);

-- =============================================
-- SEED DATA - Default proxy rules
-- =============================================
INSERT INTO proxy_rules (pattern, action, description) VALUES
  ('*.google.com', 'allow', 'Allow all Google services'),
  ('*.youtube.com', 'allow', 'Allow YouTube'),
  ('*.github.com', 'allow', 'Allow GitHub'),
  ('*.malware.com', 'block', 'Block known malware domain'),
  ('ads.doubleclick.net', 'block', 'Block ad network');
