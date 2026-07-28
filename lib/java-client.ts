/**
 * java-client.ts
 *
 * Helper for calling the Java Spring Boot microservice from Next.js API routes.
 *
 * The Java service URL is set via the JAVA_SERVICE_URL environment variable.
 * In development (no Java service running), falls back to the internal
 * Supabase-based implementation automatically.
 *
 * Architecture:
 *   Browser → Next.js API route (Vercel) → Java Service (Railway) → Supabase
 */

const JAVA_SERVICE_URL = process.env.JAVA_SERVICE_URL?.replace(/\/$/, '');

/**
 * Returns true if the Java backend URL is configured.
 * Falls back to direct Supabase mode if not set.
 */
export function isJavaServiceConfigured(): boolean {
  return !!JAVA_SERVICE_URL && JAVA_SERVICE_URL !== 'https://placeholder.railway.app';
}

/**
 * Calls the Java service's proxy endpoint.
 * Returns the raw Response from the Java backend so the Next.js route
 * can stream it directly back to the browser.
 */
export async function callJavaProxy(
  targetUrl: string,
  method: string,
  body?: string,
  contentType?: string
): Promise<Response> {
  const javaUrl = `${JAVA_SERVICE_URL}/api/proxy?url=${encodeURIComponent(targetUrl)}`;

  const fetchOptions: RequestInit = {
    method,
    headers: {
      'Content-Type': contentType || 'application/json',
    },
  };

  if (method === 'POST' && body) {
    fetchOptions.body = body;
  }

  return fetch(javaUrl, fetchOptions);
}

/**
 * Fetches recent proxy logs from the Java service.
 */
export async function fetchJavaLogs(limit = 20): Promise<Response> {
  return fetch(`${JAVA_SERVICE_URL}/api/logs?limit=${limit}`);
}

/**
 * Fetches proxy rules from the Java service.
 */
export async function fetchJavaRules(): Promise<Response> {
  return fetch(`${JAVA_SERVICE_URL}/api/rules`);
}

/**
 * Creates a new proxy rule via the Java service.
 */
export async function createJavaRule(
  pattern: string,
  action: string,
  description?: string
): Promise<Response> {
  return fetch(`${JAVA_SERVICE_URL}/api/rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pattern, action, description }),
  });
}

/**
 * Fetches service status from the Java backend.
 */
export async function fetchJavaStatus(): Promise<Response> {
  return fetch(`${JAVA_SERVICE_URL}/api/status`);
}
