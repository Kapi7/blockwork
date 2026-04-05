/**
 * GET /api/george/debug-structure?token=...
 *
 * Debug endpoint: search the last 90 days of Itay's workouts for any that
 * have a non-null `structure` field, fetch full details, and return the
 * raw JSON shape. Used to reverse-engineer TP's structured workout schema.
 */

import { getBearerToken, listWorkouts } from '../lib/tp-client';

interface Env {
  TP_AUTH_COOKIE: string;
  SYNC_TOKEN: string;
}

const ATHLETE_ID = 3030673;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function getWorkoutRaw(token: string, athleteId: number, workoutId: number): Promise<any> {
  const url = `https://tpapi.trainingpeaks.com/fitness/v6/athletes/${athleteId}/workouts/${workoutId}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'User-Agent': 'blockwork-bridge',
    },
  });
  if (!res.ok) throw new Error(`getWorkoutRaw ${workoutId}: ${res.status}`);
  return res.json();
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  if (url.searchParams.get('token') !== env.SYNC_TOKEN) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const token = await getBearerToken(env.TP_AUTH_COOKIE);

    // Scan 180 days back and 30 days forward
    const start = new Date();
    start.setDate(start.getDate() - 180);
    const end = new Date();
    end.setDate(end.getDate() + 30);

    const workouts = await listWorkouts(token, ATHLETE_ID, isoDate(start), isoDate(end));

    // Full raw JSON of the most recent completed workout (to find embedded zones)
    const completed = workouts
      .filter((w: any) => (w.distance || 0) > 0 || (w.totalTime || 0) > 0)
      .sort((a: any, b: any) => (b.workoutDay || '').localeCompare(a.workoutDay || ''));

    const recentRaw = completed[0] ? await getWorkoutRaw(token, ATHLETE_ID, completed[0].workoutId) : null;

    // Filter to ones with any structure data
    const withStructure = workouts.filter((w: any) => {
      return w.structure && (typeof w.structure === 'object' || typeof w.structure === 'string');
    });

    const structureSamples: any[] = [];
    for (const w of withStructure.slice(0, 3)) {
      try {
        const raw = await getWorkoutRaw(token, ATHLETE_ID, w.workoutId);
        structureSamples.push({
          workoutId: w.workoutId,
          title: w.title,
          date: w.workoutDay,
          type: w.workoutTypeValueId,
          structure: raw.structure,
        });
      } catch {}
    }

    return Response.json({
      totalScanned: workouts.length,
      withStructure: withStructure.length,
      mostRecentCompleted: completed[0]
        ? { id: completed[0].workoutId, date: completed[0].workoutDay, title: completed[0].title }
        : null,
      mostRecentRawKeys: recentRaw ? Object.keys(recentRaw).sort() : [],
      mostRecentRaw: recentRaw,
      structureSamples,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => onRequestGet(ctx);
