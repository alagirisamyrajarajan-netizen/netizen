/**
 * setup-db.mjs
 * 
 * Creates the Supabase tables for NetBypass using the REST API.
 * Run once: node scripts/setup-db.mjs
 * 
 * Since the anon key can't run raw DDL, this script uses individual
 * REST API calls to verify connectivity and insert seed data.
 * 
 * ⚠️ To create the actual tables, you MUST run supabase/schema.sql
 * in the Supabase SQL Editor (it requires DDL permissions).
 * 
 * Instructions:
 *   1. Go to: https://supabase.com/dashboard/project/padztopffuyolsmgjaox/sql/new
 *   2. Paste and run the contents of supabase/schema.sql
 *   3. Then run: node scripts/setup-db.mjs (to verify + seed data)
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://padztopffuyolsmgjaox.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhZHp0b3BmZnV5b2xzbWdqYW94Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNDIzNzYsImV4cCI6MjEwMDcxODM3Nn0.VehXxImXzazm7vANx8kbRjlWB2i8HNyHrgPUXaEItsE';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  console.log('🔗 Connecting to Supabase...\n');

  // Test connection
  const { error: connErr } = await supabase.from('proxy_logs').select('count').limit(0);
  if (connErr) {
    if (connErr.code === 'PGRST205') {
      console.error('❌ Tables do not exist yet.');
      console.error('');
      console.error('  → Open the Supabase SQL Editor:');
      console.error('  → https://supabase.com/dashboard/project/padztopffuyolsmgjaox/sql/new');
      console.error('  → Paste and run: supabase/schema.sql');
      console.error('  → Then re-run this script.\n');
      process.exit(1);
    }
    console.error('Connection error:', connErr.message);
    process.exit(1);
  }

  console.log('✅ Connected to Supabase successfully!');

  // Check existing rules
  const { data: existingRules } = await supabase.from('proxy_rules').select('id').limit(1);
  
  if (existingRules && existingRules.length === 0) {
    console.log('\n📋 Seeding proxy rules...');
    const { error: seedErr } = await supabase.from('proxy_rules').insert([
      { pattern: '*.google.com',       action: 'allow', description: 'Allow all Google services' },
      { pattern: '*.youtube.com',       action: 'allow', description: 'Allow YouTube' },
      { pattern: '*.github.com',        action: 'allow', description: 'Allow GitHub' },
      { pattern: '*.stackoverflow.com', action: 'allow', description: 'Allow Stack Overflow' },
      { pattern: 'ads.doubleclick.net', action: 'block', description: 'Block ad network' },
      { pattern: '*.malware.com',       action: 'block', description: 'Block known malware domain' },
    ]);
    if (seedErr) {
      console.error('Seed error:', seedErr.message);
    } else {
      console.log('✅ Proxy rules seeded!');
    }
  } else {
    console.log('✅ Proxy rules already present — skipping seed.');
  }

  // Verify tables
  const { count: logCount } = await supabase.from('proxy_logs').select('*', { count: 'exact', head: true });
  const { count: ruleCount } = await supabase.from('proxy_rules').select('*', { count: 'exact', head: true });

  console.log('\n📊 Database Status:');
  console.log(`  proxy_logs:  ${logCount ?? 0} rows`);
  console.log(`  proxy_rules: ${ruleCount ?? 0} rows`);
  console.log('\n🚀 Database is ready for deployment!\n');
}

main().catch(console.error);
