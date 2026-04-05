/**
 * POST /api/george/cleanup?token=...&from=YYYY-MM-DD&to=YYYY-MM-DD&limit=30
 *
 * Deletes FUTURE planned-only workouts in the given date range.
 * Safety: never touches past-dated or completed workouts (has distance/time/tss).
 * Limited to `limit` deletes per call (default 30) to stay under Cloudflare
 * Worker's 50 subrequest cap. Call repeatedly until deletedCount === 0.
 */

import {
  getBearerToken,
  listWorkouts,
  deleteWorkout,
  listCalendarNotes,
  deleteCalendarNote,
} from '../lib/tp-client';

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

  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const limit = parseInt(url.searchParams.get('limit') || '30', 10);

  if (!from || !to) {
    return Response.json({ error: 'Provide ?from=YYYY-MM-DD&to=YYYY-MM-DD' }, { status: 400 });
  }

  try {
    const token = await getBearerToken(env.TP_AUTH_COOKIE);
    const todayIso = new Date().toISOString().slice(0, 10);

    const workouts = await listWorkouts(token, ATHLETE_ID, from, to);

    // Only delete future + planned-only (no actual data)
    const candidates = workouts.filter((w: any) => {
      const d = (w.workoutDay || '').slice(0, 10);
      const isFutureOrToday = d >= todayIso;
      const hasActual = (w.distance || 0) > 0 || (w.totalTime || 0) > 0 || (w.tssActual || 0) > 0;
      return isFutureOrToday && !hasActual;
    });

    const toDelete = candidates.slice(0, limit);
    const deleted: number[] = [];
    const errors: any[] = [];

    for (const w of toDelete) {
      try {
        await deleteWorkout(token, ATHLETE_ID, w.workoutId);
        deleted.push(w.workoutId);
      } catch (e: any) {
        errors.push({ id: w.workoutId, msg: e.message });
      }
    }

    // Also dedup calendar notes in range — keep one of each (title, date), delete extras.
    // And delete any duplicate "George — Block N starts:" notes (keep newest).
    const notes = await listCalendarNotes(token, ATHLETE_ID, from, to);
    const seen = new Map<string, number>(); // title+date → keep id
    const deletedNotes: number[] = [];
    for (const n of notes) {
      const key = `${(n.noteDate || '').slice(0, 10)}|${n.title || ''}`;
      if (seen.has(key)) {
        try {
          await deleteCalendarNote(token, ATHLETE_ID, n.id);
          deletedNotes.push(n.id);
        } catch {}
      } else {
        seen.set(key, n.id);
      }
    }

    return Response.json({
      from,
      to,
      totalPlannedInRange: candidates.length,
      deletedCount: deleted.length,
      remaining: candidates.length - deleted.length,
      errors,
      totalNotesInRange: notes.length,
      deletedDuplicateNotes: deletedNotes.length,
      uniqueNotesKept: seen.size,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const onRequestGet: PagesFunction<Env> = async (ctx) => onRequestPost(ctx);
