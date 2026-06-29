/**
 * Innergy API Proxy — Cloudflare Worker
 *
 * Supported routes:
 *   GET  /proxy/projects                          → GET  /api/projects
 *   GET  /proxy/projects/:id/workOrders           → GET  /api/projects/:id/workOrders
 *   POST /proxy/workorders/:id/edit               → POST /api/projects/workOrders/:id/edit
 */

const INNERGY_API_PATH = '/api';

export interface Env {
  INNERGY_API_KEY: string;
  INNERGY_BASE_URL: string;
  ALLOWED_ORIGIN: string;
}

function corsHeaders(origin: string): HeadersInit {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(data: unknown, status: number, origin: string): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

function errorResponse(message: string, status: number, origin: string): Response {
  return jsonResponse({ error: message }, status, origin);
}

interface ParsedRoute {
  innergyPath: string | null;
}

function parseRoute(pathname: string): ParsedRoute {
  const stripped = pathname.replace(/^\/proxy/, '');

  if (stripped === '/projects') return { innergyPath: '/projects' };

  const woMatch = stripped.match(/^\/projects\/([^/]+)\/workOrders$/);
  if (woMatch) return { innergyPath: `/projects/${woMatch[1]}/workOrders` };

  const editMatch = stripped.match(/^\/workorders\/([^/]+)\/edit$/);
  if (editMatch) return { innergyPath: `/projects/workOrders/${editMatch[1]}/edit` };

  return { innergyPath: null };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url    = new URL(request.url);
    const origin = env.ALLOWED_ORIGIN || '*';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method !== 'GET' && request.method !== 'POST') {
      return errorResponse('Method not allowed', 405, origin);
    }

    if (!env.INNERGY_API_KEY || !env.INNERGY_BASE_URL) {
      console.error('Missing INNERGY_API_KEY or INNERGY_BASE_URL');
      return errorResponse('Proxy misconfigured', 500, origin);
    }

    const { innergyPath } = parseRoute(url.pathname);
    if (!innergyPath) {
      return errorResponse(`Unknown route: ${url.pathname}`, 404, origin);
    }

    const targetUrl = `${env.INNERGY_BASE_URL}${INNERGY_API_PATH}${innergyPath}${url.search}`;

    try {
      // Read body for POST so we can log it before forwarding
      let bodyText: string | undefined;
      if (request.method === 'POST') {
        bodyText = await request.text();
        console.log(`→ POST ${innergyPath}`);
        console.log(`→ Body: ${bodyText}`);
      }

      const innergyResponse = await fetch(targetUrl, {
        method: request.method,
        headers: {
          'Api-Key':      env.INNERGY_API_KEY,
          'Content-Type': 'application/json',
          'Accept':       'application/json',
        },
        body: bodyText,
      });

      const responseText = await innergyResponse.text();

      if (!innergyResponse.ok) {
        console.error(`← ${innergyResponse.status} ${request.method} ${innergyPath}`);
        console.error(`← Response: ${responseText}`);
        return jsonResponse(
          { error: `Innergy API returned ${innergyResponse.status}`, detail: responseText },
          innergyResponse.status,
          origin
        );
      }

      console.log(`← ${innergyResponse.status} OK ${request.method} ${innergyPath}`);

      // Parse JSON if possible, otherwise return raw text
      try {
        const data = JSON.parse(responseText);
        return jsonResponse(data, 200, origin);
      } catch {
        return new Response(responseText, {
          status: 200,
          headers: { 'Content-Type': 'text/plain', ...corsHeaders(origin) },
        });
      }

    } catch (err) {
      console.error('Proxy fetch error:', err);
      return errorResponse('Failed to reach Innergy API', 502, origin);
    }
  },
};
