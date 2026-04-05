/**
 * GET /api/george/tasks
 *
 * Scans recent TP workouts and returns a list of actions the Playwright
 * agent (running on GitHub Actions) needs to take in TP:
 *
 *   - { type: 'comment', workoutId, text } — post a comment on a workout
 *
 * Triggered either by the Strava webhook or by a scheduled cron (every few hours).
 *
 * Auth: requires ?token= query param matching SYNC_TOKEN secret.
 */

import {
  getBearerToken,
  listWorkouts,
  completedOnly,
  plannedOnly,
  needsGeorgeReply,
  commentsByAuthor,
  latestComment,
  formatWorkout,
} from '../lib/tp-client';
import { generateSessionFeedback, generateChatReply } from '../lib/claude-coach';

interface Env {
  TP_AUTH_COOKIE: string;
  ANTHROPIC_API_KEY: string;
  SYNC_TOKEN: string;
}

const ATHLETE_ID = 3030673;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const providedToken = url.searchParams.get('token');
  if (!env.SYNC_TOKEN || providedToken !== env.SYNC_TOKEN) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const token = await getBearerToken(env.TP_AUTH_COOKIE);

    // Read last 14 days of workouts (enough to find recently-completed ones needing replies)
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 14);
    const allWorkouts = await listWorkouts(token, ATHLETE_ID, isoDate(start), isoDate(end));

    // Context: completed workouts for the 28-day window for Claude's reference
    const contextStart = new Date();
    contextStart.setDate(contextStart.getDate() - 28);
    const contextWorkouts = await listWorkouts(token, ATHLETE_ID, isoDate(contextStart), isoDate(end));
    const allCompleted = completedOnly(contextWorkouts).sort((a, b) =>
      (b.workoutDay || '').localeCompare(a.workoutDay || '')
    );

    // Upcoming planned (next 14 days) for reference
    const futureEnd = new Date();
    futureEnd.setDate(futureEnd.getDate() + 14);
    const futureWorkouts = await listWorkouts(token, ATHLETE_ID, isoDate(end), isoDate(futureEnd));
    const upcoming = plannedOnly(futureWorkouts).sort((a, b) =>
      (a.workoutDay || '').localeCompare(b.workoutDay || '')
    );

    // Find workouts needing reply — only look at the last 14 days (completed)
    const candidates = completedOnly(allWorkouts).sort((a, b) =>
      (b.workoutDay || '').localeCompare(a.workoutDay || '')
    );

    const tasks: Array<{
      type: 'comment';
      workoutId: number;
      workoutDate: string;
      workoutTitle: string;
      reason: string;
      text: string;
    }> = [];

    // Limit to 5 tasks per run to stay within time/cost budget
    for (const w of candidates.slice(0, 20)) {
      if (tasks.length >= 5) break;

      const check = needsGeorgeReply(w);
      if (!check.needed) continue;

      // 14-day context excluding this workout
      const recent14d = allCompleted
        .filter((x) => x.workoutId !== w.workoutId)
        .slice(0, 14);

      let feedback: string;
      if (check.reason === 'completed-no-reply') {
        // First comment on this workout — session feedback
        feedback = await generateSessionFeedback({
          apiKey: env.ANTHROPIC_API_KEY,
          workout: w,
          recent14d,
          upcomingPlanned: upcoming,
        });
      } else {
        // Athlete replied — chat mode
        feedback = await generateChatReply({
          apiKey: env.ANTHROPIC_API_KEY,
          workout: w,
          recent14d,
          upcomingPlanned: upcoming,
        });
      }

      // Normalize: ensure prefix "George: "
      let text = feedback.trim();
      if (!text.toLowerCase().startsWith('george:')) {
        text = `George: ${text}`;
      }

      tasks.push({
        type: 'comment',
        workoutId: w.workoutId,
        workoutDate: w.workoutDay.slice(0, 10),
        workoutTitle: w.title,
        reason: check.reason,
        text,
      });
    }

    return Response.json({
      coach: 'George',
      generatedAt: new Date().toISOString(),
      tasks,
      taskCount: tasks.length,
      checkedWorkouts: candidates.length,
    });
  } catch (err: any) {
    console.error('George tasks error:', err);
    return new Response(
      JSON.stringify({ error: err.message || 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
