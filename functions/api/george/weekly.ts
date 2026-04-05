/**
 * GET /api/george/weekly?token=...
 *
 * Generates a weekly review + next-week brief and posts it as a single
 * comment on the most recent completed workout. Runs via Monday cron.
 *
 * The comment structure is:
 *   George — Weekly Review (Mon Apr 7 → Sun Apr 13)
 *
 *   [Last week recap — what went well, what didn't]
 *
 *   [This week focus — key sessions, priorities]
 *
 *   [Adjustment offer — reply if you want to change anything]
 */

import {
  getBearerToken,
  listWorkouts,
  completedOnly,
  plannedOnly,
  postWorkoutComment,
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

async function runWeekly(env: Env) {
  const token = await getBearerToken(env.TP_AUTH_COOKIE);

  const today = new Date();
  const todayStr = isoDate(today);

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
  const next = nextBlock(todayStr);
  const blockHeader = block
    ? `Block ${block.number}: ${block.name} (${block.phase.toUpperCase()}) — ${daysLeftInBlock(block, todayStr)} days left`
    : 'Between blocks';

  let text = `George — Weekly Review\n${blockHeader}\n\n${feedbackText}`;

  // Add adjustment-offer footer if not already present
  if (!/adjust|change|swap/i.test(feedbackText)) {
    text += `\n\n— Reply if you want to swap any session this week or flag something off.`;
  }

  // Ensure prefix
  if (!text.toLowerCase().startsWith('george')) {
    text = `George: ${text}`;
  }

  // Post on the most recent completed workout (last of the week)
  const targetWorkout = weekCompleted[weekCompleted.length - 1];
  await postWorkoutComment(token, ATHLETE_ID, targetWorkout.workoutId, text);

  return {
    posted: true,
    workoutId: targetWorkout.workoutId,
    workoutDate: targetWorkout.workoutDay.slice(0, 10),
    workoutTitle: targetWorkout.title,
    block: block?.name || 'between blocks',
    weekSessionCount: weekCompleted.length,
    upcomingSessionCount: upcoming.length,
    text,
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
