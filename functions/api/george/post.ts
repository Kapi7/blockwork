/**
 * POST /api/george/post?token=... — run the full George loop:
 *
 *   1. Read recent TP workouts
 *   2. Find workouts needing George's reply
 *   3. Generate feedback via Claude
 *   4. POST the comment directly to TP via the fitness/v2 endpoint
 *   5. Return a summary
 *
 * This is 100% server-side — no Playwright needed. Runs in ~5-10 seconds.
 * Triggered by cron and by Strava webhook.
 */

import {
  getBearerToken,
  listWorkouts,
  completedOnly,
  plannedOnly,
  needsGeorgeReply,
  postWorkoutComment,
  formatWorkout,
  getAthleteSettings,
} from '../lib/tp-client';
import { generateSessionFeedback, generateChatReply } from '../lib/claude-coach';

interface Env {
  TP_AUTH_COOKIE: string;
  ANTHROPIC_API_KEY: string;
  SYNC_TOKEN: string;
}

const ATHLETE_ID = 3030673;

// George started on this date — don't post feedback on workouts BEFORE this.
// We keep older sessions in the context window but never comment on them.
const GEORGE_EPOCH = '2026-04-05';

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function runLoop(env: Env) {
  const token = await getBearerToken(env.TP_AUTH_COOKIE);

  // 7 days back to find recently-completed workouts
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 7);

  const workouts = await listWorkouts(token, ATHLETE_ID, isoDate(start), isoDate(end));

  // Live zones from TP settings
  const settings = await getAthleteSettings(token, ATHLETE_ID);

  // 60-day context for Claude — George needs long-term pattern awareness
  const contextStart = new Date();
  contextStart.setDate(contextStart.getDate() - 60);
  const contextWorkouts = await listWorkouts(token, ATHLETE_ID, isoDate(contextStart), isoDate(end));
  const contextCompleted = completedOnly(contextWorkouts).sort((a, b) =>
    (b.workoutDay || '').localeCompare(a.workoutDay || '')
  );

  // Upcoming planned (next 14 days)
  const futureEnd = new Date();
  futureEnd.setDate(futureEnd.getDate() + 14);
  const futureWorkouts = await listWorkouts(token, ATHLETE_ID, isoDate(end), isoDate(futureEnd));
  const upcoming = plannedOnly(futureWorkouts).sort((a, b) =>
    (a.workoutDay || '').localeCompare(b.workoutDay || '')
  );

  // Only look at workouts on or after the George epoch — no backfilling old sessions.
  const candidates = completedOnly(workouts)
    .filter((w) => (w.workoutDay || '').slice(0, 10) >= GEORGE_EPOCH)
    .sort((a, b) => (b.workoutDay || '').localeCompare(a.workoutDay || ''));

  const results: Array<{
    workoutId: number;
    date: string;
    title: string;
    reason: string;
    posted: boolean;
    error?: string;
    feedback?: string;
  }> = [];

  // Limit 5 posts per run for cost/time control
  for (const w of candidates.slice(0, 20)) {
    if (results.filter((r) => r.posted).length >= 5) break;

    const check = needsGeorgeReply(w);
    if (!check.needed) continue;

    const recent14d = contextCompleted
      .filter((x) => x.workoutId !== w.workoutId)
      .slice(0, 14);

    try {
      let feedback: string;
      if (check.reason === 'completed-no-reply') {
        feedback = await generateSessionFeedback({
          apiKey: env.ANTHROPIC_API_KEY,
          workout: w,
          recent14d,
          upcomingPlanned: upcoming,
          settings,
        });
      } else {
        feedback = await generateChatReply({
          apiKey: env.ANTHROPIC_API_KEY,
          workout: w,
          recent14d,
          upcomingPlanned: upcoming,
          settings,
        });
      }

      // Ensure George prefix
      let text = feedback.trim();
      if (!text.toLowerCase().startsWith('george:')) {
        text = `George: ${text}`;
      }

      await postWorkoutComment(token, ATHLETE_ID, w.workoutId, text);

      results.push({
        workoutId: w.workoutId,
        date: w.workoutDay.slice(0, 10),
        title: w.title,
        reason: check.reason,
        posted: true,
        feedback: text,
      });
    } catch (err: any) {
      results.push({
        workoutId: w.workoutId,
        date: w.workoutDay.slice(0, 10),
        title: w.title,
        reason: check.reason,
        posted: false,
        error: err.message,
      });
    }
  }

  return {
    coach: 'George',
    ranAt: new Date().toISOString(),
    checked: candidates.length,
    posted: results.filter((r) => r.posted).length,
    failed: results.filter((r) => !r.posted).length,
    results,
  };
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const providedToken = url.searchParams.get('token');
  if (!env.SYNC_TOKEN || providedToken !== env.SYNC_TOKEN) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const result = await runLoop(env);
    return Response.json(result);
  } catch (err: any) {
    console.error('George post error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Unknown error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

// Allow GET too for easy browser/curl testing
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  return onRequestPost(ctx);
};
