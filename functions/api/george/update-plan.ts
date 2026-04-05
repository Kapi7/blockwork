/**
 * POST /api/george/update-plan?token=...&block=N[&limit=25]
 *
 * Updates EXISTING block workouts in place — no delete, no recreate.
 * Matches planned workouts in the block's date range by (date, workoutType, title
 * prefix) and patches description + structure + workoutTypeValueId.
 *
 * Also: creates any missing sessions from the plan (fills gaps).
 *
 * Paginated with `limit` to stay under Cloudflare Workers' 50 subrequest cap.
 * Each workout update costs 2 subrequests (GET current + PUT merged).
 */

import {
  getBearerToken,
  listWorkouts,
  updateWorkout,
  createWorkout,
} from '../lib/tp-client';
import { BLOCKS } from '../lib/training-plan';

interface Env {
  TP_AUTH_COOKIE: string;
  SYNC_TOKEN: string;
}

const ATHLETE_ID = 3030673;

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  if (url.searchParams.get('token') !== env.SYNC_TOKEN) {
    return new Response('Forbidden', { status: 403 });
  }

  const blockNum = parseInt(url.searchParams.get('block') || '1', 10);
  const limit = parseInt(url.searchParams.get('limit') || '20', 10);

  try {
    const token = await getBearerToken(env.TP_AUTH_COOKIE);
    const block = BLOCKS.find((b) => b.number === blockNum);
    if (!block) return jsonError(`Block ${blockNum} not found`, 404);
    if (!block.sessions || block.sessions.length === 0) {
      return jsonError(`Block ${block.name} has no sessions`, 400);
    }

    const existing = await listWorkouts(token, ATHLETE_ID, block.startDate, block.endDate);
    // Index by (date, type) for matching. A session's title is matched loosely.
    const byDateType = new Map<string, any[]>();
    for (const w of existing) {
      const date = (w.workoutDay || '').slice(0, 10);
      const key = `${date}_${w.workoutTypeValueId}`;
      if (!byDateType.has(key)) byDateType.set(key, []);
      byDateType.get(key)!.push(w);
    }

    const results: any[] = [];
    let opCount = 0;

    for (const session of block.sessions) {
      // Budget: each update = 2 subrequests, each create = 1. Keep headroom.
      if (opCount >= limit) {
        results.push({ date: session.date, title: session.title, status: 'deferred' });
        continue;
      }

      const key = `${session.date}_${session.workoutType}`;
      const candidates = byDateType.get(key) || [];
      // Match by title similarity (loose): any existing workout with same first word
      // or with a title that the session title starts with (or vice versa).
      const firstWord = (s: string) => (s || '').trim().split(/\s+/)[0].toLowerCase();
      const match = candidates.find((w) => {
        const eTitle = (w.title || '').toLowerCase();
        const sTitle = session.title.toLowerCase();
        return (
          eTitle === sTitle ||
          eTitle.startsWith(sTitle) ||
          sTitle.startsWith(eTitle) ||
          firstWord(w.title) === firstWord(session.title)
        );
      }) || candidates[0];

      if (match) {
        // Safety: don't modify already-COMPLETED workouts (has actual distance/time)
        const hasActual = (match.distance || 0) > 0 || (match.totalTime || 0) > 0 || (match.tssActual || 0) > 0;
        if (hasActual) {
          results.push({
            date: session.date,
            title: session.title,
            status: 'skipped-completed',
            workoutId: match.workoutId,
          });
          continue;
        }
        try {
          await updateWorkout(token, ATHLETE_ID, match.workoutId, {
            title: session.title,
            description: session.description,
            workoutTypeValueId: session.workoutType,
            distancePlanned: session.distancePlanned,
            totalTimePlanned: session.totalTimePlanned,
            tssPlanned: session.tssPlanned,
            structure: session.structure,
          });
          opCount += 2; // GET + PUT
          results.push({
            date: session.date,
            title: session.title,
            status: 'updated',
            workoutId: match.workoutId,
          });
        } catch (e: any) {
          results.push({
            date: session.date,
            title: session.title,
            status: 'error',
            reason: e.message,
          });
        }
      } else {
        // No existing match — create fresh
        try {
          const created = await createWorkout(token, {
            athleteId: ATHLETE_ID,
            workoutDay: session.date,
            title: session.title,
            workoutTypeValueId: session.workoutType,
            description: session.description,
            distancePlanned: session.distancePlanned,
            totalTimePlanned: session.totalTimePlanned,
            tssPlanned: session.tssPlanned,
            structure: session.structure,
          });
          opCount += 1;
          results.push({
            date: session.date,
            title: session.title,
            status: 'created',
            workoutId: created.workoutId,
          });
        } catch (e: any) {
          results.push({
            date: session.date,
            title: session.title,
            status: 'error',
            reason: e.message,
          });
        }
      }
    }

    return Response.json({
      block: { number: block.number, name: block.name, dates: `${block.startDate} to ${block.endDate}` },
      summary: {
        updated: results.filter((r) => r.status === 'updated').length,
        created: results.filter((r) => r.status === 'created').length,
        skippedCompleted: results.filter((r) => r.status === 'skipped-completed').length,
        deferred: results.filter((r) => r.status === 'deferred').length,
        errors: results.filter((r) => r.status === 'error').length,
      },
      results,
    });
  } catch (err: any) {
    return jsonError(err.message || 'Unknown error', 500);
  }
};

export const onRequestGet: PagesFunction<Env> = async (ctx) => onRequestPost(ctx);

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
