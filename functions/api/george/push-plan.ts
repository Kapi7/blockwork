/**
 * POST /api/george/push-plan?token=...&block=0
 *
 * Pushes all sessions from a training block into the TP calendar as
 * actual planned workouts. Uses the sessions array defined in
 * functions/api/lib/training-plan.ts.
 *
 * Safe to re-run: by default, skips dates that already have a workout
 * for the same sport type on that day. Pass &force=1 to push anyway.
 */

import {
  getBearerToken,
  listWorkouts,
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

  const blockNumParam = url.searchParams.get('block');
  const force = url.searchParams.get('force') === '1';

  try {
    const token = await getBearerToken(env.TP_AUTH_COOKIE);

    // Determine which block to push
    const blockNum = blockNumParam ? parseInt(blockNumParam, 10) : 0;
    const block = BLOCKS.find((b) => b.number === blockNum);
    if (!block) {
      return jsonError(`Block ${blockNum} not found`, 404);
    }

    if (!block.sessions || block.sessions.length === 0) {
      return jsonError(`Block ${block.name} has no sessions defined`, 400);
    }

    // Read existing workouts in the block's date range to avoid duplicates
    const existing = await listWorkouts(token, ATHLETE_ID, block.startDate, block.endDate);
    const existingByDateType = new Set<string>();
    for (const w of existing) {
      const date = (w.workoutDay || '').slice(0, 10);
      const key = `${date}_${w.workoutTypeValueId}`;
      existingByDateType.add(key);
    }

    const results: Array<{
      date: string;
      title: string;
      type: number;
      status: 'created' | 'skipped' | 'error';
      workoutId?: number;
      reason?: string;
    }> = [];

    for (const session of block.sessions) {
      const key = `${session.date}_${session.workoutType}`;

      if (!force && existingByDateType.has(key)) {
        results.push({
          date: session.date,
          title: session.title,
          type: session.workoutType,
          status: 'skipped',
          reason: 'workout of same type already exists on this date',
        });
        continue;
      }

      try {
        const result = await createWorkout(token, {
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

        results.push({
          date: session.date,
          title: session.title,
          type: session.workoutType,
          status: 'created',
          workoutId: result.workoutId,
        });
        // Register so a later session on the same date+type is deduped too
        existingByDateType.add(key);
      } catch (err: any) {
        results.push({
          date: session.date,
          title: session.title,
          type: session.workoutType,
          status: 'error',
          reason: err.message,
        });
      }
    }

    return Response.json({
      coach: 'George',
      block: {
        number: block.number,
        name: block.name,
        phase: block.phase,
        dates: `${block.startDate} to ${block.endDate}`,
      },
      summary: {
        total: results.length,
        created: results.filter((r) => r.status === 'created').length,
        skipped: results.filter((r) => r.status === 'skipped').length,
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
