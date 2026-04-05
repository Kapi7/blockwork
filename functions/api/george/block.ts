/**
 * GET /api/george/block?start=YYYY-MM-DD&name=...&focus=...
 *
 * Generates the next 3-week training block as structured JSON.
 * Returns an array of 21 sessions that the Playwright agent creates in TP.
 *
 * Auth: requires ?token= matching SYNC_TOKEN.
 */

import { getBearerToken, listWorkouts, completedOnly } from '../lib/tp-client';
import { generateBlock } from '../lib/claude-coach';

interface Env {
  TP_AUTH_COOKIE: string;
  ANTHROPIC_API_KEY: string;
  SYNC_TOKEN: string;
}

const ATHLETE_ID = 3030673;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function nextMondayISO(): string {
  const d = new Date();
  const daysUntilMon = (8 - d.getDay()) % 7 || 7;
  d.setDate(d.getDate() + daysUntilMon);
  return isoDate(d);
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const providedToken = url.searchParams.get('token');
  if (!env.SYNC_TOKEN || providedToken !== env.SYNC_TOKEN) {
    return new Response('Forbidden', { status: 403 });
  }

  const start = url.searchParams.get('start') || nextMondayISO();
  const name = url.searchParams.get('name') || 'Next Block';
  const focus = url.searchParams.get('focus') || 'Continue base/speed work — adapt based on last 28 days.';

  try {
    const token = await getBearerToken(env.TP_AUTH_COOKIE);

    const end = new Date();
    const backStart = new Date();
    backStart.setDate(backStart.getDate() - 28);
    const recent = await listWorkouts(token, ATHLETE_ID, isoDate(backStart), isoDate(end));
    const recentCompleted = completedOnly(recent);

    const sessions = await generateBlock(env.ANTHROPIC_API_KEY, recentCompleted, start, name, focus);

    return Response.json({
      coach: 'George',
      blockName: name,
      startDate: start,
      sessionCount: sessions.length,
      sessions,
    });
  } catch (err: any) {
    console.error('George block error:', err);
    return new Response(
      JSON.stringify({ error: err.message || 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
