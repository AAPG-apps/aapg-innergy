/**
 * Innergy API Proxy — Cloudflare Worker
 *
 * Protects the Innergy API key by keeping it server-side.
 * The React frontend calls this Worker; the Worker forwards
 * requests to https://app.innergy.com/api with the key injected.
 *
 * Supported routes (all GET, read-only):
 *   /proxy/projects                    → GET /api/projects
 *   /proxy/projects/:id/workOrders     → GET /api/projects/:id/workOrders
 *
 * Environment variable required (set in wrangler.toml or Cloudflare dashboard):
 *   INNERGY_API_KEY   — your Innergy API key
 *   INNERGY_BASE_URL  — e.g. https://app.innergy.com  (no trailing slash)
 *   ALLOWED_ORIGIN    — your Cloudflare Pages domain, e.g. https://innergy-dashboard.pages.dev
 */

const INNERGY_API_PATH = '/api';

export interface Env {
  INNERGY_API_KEY: string;
  INNERGY_BASE_URL: string;
  ALLOWED_ORIGIN: string;
}

// ─── CORS helper ──────────────────────────────────────────────────────────────

function corsHeaders(origin: string): HeadersInit {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(
  data: unknown,
  status: number,
  origin: string
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(origin),
    },
  });
}

function errorResponse(
  message: string,
  status: number,
  origin: string
): Response {
  return jsonResponse({ error: message }, status, origin);
}

// ─── Route parser ─────────────────────────────────────────────────────────────

interface ParsedRoute {
  innergyPath: string | null;
}

function parseRoute(pathname: string): ParsedRoute {
  // Strip leading /proxy prefix
  const stripped = pathname.replace(/^\/proxy/, '');

  // /projects
  if (stripped === '/projects') {
    return { innergyPath: '/projects' };
  }

  // /projects/:id/workOrders
  const woMatch = stripped.match(/^\/projects\/([^/]+)\/workOrders$/);
  if (woMatch) {
    return { innergyPath: `/projects/${woMatch[1]}/workOrders` };
  }

  return { innergyPath: null };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = env.ALLOWED_ORIGIN || '*';

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // Only allow GET
    if (request.method !== 'GET') {
      return errorResponse('Method not allowed', 405, origin);
    }

    // Validate env vars
    if (!env.INNERGY_API_KEY || !env.INNERGY_BASE_URL) {
      console.error('Missing INNERGY_API_KEY or INNERGY_BASE_URL environment variables');
      return errorResponse('Proxy misconfigured', 500, origin);
    }

    // Parse route
    const { innergyPath } = parseRoute(url.pathname);
    if (!innergyPath) {
      return errorResponse(`Unknown route: ${url.pathname}`, 404, origin);
    }

    // Forward query parameters (pagination, filters) if present
    const targetUrl = `${env.INNERGY_BASE_URL}${INNERGY_API_PATH}${innergyPath}${url.search}`;

    try {
      const innergyResponse = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'API-Key': env.INNERGY_API_KEY,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      });

      if (!innergyResponse.ok) {
        const text = await innergyResponse.text();
        console.error(`Innergy API error ${innergyResponse.status}: ${text}`);
        return errorResponse(
          `Innergy API returned ${innergyResponse.status}`,
          innergyResponse.status,
          origin
        );
      }

      const data = await innergyResponse.json();
      return jsonResponse(data, 200, origin);

    } catch (err) {
      console.error('Proxy fetch error:', err);
      return errorResponse('Failed to reach Innergy API', 502, origin);
    }
  },
};
