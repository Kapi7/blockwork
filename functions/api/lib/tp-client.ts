/**
 * TrainingPeaks client — uses a long-lived Production_tpAuth cookie
 * to fetch short-lived bearer tokens, then calls the internal API.
 */

export interface TpComment {
  commentId?: number;
  comment: string;
  commentDate: string;
  userId?: number;
  userName?: string;
}

export interface TpWorkout {
  workoutId: number;
  athleteId: number;
  title: string;
  workoutTypeValueId: number;  // 1=swim, 2=bike, 3=run, ...
  workoutDay: string;
  startTime: string | null;
  completed: boolean | null;
  description: string | null;
  userTags: string | null;
  coachComments: string | null;
  workoutComments: TpComment[];
  distance: number | null;            // meters
  distancePlanned: number | null;
  totalTime: number | null;            // hours
  totalTimePlanned: number | null;
  heartRateAverage: number | null;
  heartRateMaximum: number | null;
  heartRateMinimum: number | null;
  tssActual: number | null;
  tssPlanned: number | null;
  if: number | null;
  velocityAverage: number | null;      // m/s
  normalizedSpeedActual: number | null;
  elevationGain: number | null;
  cadenceAverage: number | null;
  rpe: number | null;
  feeling: number | null;
  structure: unknown;
  complianceDurationPercent: number | null;
  complianceDistancePercent: number | null;
  complianceTssPercent: number | null;
}

interface TokenResponse {
  success: boolean;
  token: {
    access_token: string;
    token_type: string;
    expires_in: number;
    refresh_token: string;
    expires: string;
  };
}

/**
 * Fetch a fresh bearer token using the long-lived session cookie.
 * Tokens are short-lived (1 hour).
 */
export async function getBearerToken(authCookie: string): Promise<string> {
  const res = await fetch('https://tpapi.trainingpeaks.com/users/v3/token', {
    headers: {
      'Cookie': `Production_tpAuth=${authCookie}`,
      'Referer': 'https://app.trainingpeaks.com/',
      'User-Agent': 'Mozilla/5.0 blockwork-bridge',
    },
  });

  if (!res.ok) {
    throw new Error(`TP token fetch failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as TokenResponse;
  if (!data.success || !data.token?.access_token) {
    throw new Error('TP token response missing access_token');
  }
  return data.token.access_token;
}

/** List workouts in a date range. Returns both planned and completed. */
export async function listWorkouts(
  token: string,
  athleteId: number,
  startDate: string,
  endDate: string,
): Promise<TpWorkout[]> {
  const url = `https://tpapi.trainingpeaks.com/fitness/v6/athletes/${athleteId}/workouts/${startDate}/${endDate}`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'blockwork-bridge',
    },
  });
  if (!res.ok) throw new Error(`TP listWorkouts failed: ${res.status}`);
  return res.json() as Promise<TpWorkout[]>;
}

/**
 * Post a comment on a workout. This is the post-activity comment that
 * shows in the workout detail panel.
 *
 * POST /fitness/v2/athletes/{athleteId}/workouts/{workoutId}/comments
 * Body: { "value": "comment text" }
 */
export async function postWorkoutComment(
  token: string,
  athleteId: number,
  workoutId: number,
  comment: string,
): Promise<void> {
  const url = `https://tpapi.trainingpeaks.com/fitness/v2/athletes/${athleteId}/workouts/${workoutId}/comments`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Referer': 'https://app.trainingpeaks.com/',
      'User-Agent': 'blockwork-bridge',
    },
    body: JSON.stringify({ value: comment }),
  });
  if (!res.ok) {
    throw new Error(`postWorkoutComment failed: ${res.status} ${await res.text()}`);
  }
}

/**
 * Create a new workout on the athlete's calendar.
 *
 * POST /fitness/v6/athletes/{athleteId}/workouts
 * Returns the created workout with workoutId.
 */
export interface CreateWorkoutInput {
  athleteId: number;
  workoutDay: string;            // YYYY-MM-DD (or ISO)
  title: string;
  workoutTypeValueId: number;    // 1=swim, 2=bike, 3=run, 8=strength, 100=other
  description?: string;
  distancePlanned?: number;       // meters
  totalTimePlanned?: number;      // hours
  tssPlanned?: number;
  ifPlanned?: number;
  structure?: unknown;            // TP structured workout JSON (syncs to Garmin)
}

export async function createWorkout(
  token: string,
  input: CreateWorkoutInput,
): Promise<{ workoutId: number }> {
  const url = `https://tpapi.trainingpeaks.com/fitness/v6/athletes/${input.athleteId}/workouts`;
  // Normalize date to ISO start-of-day
  const workoutDay = input.workoutDay.length === 10 ? `${input.workoutDay}T00:00:00` : input.workoutDay;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Referer': 'https://app.trainingpeaks.com/',
      'User-Agent': 'blockwork-bridge',
    },
    body: JSON.stringify({
      athleteId: input.athleteId,
      workoutDay,
      title: input.title,
      workoutTypeValueId: input.workoutTypeValueId,
      description: input.description || '',
      distancePlanned: input.distancePlanned,
      totalTimePlanned: input.totalTimePlanned,
      tssPlanned: input.tssPlanned,
      ifPlanned: input.ifPlanned,
      ...(input.structure ? { structure: input.structure } : {}),
    }),
  });
  if (!res.ok) {
    throw new Error(`createWorkout failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as any;
  return { workoutId: data.workoutId };
}

/**
 * Update an existing workout in place. Partial patch — only the fields passed
 * are overwritten. Uses PUT to /fitness/v6/athletes/{aid}/workouts/{wid}.
 * Useful for fixing descriptions/structures without deleting the workout.
 */
export async function updateWorkout(
  token: string,
  athleteId: number,
  workoutId: number,
  patch: Partial<CreateWorkoutInput> & { structure?: unknown },
): Promise<{ workoutId: number }> {
  const url = `https://tpapi.trainingpeaks.com/fitness/v6/athletes/${athleteId}/workouts/${workoutId}`;
  // Fetch current workout so we send a complete body back (TP requires full object)
  const currentRes = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'User-Agent': 'blockwork-bridge',
    },
  });
  if (!currentRes.ok) {
    throw new Error(`updateWorkout GET failed: ${currentRes.status}`);
  }
  const current = (await currentRes.json()) as any;

  const merged = {
    ...current,
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.workoutTypeValueId !== undefined ? { workoutTypeValueId: patch.workoutTypeValueId } : {}),
    ...(patch.distancePlanned !== undefined ? { distancePlanned: patch.distancePlanned } : {}),
    ...(patch.totalTimePlanned !== undefined ? { totalTimePlanned: patch.totalTimePlanned } : {}),
    ...(patch.tssPlanned !== undefined ? { tssPlanned: patch.tssPlanned } : {}),
    ...(patch.ifPlanned !== undefined ? { ifPlanned: patch.ifPlanned } : {}),
    ...(patch.structure !== undefined ? { structure: patch.structure } : {}),
  };

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Referer: 'https://app.trainingpeaks.com/',
      'User-Agent': 'blockwork-bridge',
    },
    body: JSON.stringify(merged),
  });
  if (!res.ok) {
    throw new Error(`updateWorkout PUT failed: ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
  return { workoutId };
}

/**
 * Delete a workout.
 * DELETE /fitness/v6/athletes/{athleteId}/workouts/{workoutId}
 */
export async function deleteWorkout(token: string, athleteId: number, workoutId: number): Promise<void> {
  const url = `https://tpapi.trainingpeaks.com/fitness/v6/athletes/${athleteId}/workouts/${workoutId}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}`, 'User-Agent': 'blockwork-bridge' },
  });
  if (!res.ok) throw new Error(`deleteWorkout failed: ${res.status}`);
}

/**
 * Create a calendar note. These appear as day-level messages on the
 * TP calendar, separate from workouts. Perfect for weekly reviews.
 *
 * POST /fitness/v1/athletes/{athleteId}/calendarNote
 */
export interface CreateCalendarNoteInput {
  athleteId: number;
  noteDate: string;   // YYYY-MM-DD
  title: string;
  description: string;
}

export async function createCalendarNote(
  token: string,
  input: CreateCalendarNoteInput,
): Promise<{ id: number }> {
  const url = `https://tpapi.trainingpeaks.com/fitness/v1/athletes/${input.athleteId}/calendarNote`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Referer': 'https://app.trainingpeaks.com/',
      'User-Agent': 'blockwork-bridge',
    },
    body: JSON.stringify({
      athleteId: input.athleteId,
      noteDate: input.noteDate,
      title: input.title,
      description: input.description,
    }),
  });
  if (!res.ok) {
    throw new Error(`createCalendarNote failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as any;
  return { id: data.id };
}

/**
 * List calendar notes in a date range.
 * GET /fitness/v1/athletes/{athleteId}/calendarNote/{startDate}/{endDate}
 */
export async function listCalendarNotes(
  token: string,
  athleteId: number,
  startDate: string,
  endDate: string,
): Promise<Array<{ id: number; noteDate: string; title: string; description?: string }>> {
  const url = `https://tpapi.trainingpeaks.com/fitness/v1/athletes/${athleteId}/calendarNote/${startDate}/${endDate}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'User-Agent': 'blockwork-bridge',
    },
  });
  if (!res.ok) {
    // Some endpoints return 404 for empty ranges — treat as empty list
    if (res.status === 404) return [];
    throw new Error(`listCalendarNotes failed: ${res.status}`);
  }
  const data = (await res.json()) as any;
  return Array.isArray(data) ? data : (data.notes || data.calendarNotes || []);
}

/**
 * Delete a calendar note.
 * DELETE /fitness/v1/athletes/{athleteId}/calendarNote/{noteId}
 */
export async function deleteCalendarNote(token: string, athleteId: number, noteId: number): Promise<void> {
  const url = `https://tpapi.trainingpeaks.com/fitness/v1/athletes/${athleteId}/calendarNote/${noteId}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}`, 'User-Agent': 'blockwork-bridge' },
  });
  if (!res.ok) throw new Error(`deleteCalendarNote failed: ${res.status}`);
}

/** Get full workout detail — HR zones, splits, attachments. */
export async function getWorkoutDetails(
  token: string,
  athleteId: number,
  workoutId: number,
): Promise<any> {
  const url = `https://tpapi.trainingpeaks.com/fitness/v6/athletes/${athleteId}/workouts/${workoutId}/details`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'blockwork-bridge',
    },
  });
  if (!res.ok) throw new Error(`TP getWorkoutDetails failed: ${res.status}`);
  return res.json();
}

/** Filter: completed workouts only (have distance data). */
export function completedOnly(workouts: TpWorkout[]): TpWorkout[] {
  return workouts.filter((w) => w.distance && w.distance > 0);
}

/** Filter: planned workouts only (no actual data yet, but have a title or structure). */
export function plannedOnly(workouts: TpWorkout[]): TpWorkout[] {
  return workouts.filter((w) => !w.distance && (w.title || w.description || w.distancePlanned));
}

/** Extract comments made by an author. George comments start with "George:". */
export function commentsByAuthor(comments: TpComment[], author: 'george' | 'athlete'): TpComment[] {
  if (!comments) return [];
  return comments.filter((c) => {
    const isGeorge = (c.comment || '').trim().startsWith('George:');
    return author === 'george' ? isGeorge : !isGeorge;
  });
}

/** Get the most recent comment in a list (sorted by commentDate desc). */
export function latestComment(comments: TpComment[]): TpComment | null {
  if (!comments || comments.length === 0) return null;
  return [...comments].sort((a, b) => (b.commentDate || '').localeCompare(a.commentDate || ''))[0];
}

/**
 * Does this workout need a reply from George?
 *
 * Rules:
 * 1. Completed workout with NO George comment at all → yes (session feedback)
 * 2. Athlete added a comment newer than George's latest reply → yes (chat response)
 * 3. Otherwise → no
 */
export function needsGeorgeReply(w: TpWorkout): { needed: boolean; reason: string } {
  const completed = w.distance && w.distance > 0;
  const comments = w.workoutComments || [];
  const georgeComments = commentsByAuthor(comments, 'george');
  const athleteComments = commentsByAuthor(comments, 'athlete');

  if (completed && georgeComments.length === 0) {
    return { needed: true, reason: 'completed-no-reply' };
  }

  const latestGeorge = latestComment(georgeComments);
  const latestAthlete = latestComment(athleteComments);

  if (latestAthlete && (!latestGeorge || (latestAthlete.commentDate || '') > (latestGeorge.commentDate || ''))) {
    return { needed: true, reason: 'athlete-message' };
  }

  return { needed: false, reason: 'up-to-date' };
}

/** Human-readable workout one-liner. */
export function formatWorkout(w: TpWorkout): string {
  const date = (w.workoutDay || '').slice(0, 10);
  const dist = w.distance ? `${(w.distance / 1000).toFixed(2)}km` : (w.distancePlanned ? `${(w.distancePlanned / 1000).toFixed(1)}km planned` : '-');
  const dur = w.totalTime ? `${Math.round(w.totalTime * 60)}min` : (w.totalTimePlanned ? `${Math.round(w.totalTimePlanned * 60)}min planned` : '-');
  const hr = w.heartRateAverage ? `avg ${Math.round(w.heartRateAverage)}bpm` : '';
  const tss = w.tssActual ? `TSS ${w.tssActual.toFixed(0)}` : (w.tssPlanned ? `TSS ${w.tssPlanned.toFixed(0)} planned` : '');
  const type = workoutTypeName(w.workoutTypeValueId);
  return `${date} | ${type} | ${w.title} | ${dist} / ${dur} ${hr} ${tss}`.trim();
}

const WORKOUT_TYPES: Record<number, string> = {
  1: 'Swim', 2: 'Bike', 3: 'Run', 4: 'Brick', 5: 'Crosstrain', 8: 'Strength',
  9: 'Xc-Ski', 11: 'Rowing', 12: 'Mtb', 13: 'Walking', 100: 'Other',
};
export function workoutTypeName(id: number): string {
  return WORKOUT_TYPES[id] || `Type${id}`;
}

/** Format comment thread for Claude prompt. */
export function formatCommentThread(comments: TpComment[]): string {
  if (!comments || comments.length === 0) return '(no comments)';
  const sorted = [...comments].sort((a, b) => (a.commentDate || '').localeCompare(b.commentDate || ''));
  return sorted
    .map((c) => {
      const author = (c.comment || '').trim().startsWith('George:') ? 'George' : 'Itay';
      const text = (c.comment || '').replace(/^George:\s*/, '').trim();
      return `[${c.commentDate?.slice(0, 16)}] ${author}: ${text}`;
    })
    .join('\n');
}
