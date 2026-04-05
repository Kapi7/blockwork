/**
 * GET /api/george?mode=session|weekly|latest
 *
 * Calls TP to read recent workouts, asks Claude (as "George") for analysis,
 * returns the feedback as JSON. This is the read-side of the coaching pipeline.
 *
 * Query params:
 *   mode = 'latest' (default) — analyzes the most recent completed workout
 *        = 'weekly'           — weekly summary of the last 7 days
 *   date = YYYY-MM-DD         — optional, analyze workout for specific date
 */

import { getBearerToken, listWorkouts, formatWorkout } from './lib/tp-client';
import { generateSessionFeedback, generateWeeklyFeedback } from './lib/claude-coach';

interface Env {
  TP_AUTH_COOKIE: string;
  ANTHROPIC_API_KEY: string;
  DB?: D1Database;
}

const ATHLETE_ID = 3030673;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const mode = url.searchParams.get('mode') || 'latest';
  const specificDate = url.searchParams.get('date');

  try {
    if (!env.TP_AUTH_COOKIE) {
      return jsonError('TP_AUTH_COOKIE secret not configured', 500);
    }
    if (!env.ANTHROPIC_API_KEY) {
      return jsonError('ANTHROPIC_API_KEY secret not configured', 500);
    }

    const token = await getBearerToken(env.TP_AUTH_COOKIE);

    // Fetch 30 days of context
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);

    const allWorkouts = await listWorkouts(token, ATHLETE_ID, isoDate(start), isoDate(end));

    // Only completed workouts with data
    const completed = allWorkouts.filter((w) => w.distance && w.distance > 0);
    completed.sort((a, b) => b.workoutDay.localeCompare(a.workoutDay));

    if (completed.length === 0) {
      return Response.json({ mode, message: 'No completed workouts found in the last 30 days' });
    }

    if (mode === 'weekly') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const weekCutoff = isoDate(sevenDaysAgo);

      const thisWeek = completed.filter((w) => w.workoutDay.slice(0, 10) >= weekCutoff);
      const previousWeeks = completed.filter((w) => w.workoutDay.slice(0, 10) < weekCutoff);

      const feedback = await generateWeeklyFeedback(env.ANTHROPIC_API_KEY, thisWeek, previousWeeks);

      return Response.json({
        mode: 'weekly',
        coach: 'George',
        periodStart: weekCutoff,
        periodEnd: isoDate(end),
        workoutCount: thisWeek.length,
        workouts: thisWeek.map(formatWorkout),
        feedback,
      });
    }

    // mode === 'latest' (session)
    let target;
    if (specificDate) {
      target = completed.find((w) => w.workoutDay.slice(0, 10) === specificDate);
      if (!target) return jsonError(`No completed workout on ${specificDate}`, 404);
    } else {
      target = completed[0];
    }

    const recent14d = completed.filter((w) => w.workoutId !== target.workoutId).slice(0, 14);

    const feedback = await generateSessionFeedback({
      apiKey: env.ANTHROPIC_API_KEY,
      workout: target,
      recent14d,
    });

    return Response.json({
      mode: 'session',
      coach: 'George',
      workout: {
        id: target.workoutId,
        date: target.workoutDay.slice(0, 10),
        title: target.title,
        summary: formatWorkout(target),
      },
      feedback,
      recent14dCount: recent14d.length,
    });
  } catch (err: any) {
    console.error('George error:', err);
    return jsonError(err.message || 'Unknown error', 500);
  }
};

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
