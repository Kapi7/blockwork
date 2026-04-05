/**
 * POST /api/george/announce-block?token=...&block=1
 *
 * Full block rollout:
 *   1. Push all sessions of the block to the TP calendar (dedup-safe)
 *   2. Create a calendar note on the block start date with a summary
 *      that the athlete can reply to with adjustments
 *
 * The athlete replies on the note OR on the first workout — George's
 * daily loop picks up the comment and responds in chat mode.
 */

import {
  getBearerToken,
  listWorkouts,
  createWorkout,
  createCalendarNote,
  deleteWorkout,
  listCalendarNotes,
  deleteCalendarNote,
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
  const force = url.searchParams.get('force') === '1';
  const reset = url.searchParams.get('reset') === '1';

  try {
    const token = await getBearerToken(env.TP_AUTH_COOKIE);
    const block = BLOCKS.find((b) => b.number === blockNum);
    if (!block) return jsonError(`Block ${blockNum} not found`, 404);
    if (!block.sessions || block.sessions.length === 0) {
      return jsonError(`Block ${block.name} has no sessions defined`, 400);
    }

    // Reset: delete all PLANNED-ONLY (uncompleted, future) workouts in block range
    // Safety: never deletes past or completed workouts.
    const deletedIds: number[] = [];
    if (reset) {
      const todayIso = new Date().toISOString().slice(0, 10);
      const existingForReset = await listWorkouts(token, ATHLETE_ID, block.startDate, block.endDate);
      for (const w of existingForReset) {
        const wDate = (w.workoutDay || '').slice(0, 10);
        // only future dates, only with no actual data (planned-only)
        const isFuture = wDate >= todayIso;
        const hasActual = (w.distance || 0) > 0 || (w.totalTime || 0) > 0 || (w.tssActual || 0) > 0;
        if (isFuture && !hasActual) {
          try {
            await deleteWorkout(token, ATHLETE_ID, w.workoutId);
            deletedIds.push(w.workoutId);
          } catch (e) {
            // keep going; a best-effort reset
          }
        }
      }
    }

    // Push all sessions (with dedup)
    const existing = await listWorkouts(token, ATHLETE_ID, block.startDate, block.endDate);
    const existingKeys = new Set<string>();
    for (const w of existing) {
      const date = (w.workoutDay || '').slice(0, 10);
      // Match on date + type + title to allow multiple workouts per day
      existingKeys.add(`${date}_${w.workoutTypeValueId}_${(w.title || '').toLowerCase()}`);
    }

    const pushResults: Array<any> = [];
    for (const session of block.sessions) {
      const key = `${session.date}_${session.workoutType}_${session.title.toLowerCase()}`;
      if (!force && existingKeys.has(key)) {
        pushResults.push({ date: session.date, title: session.title, status: 'skipped' });
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
        pushResults.push({ date: session.date, title: session.title, status: 'created', workoutId: result.workoutId });
        existingKeys.add(key);
      } catch (err: any) {
        pushResults.push({ date: session.date, title: session.title, status: 'error', reason: err.message });
      }
    }

    // Build summary of week 1 for the note
    const week1Sessions = block.sessions.filter((s) => {
      const d = new Date(s.date);
      const start = new Date(block.startDate);
      const daysIn = (d.getTime() - start.getTime()) / 86400000;
      return daysIn < 7;
    });

    // Summarize week 1 structure grouped by date
    const dayGroups = new Map<string, string[]>();
    for (const s of block.sessions) {
      if (!dayGroups.has(s.date)) dayGroups.set(s.date, []);
      dayGroups.get(s.date)!.push(s.title);
    }

    const weekDayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const week1Lines: string[] = [];
    for (const [date, titles] of Array.from(dayGroups.entries()).slice(0, 7)) {
      const dayName = weekDayNames[new Date(date + 'T00:00:00').getDay()];
      week1Lines.push(`${dayName} ${date.slice(5)}: ${titles.join(' + ')}`);
    }

    // Build the calendar note content
    const title = `George — Block ${block.number} starts: ${block.name}`;
    const description = `${block.stimulus}

BLOCK GOALS:
${block.goals.map((g) => '• ' + g).join('\n')}

SUCCESS METRICS:
${block.successMetrics.map((m) => '• ' + m).join('\n')}

WEEK 1 STRUCTURE (${block.startDate}):
${week1Lines.join('\n')}

All ${block.sessions.length} sessions have been added to your calendar.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REPLY if you want to change anything:
• Swap a day (e.g. "move Tue track to Wed")
• Change intensity on a specific session
• Skip a session (and why — legs, travel, time)
• Flag anything that doesn't fit your week

I'll adjust and re-push the affected workouts.

Reply on THIS note or on any specific workout.`;

    // DEDUP: only ONE "George — Block N starts:" note should exist, and only
    // on block.startDate. Scan the full block range + a buffer to catch strays
    // on other dates from previous buggy announces, delete all extras, keep one.
    let noteResult: { id: number };
    const scanEnd = new Date(block.startDate + 'T00:00:00');
    scanEnd.setDate(scanEnd.getDate() + 7); // startDate + 7 days of buffer
    const scanEndIso = scanEnd.toISOString().slice(0, 10);
    const existingNotes = await listCalendarNotes(token, ATHLETE_ID, block.startDate, scanEndIso);
    const blockNotes = existingNotes.filter((n) =>
      (n.title || '').startsWith(`George — Block ${block.number} starts:`)
    );
    // Prefer one that lives on the correct startDate
    const onStartDate = blockNotes.find((n) => (n.noteDate || '').slice(0, 10) === block.startDate);
    const keeper = onStartDate || blockNotes[0] || null;
    const toDelete = blockNotes.filter((n) => n.id !== keeper?.id);
    for (const dup of toDelete) {
      try {
        await deleteCalendarNote(token, ATHLETE_ID, dup.id);
      } catch {}
    }
    if (keeper) {
      noteResult = { id: keeper.id };
    } else {
      noteResult = await createCalendarNote(token, {
        athleteId: ATHLETE_ID,
        noteDate: block.startDate,
        title,
        description,
      });
    }

    return Response.json({
      coach: 'George',
      block: {
        number: block.number,
        name: block.name,
        phase: block.phase,
        dates: `${block.startDate} to ${block.endDate}`,
      },
      pushSummary: {
        total: pushResults.length,
        created: pushResults.filter((r) => r.status === 'created').length,
        skipped: pushResults.filter((r) => r.status === 'skipped').length,
        errors: pushResults.filter((r) => r.status === 'error').length,
        deletedByReset: deletedIds.length,
      },
      pushResults,
      noteId: noteResult.id,
      noteDate: block.startDate,
      noteTitle: title,
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
