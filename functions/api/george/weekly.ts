/**
 * GET/POST /api/george/weekly?token=...
 *
 * Generates a weekly review + next-week brief and posts it as a
 * CALENDAR NOTE on Monday (today) so it's visible at the top of the
 * week in TP. Runs via Monday cron.
 */

import {
  getBearerToken,
  listWorkouts,
  completedOnly,
  plannedOnly,
  createCalendarNote,
} from '../lib/tp-client';
import { generateWeeklyFeedback } from '../lib/claude-coach';
import { currentBlock, nextBlock, daysLeftInBlock } from '../lib/training-plan';

interface Env {
  TP_AUTH_COOKIE: string;
  ANTHROPIC_API_KEY: string;
  SYNC_TOKEN: string;
}

const ATHLETE_ID = 3030673;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Get Monday of the current week (or today if today is Monday). */
function mondayOfCurrentWeek(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Sunday rolls to last Mon
  d.setDate(d.getDate() + diff);
  return isoDate(d);
}

async function runWeekly(env: Env) {
  const token = await getBearerToken(env.TP_AUTH_COOKIE);

  const today = new Date();
  const todayStr = isoDate(today);
  const monday = mondayOfCurrentWeek();

  // Last 7 days
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);
  const weekWorkouts = await listWorkouts(token, ATHLETE_ID, isoDate(weekStart), todayStr);
  const weekCompleted = completedOnly(weekWorkouts).sort((a, b) =>
    (a.workoutDay || '').localeCompare(b.workoutDay || '')
  );

  // Previous 3 weeks for trend
  const prevStart = new Date();
  prevStart.setDate(prevStart.getDate() - 28);
  const prevEnd = new Date();
  prevEnd.setDate(prevEnd.getDate() - 8);
  const prevWorkouts = await listWorkouts(token, ATHLETE_ID, isoDate(prevStart), isoDate(prevEnd));
  const prevCompleted = completedOnly(prevWorkouts);

  // Upcoming week planned
  const futureEnd = new Date();
  futureEnd.setDate(futureEnd.getDate() + 8);
  const futureWorkouts = await listWorkouts(token, ATHLETE_ID, todayStr, isoDate(futureEnd));
  const upcoming = plannedOnly(futureWorkouts);

  if (weekCompleted.length === 0) {
    return { posted: false, reason: 'No completed workouts in the last 7 days' };
  }

  // Generate the review
  const feedbackText = await generateWeeklyFeedback(
    env.ANTHROPIC_API_KEY,
    weekCompleted,
    prevCompleted,
  );

  // Block context header
  const block = currentBlock(todayStr);
  const daysLeft = block ? daysLeftInBlock(block, todayStr) : 0;
  const blockHeader = block
    ? `Block ${block.number}: ${block.name} (${block.phase.toUpperCase()}) — ${daysLeft} days left`
    : 'Between blocks';

  // Ensure description doesn't have "George:" prefix (title carries the identity)
  const description = feedbackText
    .replace(/^George:\s*/i, '')
    .trim() +
    '\n\n— Reply on any workout if you want to swap a session or flag something off.';

  const title = `George — Weekly Review (${blockHeader})`;

  const result = await createCalendarNote(token, {
    athleteId: ATHLETE_ID,
    noteDate: monday,
    title,
    description,
  });

  return {
    posted: true,
    noteId: result.id,
    noteDate: monday,
    block: block?.name || 'between blocks',
    weekSessionCount: weekCompleted.length,
    upcomingSessionCount: upcoming.length,
    title,
    description,
  };
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  if (url.searchParams.get('token') !== env.SYNC_TOKEN) {
    return new Response('Forbidden', { status: 403 });
  }
  try {
    const result = await runWeekly(env);
    return Response.json({ coach: 'George', ranAt: new Date().toISOString(), ...result });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => onRequestGet(ctx);
