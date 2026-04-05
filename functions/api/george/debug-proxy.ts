/**
 * GET /api/george/debug-proxy?token=...&path=/fitness/v6/...
 *
 * Proxies an authenticated GET request to any tpapi.trainingpeaks.com path.
 * Allows interactive enumeration of TP's undocumented API for zones, etc.
 * Allowlist: only tpapi.trainingpeaks.com hostname allowed.
 */

import { getBearerToken } from '../lib/tp-client';

interface Env {
  TP_AUTH_COOKIE: string;
  SYNC_TOKEN: string;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  if (url.searchParams.get('token') !== env.SYNC_TOKEN) {
    return new Response('Forbidden', { status: 403 });
  }

  const path = url.searchParams.get('path');
  if (!path || !path.startsWith('/')) {
    return new Response(JSON.stringify({ error: 'Provide ?path=/fitness/v6/...' }), { status: 400 });
  }

  try {
    const token = await getBearerToken(env.TP_AUTH_COOKIE);
    const targetUrl = `https://tpapi.trainingpeaks.com${path}`;

    const res = await fetch(targetUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'User-Agent': 'blockwork-bridge',
        Referer: 'https://app.trainingpeaks.com/',
      },
    });

    const contentType = res.headers.get('content-type') || '';
    const body = await res.text();

    return new Response(
      JSON.stringify({
        targetUrl,
        status: res.status,
        contentType,
        bodyLength: body.length,
        body: contentType.includes('json') ? JSON.parse(body) : body.slice(0, 2000),
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => onRequestGet(ctx);
