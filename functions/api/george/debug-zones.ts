/**
 * GET /api/george/debug-zones?token=...
 *
 * Fetches Itay's HR + power zones from TrainingPeaks so George can
 * reference REAL zones instead of guessed BPM/watt numbers.
 * Tries multiple candidate endpoints since TP's zones API is undocumented.
 */

import { getBearerToken } from '../lib/tp-client';

interface Env {
  TP_AUTH_COOKIE: string;
  SYNC_TOKEN: string;
}

const ATHLETE_ID = 3030673;

async function tryFetch(token: string, url: string): Promise<{ url: string; status: number; body: any }> {
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'User-Agent': 'blockwork-bridge',
        Referer: 'https://app.trainingpeaks.com/',
      },
    });
    let body: any;
    const text = await res.text();
    try {
      body = JSON.parse(text);
    } catch {
      body = text.slice(0, 500);
    }
    return { url, status: res.status, body };
  } catch (e: any) {
    return { url, status: 0, body: e.message };
  }
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  if (url.searchParams.get('token') !== env.SYNC_TOKEN) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const token = await getBearerToken(env.TP_AUTH_COOKIE);
    const aid = ATHLETE_ID;

    // Try every plausible TP zone endpoint
    const candidates = [
      `https://tpapi.trainingpeaks.com/fitness/v6/athletes/${aid}/zones`,
      `https://tpapi.trainingpeaks.com/athlete/v1/athletes/${aid}/zones`,
      `https://tpapi.trainingpeaks.com/fitness/v6/athletes/${aid}/settings/zones`,
      `https://tpapi.trainingpeaks.com/fitness/v6/athletes/${aid}`,
      `https://tpapi.trainingpeaks.com/athlete/v1/athletes/${aid}`,
      `https://tpapi.trainingpeaks.com/athlete/v1/athletes/${aid}/settings`,
      `https://tpapi.trainingpeaks.com/athlete/v1/zones/athlete/${aid}`,
      `https://tpapi.trainingpeaks.com/fitness/v6/athletes/${aid}/hrZones`,
      `https://tpapi.trainingpeaks.com/fitness/v6/athletes/${aid}/powerZones`,
      `https://tpapi.trainingpeaks.com/fitness/v6/athletes/${aid}/paceZones`,
      `https://tpapi.trainingpeaks.com/users/v3/user`,
    ];

    const results = [];
    for (const u of candidates) {
      results.push(await tryFetch(token, u));
    }

    return Response.json({ athleteId: aid, results });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => onRequestGet(ctx);
