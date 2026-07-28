import { NextResponse } from 'next/server';
import { fetchJavaStatus, isJavaServiceConfigured } from '@/lib/java-client';
import { isSupabaseConfigured } from '@/lib/supabase';

export async function GET() {
  // Try fetching Java service status
  let javaStatus = null;
  if (isJavaServiceConfigured()) {
    try {
      const res = await fetchJavaStatus();
      javaStatus = await res.json();
    } catch {
      javaStatus = { status: 'unreachable' };
    }
  }

  return NextResponse.json({
    status: 'operational',
    version: '1.0.0',
    nextjs_version: '15.x',
    supabase_connected: isSupabaseConfigured(),
    java_service_configured: isJavaServiceConfigured(),
    java_service_url: process.env.JAVA_SERVICE_URL || null,
    java_service_status: javaStatus,
    timestamp: new Date().toISOString(),
    region: process.env.VERCEL_REGION || 'unknown',
    deployment_url: process.env.VERCEL_URL || 'localhost',
    architecture: isJavaServiceConfigured()
      ? 'Browser → Next.js (Vercel) → Java Spring Boot (Railway) → Supabase'
      : isSupabaseConfigured()
      ? 'Browser → Next.js (Vercel) → Supabase'
      : 'Browser → Next.js (Vercel) [Demo Mode]',
  });
}
