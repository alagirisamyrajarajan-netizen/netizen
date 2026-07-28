import { NextRequest, NextResponse } from 'next/server';
import { fetchJavaLogs, isJavaServiceConfigured } from '@/lib/java-client';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

const MOCK_LOGS = [
  {
    id: '1',
    target_url: 'https://api.github.com',
    method: 'GET',
    status_code: 200,
    latency_ms: 142,
    success: true,
    created_at: new Date(Date.now() - 5000).toISOString(),
  },
  {
    id: '2',
    target_url: 'https://httpbin.org/get',
    method: 'GET',
    status_code: 200,
    latency_ms: 238,
    success: true,
    created_at: new Date(Date.now() - 12000).toISOString(),
  },
  {
    id: '3',
    target_url: 'https://api.ipify.org?format=json',
    method: 'GET',
    status_code: 200,
    latency_ms: 95,
    success: true,
    created_at: new Date(Date.now() - 30000).toISOString(),
  },
  {
    id: '4',
    target_url: 'https://blocked-site.example.com',
    method: 'GET',
    status_code: 0,
    latency_ms: 5001,
    success: false,
    error_message: 'Connection timeout',
    created_at: new Date(Date.now() - 60000).toISOString(),
  },
];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '20');

  // ── Route A: Java Spring Boot service ─────────────────────────
  if (isJavaServiceConfigured()) {
    try {
      const javaResponse = await fetchJavaLogs(limit);
      const data = await javaResponse.json();
      return NextResponse.json({ ...data, backend: 'java-spring-boot' });
    } catch (err) {
      console.warn('Java logs fetch failed:', err);
      // fall through to Supabase
    }
  }

  // ── Route B: Supabase direct ───────────────────────────────────
  if (isSupabaseConfigured()) {
    const { data, error } = await supabase
      .from('proxy_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({
      logs: data,
      demo: false,
      total: data.length,
      backend: 'supabase-direct',
    });
  }

  // ── Route C: Demo mode ─────────────────────────────────────────
  return NextResponse.json({
    logs: MOCK_LOGS,
    demo: true,
    total: MOCK_LOGS.length,
    backend: 'demo',
  });
}
