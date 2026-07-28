import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://placeholder.supabase.co'
    ? process.env.NEXT_PUBLIC_SUPABASE_URL
    : 'https://padztopffuyolsmgjaox.supabase.co';

const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY !== 'placeholder_key'
    ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhZHp0b3BmZnV5b2xzbWdqYW94Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNDIzNzYsImV4cCI6MjEwMDcxODM3Nn0.VehXxImXzazm7vANx8kbRjlWB2i8HNyHrgPUXaEItsE';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type ProxyLog = {
  id: string;
  target_url: string;
  status_code: number;
  latency_ms: number;
  method: string;
  success: boolean;
  error_message?: string;
  created_at: string;
};

export type ProxyRule = {
  id: string;
  pattern: string;
  action: 'allow' | 'block';
  description: string;
  created_at: string;
};

export const isSupabaseConfigured = () => {
  return true;
};
