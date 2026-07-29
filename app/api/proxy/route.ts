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

// Infer proper mime types for images, fonts, stylesheets, and JSON APIs
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
  if (cleanUrl.includes('/youtubei/') || cleanUrl.endsWith('.json')) return 'application/json';
  return rawContentType || 'text/html';
}

// Unwrap proxy parameters and normalize user search queries vs valid URLs
function normalizeTargetUrl(input: string): string {
  let trimmed = input.trim();
  if (!trimmed) return 'https://example.com';

  // Unwrap proxy parameter if raw proxy string was passed
  if (trimmed.includes('/api/proxy?url=')) {
    try {
      const idx = trimmed.indexOf('/api/proxy?url=');
      const param = trimmed.slice(idx + '/api/proxy?url='.length);
      trimmed = decodeURIComponent(param);
    } catch {
      /* silent */
    }
  }

  // Convert protocol-relative URLs
  if (trimmed.startsWith('//')) {
    trimmed = 'https:' + trimmed;
  }

  if (!/^https?:\/\//i.test(trimmed)) {
    if (trimmed.includes(' ') || !trimmed.includes('.')) {
      return `https://www.google.com/search?gbv=1&q=${encodeURIComponent(trimmed)}`;
    }
    trimmed = `https://${trimmed}`;
  }

  // Route YouTube desktop URLs to m.youtube.com to bypass desktop Polymer SPA CORS blocks
  if (/^https?:\/\/(www\.)?youtube\.com/i.test(trimmed)) {
    trimmed = trimmed.replace(/^https?:\/\/(www\.)?youtube\.com/i, 'https://m.youtube.com');
  }

  if (trimmed.includes('google.com/search') && !trimmed.includes('gbv=1')) {
    trimmed += (trimmed.includes('?') ? '&' : '?') + 'gbv=1';
  }

  return trimmed;
}

// Rewrite relative url(...) in CSS stylesheets
function processCssUrls(cssContent: string, targetUrl: string, requestOrigin: string): string {
  return cssContent.replace(/url\(['"]?([^'"\)]+)['"]?\)/gi, (_, rawUrl) => {
    if (!rawUrl || rawUrl.startsWith('data:') || rawUrl.startsWith('blob:') || rawUrl.startsWith('#')) {
      return `url("${rawUrl}")`;
    }
    let cleanRaw = rawUrl;
    if (cleanRaw.startsWith('//')) {
      cleanRaw = 'https:' + cleanRaw;
    }
    try {
      const abs = new URL(cleanRaw, targetUrl).href;
      return `url("${requestOrigin}/api/proxy?url=${encodeURIComponent(abs)}")`;
    } catch {
      return `url("${rawUrl}")`;
    }
  });
}

// ─── Comprehensive HTML & Asset Rewriter + In-Iframe Fetch & XHR Proxy Interceptor ──────
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

      let cleanRaw = raw;
      if (cleanRaw.startsWith('//')) {
        cleanRaw = 'https:' + cleanRaw;
      }

      if (cleanRaw.includes('/api/proxy?url=')) {
        return cleanRaw;
      }

      try {
        const abs = new URL(cleanRaw, targetUrl).href;
        if (abs.startsWith(requestOrigin) && !abs.includes('/api/proxy?url=')) {
          return raw;
        }
        return `${requestOrigin}/api/proxy?url=${encodeURIComponent(abs)}`;
      } catch {
        return raw;
      }
    };

    let rewritten = content;

    // PostMessage navigation + Monkey-patch fetch & XHR to proxy all SPA API calls:
    const interceptorScript = `
      <script>
        (function() {
          try {
            var targetUrl = '${targetUrl}';
            var requestOrigin = '${requestOrigin}';

            // 1. Monkey-patch window.fetch to route all API calls (e.g. YouTube InnerTube API) through /api/proxy
            if (window.fetch) {
              var origFetch = window.fetch;
              window.fetch = function(input, init) {
                try {
                  var urlStr = (typeof input === 'string') ? input : (input && input.url ? input.url : '');
                  if (urlStr && typeof urlStr === 'string' && !urlStr.startsWith('data:') && !urlStr.startsWith('blob:')) {
                    if (!urlStr.includes('/api/proxy?url=')) {
                      var absUrl = new URL(urlStr, targetUrl).href;
                      if (!absUrl.startsWith(requestOrigin)) {
                        var proxyUrl = requestOrigin + '/api/proxy?url=' + encodeURIComponent(absUrl);
                        if (typeof input === 'string') {
                          input = proxyUrl;
                        } else if (input && input.url) {
                          input = new Request(proxyUrl, input);
                        }
                      }
                    }
                  }
                } catch(e) {}
                return origFetch.call(this, input, init);
              };
            }

            // 2. Monkey-patch XMLHttpRequest to route all AJAX calls through /api/proxy
            if (window.XMLHttpRequest) {
              var origOpen = XMLHttpRequest.prototype.open;
              XMLHttpRequest.prototype.open = function(method, url, async, user, pass) {
                try {
                  if (url && typeof url === 'string' && !url.startsWith('data:') && !url.startsWith('blob:')) {
                    if (!url.includes('/api/proxy?url=')) {
                      var absUrl = new URL(url, targetUrl).href;
                      if (!absUrl.startsWith(requestOrigin)) {
                        url = requestOrigin + '/api/proxy?url=' + encodeURIComponent(absUrl);
                      }
                    }
                  }
                } catch(e) {}
                return origOpen.call(this, method, url, async, user, pass);
              };
            }

            function postNav(url) {
              if (!url) return;
              try {
                window.parent.postMessage({ type: 'NETBYPASS_NAVIGATE', url: url }, '*');
              } catch(e) {}
            }

            // 3. Intercept Link Clicks
            document.addEventListener('click', function(e) {
              var anchor = e.target.closest('a');
              if (!anchor) return;
              var href = anchor.getAttribute('href');
              if (!href || href.startsWith('javascript:') || href.startsWith('#') || href.startsWith('data:')) return;

              e.preventDefault();
              try {
                var absUrl = new URL(href, targetUrl).href;
                postNav(absUrl);
              } catch(err) {
                postNav(href);
              }
            }, true);

            // 4. Intercept Form Submits
            document.addEventListener('submit', function(e) {
              var form = e.target;
              if (!form) return;
              var action = form.getAttribute('action') || '';
              if (action.startsWith('javascript:')) return;

              e.preventDefault();
              try {
                var formData = new FormData(form);
                var params = new URLSearchParams(formData).toString();
                var absAction = new URL(action || '', targetUrl).href;
                var finalUrl = absAction + (absAction.includes('?') ? '&' : '?') + params;
                postNav(finalUrl);
              } catch(err) {}
            }, true);

            // 5. Intercept Enter Key Press
            document.addEventListener('keydown', function(e) {
              if (e.key === 'Enter') {
                var target = e.target;
                if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
                  var form = target.closest('form');
                  if (form) {
                    e.preventDefault();
                    var action = form.getAttribute('action') || '';
                    var formData = new FormData(form);
                    var params = new URLSearchParams(formData).toString();
                    try {
                      var absAction = new URL(action || '', targetUrl).href;
                      var finalUrl = absAction + (absAction.includes('?') ? '&' : '?') + params;
                      postNav(finalUrl);
                    } catch(err) {}
                  }
                }
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
        } else if (resCt.includes('text/css')) {
          finalBody = processCssUrls(finalBody, targetUrl, requestOrigin);
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
    const isMobileTarget = targetUrl.includes('google.com') || targetUrl.includes('youtube.com') || targetUrl.includes('youtu.be');
    const fetchOptions: RequestInit = {
      method,
      headers: {
        'User-Agent': isMobileTarget
          ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
          : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Ch-Ua': isMobileTarget ? '"Apple Safari";v="17"' : '"Google Chrome";v="123", "Not:A-Brand";v="8", "Chromium";v="123"',
        'Sec-Ch-Ua-Mobile': isMobileTarget ? '?1' : '?0',
        'Sec-Ch-Ua-Platform': isMobileTarget ? '"iOS"' : '"Windows"',
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
      if (contentType.includes('text/html')) {
        finalResponseBody = processHtmlAndCss(rawText, targetUrl, requestOrigin);
      } else {
        finalResponseBody = processCssUrls(rawText, targetUrl, requestOrigin);
      }
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
