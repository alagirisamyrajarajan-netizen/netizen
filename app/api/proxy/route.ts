import { NextRequest, NextResponse } from 'next/server';
import { callJavaProxy, isJavaServiceConfigured } from '@/lib/java-client';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

// ─── SSRF protection (applied in both Java-delegated and fallback modes) ───
const BLOCKED_PATTERNS = [
  /localhost/i,
  /127\.0\.0\.\d+/,
  /10\.\d+\.\d+\.\d+/,
  /192\.168\.\d+\.\d+/,
  /0\.0\.0\.0/,
];

function isBlockedUrl(url: string): boolean {
  return BLOCKED_PATTERNS.some((p) => p.test(url));
}

export async function GET(request: NextRequest) {
  return handleProxy(request, 'GET');
}

export async function POST(request: NextRequest) {
  return handleProxy(request, 'POST');
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

async function handleProxy(request: NextRequest, method: string) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return NextResponse.json({ error: 'Missing ?url= parameter' }, { status: 400 });
  }

  // Basic URL validation
  try {
    const parsed = new URL(targetUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return NextResponse.json({ error: 'Only HTTP/HTTPS URLs are allowed' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
  }

  if (isBlockedUrl(targetUrl)) {
    return NextResponse.json(
      { error: 'Access to internal addresses is not allowed' },
      { status: 403 }
    );
  }

  // ── Route A: Delegate to Java Spring Boot service ────────────────────────
  if (isJavaServiceConfigured()) {
    try {
      const body = method === 'POST' ? await request.text() : undefined;
      const contentType = request.headers.get('Content-Type') || undefined;

      const javaResponse = await callJavaProxy(targetUrl, method, body, contentType);
      const responseData = await javaResponse.json();

      // Stream back the actual proxied content if successful
      if (responseData.body && javaResponse.ok) {
        const encoder = new TextEncoder();
        return new NextResponse(encoder.encode(responseData.body), {
          status: responseData.statusCode || 200,
          headers: {
            'Content-Type': responseData.contentType || 'text/plain',
            'Access-Control-Allow-Origin': '*',
            'X-Proxied-By': 'NetBypass/Java-SpringBoot',
            'X-Latency-Ms': String(responseData.latencyMs || 0),
            'X-Status-Code': String(responseData.statusCode || 200),
            'X-Backend': 'java-spring-boot',
          },
        });
      }

      // Return Java error response
      return NextResponse.json(responseData, {
        status: javaResponse.status,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'X-Backend': 'java-spring-boot',
        },
      });
    } catch (err) {
      // Java service unavailable — fall through to direct mode
      console.warn('Java service unavailable, falling back to direct proxy:', err);
    }
  }

  // ── Route B: Direct proxy fallback (no Java service configured) ──────────
  const startTime = Date.now();
  let statusCode = 0;
  let success = false;
  let contentType = '';
  let responseSize = 0;
  let errorMessage: string | undefined;

  try {
    const fetchOptions: RequestInit = {
      method,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NetBypass/1.0)',
        Accept: '*/*',
      },
      redirect: 'follow',
    };

    if (method === 'POST') {
      fetchOptions.body = await request.text();
      (fetchOptions.headers as Record<string, string>)['Content-Type'] =
        request.headers.get('Content-Type') || 'application/json';
    }

    const response = await fetch(targetUrl, fetchOptions);
    statusCode = response.status;
    contentType = response.headers.get('content-type') || 'text/plain';
    const responseBody = await response.arrayBuffer();
    responseSize = responseBody.byteLength;
    success = response.ok;
    const latency = Date.now() - startTime;

    // Log to Supabase if configured
    if (isSupabaseConfigured()) {
      void (async () => {
        try {
          await supabase.from('proxy_logs').insert({
            target_url: targetUrl, method, status_code: statusCode,
            latency_ms: latency, success, content_type: contentType,
            response_size: responseSize,
          });
        } catch { /* silent */ }
      })();
    }

    return new NextResponse(responseBody, {
      status: statusCode,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'X-Proxied-By': 'NetBypass/Direct',
        'X-Latency-Ms': String(latency),
        'X-Status-Code': String(statusCode),
        'X-Backend': 'next-direct',
        ...(contentType ? { 'Content-Type': contentType } : {}),
      },
    });
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : 'Unknown error';
    const latency = Date.now() - startTime;

    if (isSupabaseConfigured()) {
      void (async () => {
        try {
          await supabase.from('proxy_logs').insert({
            target_url: targetUrl, method, status_code: 0,
            latency_ms: latency, success: false, error_message: errorMessage,
          });
        } catch { /* silent */ }
      })();
    }

    return NextResponse.json(
      { error: 'Proxy request failed', message: errorMessage },
      { status: 502, headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  }
}
