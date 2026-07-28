import { NextRequest, NextResponse } from 'next/server';
import { fetchJavaRules, createJavaRule, isJavaServiceConfigured } from '@/lib/java-client';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

const MOCK_RULES = [
  { id: '1', pattern: '*.google.com',       action: 'allow', description: 'Allow Google services', enabled: true, created_at: new Date().toISOString() },
  { id: '2', pattern: '*.youtube.com',       action: 'allow', description: 'Allow YouTube',         enabled: true, created_at: new Date().toISOString() },
  { id: '3', pattern: '*.github.com',        action: 'allow', description: 'Allow GitHub',          enabled: true, created_at: new Date().toISOString() },
  { id: '4', pattern: 'ads.doubleclick.net', action: 'block', description: 'Block ad networks',     enabled: true, created_at: new Date().toISOString() },
];

export async function GET() {
  // ── Route A: Java Spring Boot service ─────────────────────────
  if (isJavaServiceConfigured()) {
    try {
      const javaResponse = await fetchJavaRules();
      const data = await javaResponse.json();
      return NextResponse.json({ ...data, backend: 'java-spring-boot' });
    } catch (err) {
      console.warn('Java rules fetch failed:', err);
    }
  }

  // ── Route B: Supabase direct ───────────────────────────────────
  if (isSupabaseConfigured()) {
    const { data, error } = await supabase
      .from('proxy_rules')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ rules: data, demo: false, backend: 'supabase-direct' });
  }

  // ── Route C: Demo mode ─────────────────────────────────────────
  return NextResponse.json({ rules: MOCK_RULES, demo: true, backend: 'demo' });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { pattern, action, description } = body;

  if (!pattern || !action) {
    return NextResponse.json({ error: 'pattern and action are required' }, { status: 400 });
  }
  if (!['allow', 'block'].includes(action)) {
    return NextResponse.json({ error: "action must be 'allow' or 'block'" }, { status: 400 });
  }

  // ── Route A: Java Spring Boot service ─────────────────────────
  if (isJavaServiceConfigured()) {
    try {
      const javaResponse = await createJavaRule(pattern, action, description);
      const data = await javaResponse.json();
      return NextResponse.json({ ...data, backend: 'java-spring-boot' },
        { status: javaResponse.status });
    } catch (err) {
      console.warn('Java rule creation failed:', err);
    }
  }

  // ── Route B: Supabase direct ───────────────────────────────────
  if (isSupabaseConfigured()) {
    const { data, error } = await supabase
      .from('proxy_rules')
      .insert({ pattern, action, description })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ rule: data, backend: 'supabase-direct' });
  }

  // ── Route C: Demo mode ─────────────────────────────────────────
  return NextResponse.json({
    rule: { id: Date.now().toString(), pattern, action, description, enabled: true, created_at: new Date().toISOString() },
    demo: true,
    backend: 'demo',
  });
}
