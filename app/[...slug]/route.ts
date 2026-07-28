import { NextRequest, NextResponse } from 'next/server';

// Catch-all route for any unhandled path (e.g. /watch, /about, /search, /static/...)
// Prevents Next.js "404 | This page could not be found" screen when relative links
// or JavaScript location redirects happen inside proxied web pages!
export async function GET(request: NextRequest) {
  return handleCatchAll(request, 'GET');
}

export async function POST(request: NextRequest) {
  return handleCatchAll(request, 'POST');
}

async function handleCatchAll(request: NextRequest, method: string) {
  const { pathname, search, origin } = new URL(request.url);

  // If request comes from a Referer header that contains a proxied target URL:
  const referer = request.headers.get('referer');
  if (referer && referer.includes('/api/proxy?url=')) {
    try {
      const refererUrlObj = new URL(referer);
      const targetParam = refererUrlObj.searchParams.get('url');
      if (targetParam) {
        const targetOrigin = new URL(targetParam).origin;
        const resolvedTargetUrl = `${targetOrigin}${pathname}${search}`;
        return NextResponse.redirect(`${origin}/api/proxy?url=${encodeURIComponent(resolvedTargetUrl)}`);
      }
    } catch {
      /* fallback */
    }
  }

  // Otherwise redirect to homepage instead of throwing 404
  return NextResponse.redirect(origin);
}
