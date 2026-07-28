/**
 * create-tables.mjs
 * Creates all NetBypass tables in Supabase by running SQL
 * through the Supabase Management REST API.
 * 
 * Run: node scripts/create-tables.mjs
 */

const PROJECT_REF = 'padztopffuyolsmgjaox';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhZHp0b3BmZnV5b2xzbWdqYW94Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNDIzNzYsImV4cCI6MjEwMDcxODM3Nn0.VehXxImXzazm7vANx8kbRjlWB2i8HNyHrgPUXaEItsE';
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;

// Individual SQL statements — run them sequentially via RPC
const STATEMENTS = [
  // Enable UUID extension
  `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`,

  // proxy_logs table
  `CREATE TABLE IF NOT EXISTS proxy_logs (
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
  )`,

  // proxy_rules table
  `CREATE TABLE IF NOT EXISTS proxy_rules (
    id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    pattern     TEXT NOT NULL,
    action      TEXT NOT NULL CHECK (action IN ('allow', 'block')),
    description TEXT,
    enabled     BOOLEAN DEFAULT true,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  )`,

  // sessions table
  `CREATE TABLE IF NOT EXISTS sessions (
    id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    session_key TEXT UNIQUE NOT NULL,
    is_active   BOOLEAN DEFAULT true,
    requests    INTEGER DEFAULT 0,
    bytes_saved BIGINT DEFAULT 0,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  )`,

  // indexes
  `CREATE INDEX IF NOT EXISTS idx_proxy_logs_created_at ON proxy_logs(created_at DESC)`,

  // RLS
  `ALTER TABLE proxy_logs ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE proxy_rules ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE sessions ENABLE ROW LEVEL SECURITY`,

  // Policies
  `DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename='proxy_logs' AND policyname='Allow public read proxy_logs'
    ) THEN
      CREATE POLICY "Allow public read proxy_logs" ON proxy_logs FOR SELECT USING (true);
    END IF;
  END $$`,

  `DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename='proxy_logs' AND policyname='Allow public insert proxy_logs'
    ) THEN
      CREATE POLICY "Allow public insert proxy_logs" ON proxy_logs FOR INSERT WITH CHECK (true);
    END IF;
  END $$`,

  `DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename='proxy_rules' AND policyname='Allow public read proxy_rules'
    ) THEN
      CREATE POLICY "Allow public read proxy_rules" ON proxy_rules FOR SELECT USING (true);
    END IF;
  END $$`,

  `DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename='proxy_rules' AND policyname='Allow public insert proxy_rules'
    ) THEN
      CREATE POLICY "Allow public insert proxy_rules" ON proxy_rules FOR INSERT WITH CHECK (true);
    END IF;
  END $$`,

  `DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename='proxy_rules' AND policyname='Allow public update proxy_rules'
    ) THEN
      CREATE POLICY "Allow public update proxy_rules" ON proxy_rules FOR UPDATE USING (true);
    END IF;
  END $$`,

  `DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename='sessions' AND policyname='Allow public read sessions'
    ) THEN
      CREATE POLICY "Allow public read sessions" ON sessions FOR SELECT USING (true);
    END IF;
  END $$`,

  `DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename='sessions' AND policyname='Allow public insert sessions'
    ) THEN
      CREATE POLICY "Allow public insert sessions" ON sessions FOR INSERT WITH CHECK (true);
    END IF;
  END $$`,
];

const SEED_RULES = [
  { pattern: '*.google.com',        action: 'allow', description: 'Allow all Google services' },
  { pattern: '*.youtube.com',        action: 'allow', description: 'Allow YouTube' },
  { pattern: '*.github.com',         action: 'allow', description: 'Allow GitHub' },
  { pattern: '*.stackoverflow.com',  action: 'allow', description: 'Allow Stack Overflow' },
  { pattern: '*.openai.com',         action: 'allow', description: 'Allow OpenAI' },
  { pattern: 'ads.doubleclick.net',  action: 'block', description: 'Block ad network' },
  { pattern: '*.malware.com',        action: 'block', description: 'Block known malware' },
];

async function runSql(sql) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_ddl`, {
    method: 'POST',
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  return res;
}

async function checkTable(tableName) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${tableName}?limit=0`, {
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`,
    },
  });
  const data = await res.json();
  return !data?.code || data.code !== 'PGRST205';
}

async function seedRules() {
  const checkRes = await fetch(`${SUPABASE_URL}/rest/v1/proxy_rules?limit=1`, {
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`,
    },
  });
  const existing = await checkRes.json();
  if (Array.isArray(existing) && existing.length > 0) {
    console.log('  ✓ Rules already seeded, skipping.');
    return;
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/proxy_rules`, {
    method: 'POST',
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(SEED_RULES),
  });

  if (res.ok) {
    console.log(`  ✓ Seeded ${SEED_RULES.length} default proxy rules.`);
  } else {
    const err = await res.json();
    console.log('  ⚠ Seed warning:', err.message || err);
  }
}

async function main() {
  console.log('\n🚀 NetBypass — Database Setup\n');
  console.log(`📡 Project: ${PROJECT_REF}.supabase.co\n`);

  // Check if tables already exist
  const logsExist  = await checkTable('proxy_logs');
  const rulesExist = await checkTable('proxy_rules');

  if (logsExist && rulesExist) {
    console.log('✅ Tables already exist!\n');
    await seedRules();
    console.log('\n🎉 Database is ready. Proceed with Vercel deployment.\n');
    return;
  }

  console.log('⚠️  Tables not found. Cannot create tables with the anon key.\n');
  console.log('📋 ACTION REQUIRED — Run this SQL in the Supabase SQL Editor:\n');
  console.log('   👉  https://supabase.com/dashboard/project/padztopffuyolsmgjaox/sql/new\n');
  console.log('─'.repeat(60));

  const { readFileSync } = await import('fs');
  const { resolve, dirname } = await import('path');
  const { fileURLToPath } = await import('url');
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const sql = readFileSync(resolve(__dirname, '../supabase/schema.sql'), 'utf8');
  console.log(sql);
  console.log('─'.repeat(60));
  console.log('\nAfter running the SQL, re-run: npm run setup-db\n');
}

main().catch(console.error);
