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

// Infer proper mime types for images, fonts, and stylesheets if headers are missing or generic
function inferContentType(url: string, rawContentType?: string | null): string {
  if (
    rawContentType &&
    !rawContentType.includes('octet-stream') &&
    !rawContentType.includes('text/plain')
  ) {
    return rawContentType;
  }
  const cleanUrl = url.split('?')[0].split('#')[0].toLowerCase();
  if (cleanUrl.endsWith('.svg')) return 'image/svg+xml';
  if (cleanUrl.endsWith('.png')) return 'image/png';
  if (cleanUrl.endsWith('.jpg') || cleanUrl.endsWith('.jpeg')) return 'image/jpeg';
  if (cleanUrl.endsWith('.webp')) return 'image/webp';
  if (cleanUrl.endsWith('.gif')) return 'image/gif';
  if (cleanUrl.endsWith('.ico')) return 'image/x-icon';
  if (cleanUrl.endsWith('.avif')) return 'image/avif';
  if (cleanUrl.endsWith('.woff2')) return 'font/woff2';
  if (cleanUrl.endsWith('.woff')) return 'font/woff';
  if (cleanUrl.endsWith('.css')) return 'text/css';
  if (cleanUrl.endsWith('.js')) return 'text/javascript';
  return rawContentType || 'text/html';
}

// Normalize user search queries vs valid URLs
function normalizeTargetUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return 'https://example.com';

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.includes(' ') || !trimmed.includes('.')) {
    return `https://html.duckduckgo.com/html/?q=${encodeURIComponent(trimmed)}`;
  }

  return `https://${trimmed}`;
}

// ─── Comprehensive HTML & Asset Rewriter + In-Iframe Interceptor ──────
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

    // Inline JS script to intercept link clicks and form submits inside the iframe
    const interceptorScript = `
      <script>
        (function() {
          try {
            document.addEventListener('click', function(e) {
              var anchor = e.target.closest('a');
              if (anchor && anchor.href && !anchor.href.startsWith('javascript:')) {
                var href = anchor.getAttribute('href');
                if (href && !href.startsWith('#')) {
                  e.preventDefault();
                  var absUrl = anchor.href;
                  if (absUrl.startsWith(window.location.origin + '/api/proxy?url=')) {
                    window.location.href = absUrl;
                  } else {
                    window.location.href = '${requestOrigin}/api/proxy?url=' + encodeURIComponent(absUrl);
                  }
                }
              }
            }, true);

            document.addEventListener('submit', function(e) {
              var form = e.target;
              if (form && form.action) {
                e.preventDefault();
                var formData = new FormData(form);
                var params = new URLSearchParams(formData).toString();
                var actionUrl = form.action;
                var finalUrl = actionUrl + (actionUrl.includes('?') ? '&' : '?') + params;
                window.location.href = '${requestOrigin}/api/proxy?url=' + encodeURIComponent(finalUrl);
              }
            }, true);
          } catch(err) {}
        })();
      </script>
    `;

    // 1. Inject <base> tag, referrer policy, and interceptor script
    const baseTag = `<base href="${targetOrigin}/" /><meta name="referrer" content="no-referrer" />${interceptorScript}`;
    if (/<head[^>]*>/i.test(rewritten)) {
      rewritten = rewritten.replace(/(<head[^>]*>)/i, `$1${baseTag}`);
    } else if (/<html[^>]*>/i.test(rewritten)) {
      rewritten = rewritten.replace(/(<html[^>]*>)/i, `$1${baseTag}`);
    } else {
      rewritten = baseTag + rewritten;
    }

    // 2. Rewrite src & data-src (images, logos, scripts, svgs, media, iframes)
    rewritten = rewritten.replace(/\b(src|data-src|poster|data)=["']([^"']+)["']/gi, (_, attr, url) => {
      return `${attr}="${makeProxyUrl(url)}"`;
    });

    // 3. Rewrite href & xlink:href (stylesheets, icons, SVG images, links)
    rewritten = rewritten.replace(/\b(href|xlink:href)=["']([^"']+)["']/gi, (_, attr, url) => {
      return `${attr}="${makeProxyUrl(url)}"`;
    });

    // 4. Rewrite srcset & data-srcset (responsive images & lazy loaded picture candidates)
    rewritten = rewritten.replace(/\b(srcset|data-srcset)=["']([^"']+)["']/gi, (_, attr, srcset) => {
      const parts = srcset.split(',').map((part: string) => {
        const trimmed = part.trim();
        const spaceIdx = trimmed.indexOf(' ');
        if (spaceIdx === -1) return makeProxyUrl(trimmed);
        const url = trimmed.slice(0, spaceIdx);
        const descriptor = trimmed.slice(spaceIdx);
        return `${makeProxyUrl(url)}${descriptor}`;
      });
      return `${attr}="${parts.join(', ')}"`;
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
  const rawInput = searchParams.get('url');

  if (!rawInput) {
    return NextResponse.json({ error: 'Missing ?url= parameter' }, { status: 400 });
  }

  const targetUrl = normalizeTargetUrl(rawInput);

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
        const resCt = inferContentType(targetUrl, responseData.contentType);

        if (resCt.includes('text/html')) {
          finalBody = processHtmlAndCss(finalBody, targetUrl, requestOrigin);
        }

        const encoder = new TextEncoder();
        return new NextResponse(encoder.encode(finalBody), {
          status: 200,
          headers: {
            'Content-Type': resCt,
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': resCt.startsWith('image/') ? 'public, max-age=86400' : 'no-cache',
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
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Ch-Ua': '"Google Chrome";v="123", "Not:A-Brand";v="8", "Chromium";v="123"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
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
    contentType = inferContentType(targetUrl, response.headers.get('content-type'));

    let finalResponseBody: BodyInit;

    if (contentType.includes('text/html') || contentType.includes('text/css')) {
      const rawText = await response.text();
      finalResponseBody = contentType.includes('text/html')
        ? processHtmlAndCss(rawText, targetUrl, requestOrigin)
        : rawText;
    } else {
      finalResponseBody = await response.arrayBuffer();
    }

    responseSize =
      typeof finalResponseBody === 'string'
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
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'X-Proxied-By': 'NetBypass/Direct',
        'X-Latency-Ms': String(latency),
        'X-Status-Code': String(statusCode),
        'X-Backend': 'next-direct',
        'Content-Type': contentType,
        'Cache-Control': contentType.startsWith('image/') || contentType.startsWith('font/') ? 'public, max-age=86400' : 'no-cache',
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
