/**
 * TrainingPeaks client — uses a long-lived Production_tpAuth cookie
 * to fetch short-lived bearer tokens, then calls the internal API.
 *
 * The cookie is obtained once via a local Playwright login (the athlete
 * does this manually when it expires). Stored as a Cloudflare secret.
 */

export interface TpWorkout {
  workoutId: number;
  athleteId: number;
  title: string;
  workoutTypeValueId: number;
  workoutDay: string;        // ISO
  startTime: string | null;
  completed: boolean | null;
  description: string | null;
  userTags: string | null;
  distance: number | null;   // meters
  distancePlanned: number | null;
  totalTime: number | null;  // hours
  totalTimePlanned: number | null;
  heartRateAverage: number | null;
  heartRateMaximum: number | null;
  heartRateMinimum: number | null;
  tssActual: number | null;
  tssPlanned: number | null;
  if: number | null;
  velocityAverage: number | null;    // m/s
  normalizedSpeedActual: number | null;
  elevationGain: number | null;
  cadenceAverage: number | null;
  rpe: number | null;
  feeling: number | null;
  structure: unknown;
  complianceDurationPercent: number | null;
  complianceDistancePercent: number | null;
  complianceTssPercent: number | null;
  workoutComments: Array<{ comment: string; commentDate: string }>;
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
 * Tokens are short-lived (1 hour) so we fetch per-request.
 * Caller may cache in D1 for 50 min if desired.
 */
export async function getBearerToken(authCookie: string): Promise<string> {
  const res = await fetch('https://tpapi.trainingpeaks.com/users/v3/token', {
    headers: {
      'Cookie': `Production_tpAuth=${authCookie}`,
      'Referer': 'https://app.trainingpeaks.com/',
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) blockwork-bridge',
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

/**
 * List workouts for an athlete in a date range.
 * Dates in YYYY-MM-DD format.
 */
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
 * Get a single workout's details including HR zones, splits, attachments.
 */
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

/**
 * Format a workout for human display (and Claude prompting).
 */
export function formatWorkout(w: TpWorkout): string {
  const date = (w.workoutDay || '').slice(0, 10);
  const dist = w.distance ? `${(w.distance / 1000).toFixed(2)}km` : '-';
  const dur = w.totalTime ? `${Math.round(w.totalTime * 60)}min` : '-';
  const hr = w.heartRateAverage ? `avg ${Math.round(w.heartRateAverage)}bpm` : 'no HR';
  const tss = w.tssActual ? `TSS ${w.tssActual.toFixed(0)}` : '';
  return `${date} | ${w.title} | ${dist} / ${dur} | ${hr} ${tss}`.trim();
}
