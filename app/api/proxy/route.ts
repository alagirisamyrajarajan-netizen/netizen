import { NextRequest, NextResponse } from 'next/server';
import { callJavaProxy, isJavaServiceConfigured } from '@/lib/java-client';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

// ─── SSRF protection ───
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

// ─── HTML & Asset Rewriter ──────────────────────────────────────────
// Rewrites relative & absolute URLs inside HTML/CSS to route through
// NetBypass proxy (/api/proxy?url=...) so that logos, images, stylesheets,
// and scripts load 100% via the edge proxy, bypassing local WiFi blocks.
function processHtmlAndCss(content: string, targetUrl: string, requestOrigin: string): string {
  try {
    const targetObj = new URL(targetUrl);
    const targetOrigin = targetObj.origin;

    const makeProxyUrl = (raw: string): string => {
      if (
        !raw ||
        raw.startsWith('data:') ||
        raw.startsWith('blob:') ||
        raw.startsWith('javascript:') ||
        raw.startsWith('#')
      ) {
        return raw;
      }
      try {
        const abs = new URL(raw, targetUrl).href;
        return `${requestOrigin}/api/proxy?url=${encodeURIComponent(abs)}`;
      } catch {
        return raw;
      }
    };

    let rewritten = content;

    // 1. Inject <base> tag and referrer control
    const baseTag = `<base href="${targetOrigin}/" /><meta name="referrer" content="no-referrer" />`;
    if (/<head[^>]*>/i.test(rewritten)) {
      rewritten = rewritten.replace(/(<head[^>]*>)/i, `$1${baseTag}`);
    } else if (/<html[^>]*>/i.test(rewritten)) {
      rewritten = rewritten.replace(/(<html[^>]*>)/i, `$1${baseTag}`);
    } else {
      rewritten = baseTag + rewritten;
    }

    // 2. Rewrite src="..." (images, scripts, logos, svgs, media, iframes)
    rewritten = rewritten.replace(/\bsrc=["']([^"']+)["']/gi, (_, url) => {
      return `src="${makeProxyUrl(url)}"`;
    });

    // 3. Rewrite href="..." for stylesheets, icons, links
    rewritten = rewritten.replace(/\bhref=["']([^"']+)["']/gi, (_, url) => {
      return `href="${makeProxyUrl(url)}"`;
    });

    // 4. Rewrite srcset="..." (responsive images/logos)
    rewritten = rewritten.replace(/\bsrcset=["']([^"']+)["']/gi, (_, srcset) => {
      const parts = srcset.split(',').map((part: string) => {
        const trimmed = part.trim();
        const spaceIdx = trimmed.indexOf(' ');
        if (spaceIdx === -1) return makeProxyUrl(trimmed);
        const url = trimmed.slice(0, spaceIdx);
        const descriptor = trimmed.slice(spaceIdx);
        return `${makeProxyUrl(url)}${descriptor}`;
      });
      return `srcset="${parts.join(', ')}"`;
    });

    // 5. Rewrite inline style url(...) and CSS url(...)
    rewritten = rewritten.replace(/url\(['"]?([^'"\)]+)['"]?\)/gi, (_, url) => {
      return `url("${makeProxyUrl(url)}")`;
    });

    return rewritten;
  } catch {
    return content;
  }
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
  const { searchParams, origin: requestOrigin } = new URL(request.url);
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

      if (responseData.body && javaResponse.ok) {
        let finalBody = responseData.body;
        const resCt = responseData.contentType || 'text/html';

        if (resCt.includes('text/html')) {
          finalBody = processHtmlAndCss(finalBody, targetUrl, requestOrigin);
        }

        const encoder = new TextEncoder();
        return new NextResponse(encoder.encode(finalBody), {
          status: responseData.statusCode || 200,
          headers: {
            'Content-Type': resCt,
            'Access-Control-Allow-Origin': '*',
            'X-Proxied-By': 'NetBypass/Java-SpringBoot',
            'X-Latency-Ms': String(responseData.latencyMs || 0),
            'X-Status-Code': String(responseData.statusCode || 200),
            'X-Backend': 'java-spring-boot',
          },
        });
      }

      return NextResponse.json(responseData, {
        status: javaResponse.status,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'X-Backend': 'java-spring-boot',
        },
      });
    } catch (err) {
      console.warn('Java service unavailable, falling back to direct proxy:', err);
    }
  }

  // ── Route B: Direct proxy fallback ──────────────────────────────────────────
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
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
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

    let finalResponseBody: BodyInit;

    if (contentType.includes('text/html') || contentType.includes('text/css')) {
      const rawText = await response.text();
      finalResponseBody = contentType.includes('text/html')
        ? processHtmlAndCss(rawText, targetUrl, requestOrigin)
        : rawText;
    } else {
      finalResponseBody = await response.arrayBuffer();
    }

    responseSize = typeof finalResponseBody === 'string'
      ? new Blob([finalResponseBody]).size
      : (finalResponseBody as ArrayBuffer).byteLength;
    success = response.ok;
    const latency = Date.now() - startTime;

    if (isSupabaseConfigured()) {
      void (async () => {
        try {
          await supabase.from('proxy_logs').insert({
            target_url: targetUrl,
            method,
            status_code: statusCode,
            latency_ms: latency,
            success,
            content_type: contentType,
            response_size: responseSize,
          });
        } catch {
          /* silent */
        }
      })();
    }

    return new NextResponse(finalResponseBody, {
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
            target_url: targetUrl,
            method,
            status_code: 0,
            latency_ms: latency,
            success: false,
            error_message: errorMessage,
          });
        } catch {
          /* silent */
        }
      })();
    }

    return NextResponse.json(
      { error: 'Proxy request failed', message: errorMessage },
      { status: 502, headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  }
}
