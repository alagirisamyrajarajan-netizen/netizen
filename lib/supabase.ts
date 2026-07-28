import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder_key';

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
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL !== undefined &&
    process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://placeholder.supabase.co' &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY !== undefined &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY !== 'placeholder_key'
  );
};
