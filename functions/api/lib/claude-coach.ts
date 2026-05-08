/**
 * Claude Coach — generates feedback in the voice of "George", a pragmatic
 * endurance coach. Three modes:
 * - session: initial feedback on a completed workout
 * - chat:    reply to athlete's comment on a workout
 * - weekly:  7-day summary + focus for coming week
 * - block:   generates next training block (array of workouts)
 */

import type { TpWorkout, TpDetailData, TpLapStat } from './tp-client';
import { formatWorkout, formatCommentThread, zonesFromSettings } from './tp-client';
import type { TpAthleteSettings } from './tp-client';
import { ATHLETE_PROFILE, blockContextForPrompt, zonesForPrompt } from './training-plan';

// ─── Lap-level analysis helpers ────────────────────────────────────────────────
// Without these, George reads the session AVERAGE and misses interval structure.
// E.g. "30 min @ IF 0.91 inside a 1h41 ride" → session avg IF 0.75, looks like Z2.

function fmtPace(secsPerKm: number): string {
  if (!isFinite(secsPerKm) || secsPerKm <= 0) return '-';
  const m = Math.floor(secsPerKm / 60);
  const s = Math.round(secsPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function speedToPace(ms: number | null | undefined): string {
  if (!ms || ms <= 0) return '-';
  return fmtPace(1000 / ms);
}

/** True for sessions where lap data tells you something average can't. */
export function shouldFetchDetail(w: TpWorkout): boolean {
  const t = (w.title || '').toLowerCase();
  const d = (w.description || '').toLowerCase();
  const haystack = `${t} ${d}`;
  if (/track|fartlek|tempo|threshold|intervals?|on.?off|sweet.?spot|race|hills?|repeats|surge/i.test(haystack)) return true;
  // Anything with IF >= 0.7 has likely structure worth seeing
  if ((w.if || 0) >= 0.7) return true;
  // Long efforts (> 90 min) — terrain matters
  if ((w.totalTime || 0) >= 1.5) return true;
  return false;
}

/** Detect when the plan offers options ("X or Y") — George should pick the matching branch from data. */
export function detectOptionLanguage(w: TpWorkout): { hasOptions: boolean; branches: string[] } {
  const text = `${w.title || ''} ${w.description || ''}`;
  const branches: string[] = [];
  // Look for "X or Y" patterns in title or description
  const titleParts = (w.title || '').split(/\s+or\s+/i);
  if (titleParts.length > 1) branches.push(...titleParts.map((p) => p.trim()));
  // "Option A: ... Option B: ..." pattern
  const optionMatches = text.match(/Option\s+[A-Z][:.]\s+([^\n]+)/gi);
  if (optionMatches) branches.push(...optionMatches.map((m) => m.trim()));
  return { hasOptions: branches.length > 1, branches };
}

interface LapDistKm {
  distKm: number;
  secs: number;
  paceSecPerKm: number;
  hrAvg: number | null;
  hrMax: number | null;
  ifVal: number | null;
  power: number | null;
  cadence: number | null;
  name: string;
}

function normalizeLap(lap: TpLapStat): LapDistKm {
  const distKm = (lap.distance || 0) / 1000;
  const secs = (lap.elapsedTime || 0) / 1000;
  return {
    distKm,
    secs,
    paceSecPerKm: distKm > 0.005 ? secs / distKm : 0,
    hrAvg: lap.averageHeartRate ?? null,
    hrMax: lap.maximumHeartRate ?? null,
    ifVal: lap.intensityFactorActual ?? null,
    power: lap.averagePower ?? null,
    cadence: lap.averageCadence ?? null,
    name: lap.name || '',
  };
}

/** Detect the shape of a session from the lap structure. */
export function detectSessionShape(laps: LapDistKm[]): {
  shape: 'single-block' | 'race-simulation' | 'intervals' | 'continuous-hard' | 'mixed-terrain' | 'unknown';
  highIfLap: { idx: number; lap: LapDistKm } | null;
  workReps: LapDistKm[];
} {
  const work = laps.filter((l) => l.secs > 30);
  if (work.length === 0) return { shape: 'unknown', highIfLap: null, workReps: [] };
  if (work.length === 1) return { shape: 'single-block', highIfLap: { idx: 0, lap: work[0] }, workReps: [] };

  // Find the highest-IF lap
  const ifs = work.map((l, i) => ({ idx: i, ifv: l.ifVal || 0, lap: l }));
  ifs.sort((a, b) => b.ifv - a.ifv);
  const highIf = ifs[0];
  const highIfLap = { idx: highIf.idx, lap: highIf.lap };

  // Race simulation: one big high-IF block in the middle, surrounded by easier laps
  if (work.length >= 3 && highIf.lap.secs >= 600 && (highIf.lap.ifVal || 0) >= 0.8) {
    const beforeAvgIf = work.slice(0, highIf.idx).reduce((s, l) => s + (l.ifVal || 0), 0) / Math.max(1, highIf.idx);
    const afterAvgIf = work.slice(highIf.idx + 1).reduce((s, l) => s + (l.ifVal || 0), 0) / Math.max(1, work.length - highIf.idx - 1);
    if (beforeAvgIf < 0.75 && afterAvgIf < 0.75) {
      return { shape: 'race-simulation', highIfLap, workReps: [highIf.lap] };
    }
  }

  // Intervals: alternating high/low IF reps. Count "hard" (IF >= 0.85) vs "easy" (IF < 0.7) laps.
  const hard = work.filter((l) => (l.ifVal || 0) >= 0.85);
  const easy = work.filter((l) => (l.ifVal || 0) < 0.7);
  if (hard.length >= 3 && easy.length >= 2) {
    return { shape: 'intervals', highIfLap, workReps: hard };
  }

  // Continuous hard: most laps are >= 0.75 IF, no big easy gaps
  const sustained = work.filter((l) => (l.ifVal || 0) >= 0.75);
  if (sustained.length >= work.length * 0.7) {
    return { shape: 'continuous-hard', highIfLap, workReps: sustained };
  }

  // Otherwise mixed terrain
  return { shape: 'mixed-terrain', highIfLap, workReps: hard };
}

/**
 * Build a compact lap-level summary for the LLM. This is the secret sauce —
 * gives George visibility into structure that session-averages hide.
 */
export function summarizeLapData(detail: TpDetailData | null | undefined, isRun: boolean): string {
  if (!detail) return '(lap data not available)';
  const rawLaps = detail.lapsStats || [];
  if (rawLaps.length === 0) return '(no laps)';

  const laps = rawLaps.map(normalizeLap);
  const lines: string[] = [];

  // Time in HR zones (most useful single metric)
  const tihrz = detail.timeInHeartRateZones?.timeInZones || [];
  if (tihrz.length > 0) {
    const tot = tihrz.reduce((s, z) => s + (z.seconds || 0), 0);
    if (tot > 0) {
      const z3plus = tihrz.filter((z) => (z.minimum || 0) >= 162).reduce((s, z) => s + (z.seconds || 0), 0);
      const z4plus = tihrz.filter((z) => (z.minimum || 0) >= 171).reduce((s, z) => s + (z.seconds || 0), 0);
      const z5plus = tihrz.filter((z) => (z.minimum || 0) >= 180).reduce((s, z) => s + (z.seconds || 0), 0);
      lines.push(`HR-zone time: Z3+ ${(z3plus / 60).toFixed(1)}min (${((z3plus / tot) * 100).toFixed(0)}%), Z4+ ${(z4plus / 60).toFixed(1)}min, Z5+ ${(z5plus / 60).toFixed(1)}min — total ${(tot / 60).toFixed(0)}min`);
    }
  }

  // Time in pace zones (run only)
  const tisz = detail.timeInSpeedZones?.timeInZones || [];
  if (isRun && tisz.length > 0) {
    const tot = tisz.reduce((s, z) => s + (z.seconds || 0), 0);
    if (tot > 0) {
      // Z3+ in pace = faster than 4:17/km (per his TP zones)
      const fastTime = tisz.slice(2).reduce((s, z) => s + (z.seconds || 0), 0);
      const fasterThanThreshold = tisz.slice(4).reduce((s, z) => s + (z.seconds || 0), 0);
      lines.push(`Pace-zone time: faster than 4:17/km ${(fastTime / 60).toFixed(1)}min (${((fastTime / tot) * 100).toFixed(0)}%), faster than 3:45/km ${(fasterThanThreshold / 60).toFixed(1)}min`);
    }
  }

  // Highest single-lap IF (the headline for interval / race-sim sessions)
  const shape = detectSessionShape(laps);
  if (shape.highIfLap && shape.highIfLap.lap.ifVal && shape.highIfLap.lap.ifVal >= 0.7) {
    const l = shape.highIfLap.lap;
    const dur = `${Math.floor(l.secs / 60)}:${String(Math.round(l.secs % 60)).padStart(2, '0')}`;
    const paceOrPower = isRun ? `pace ${fmtPace(l.paceSecPerKm)}/km` : `power ${l.power || '?'}W`;
    lines.push(`Hardest lap: ${dur} @ IF ${(l.ifVal ?? 0).toFixed(2)}, HR ${l.hrAvg ?? '?'}/${l.hrMax ?? '?'}, ${paceOrPower} — session shape: ${shape.shape}`);
  }

  // Peak pace (runs only) — useful for quality sessions
  const mmsd = detail.meanMaxSpeedsByDistance?.meanMaxes || [];
  if (isRun && mmsd.length > 0) {
    const distances = ['MM400Meter', 'MM800Meter', 'MM1Kilometer', 'MM1Mile', 'MM5Kilometer'];
    const peaks = distances
      .map((d) => mmsd.find((m) => m.label === d))
      .filter((m) => m && m.value)
      .map((m) => `${m!.label.replace('MM', '').replace('Meter', 'm').replace('Kilometer', 'k').replace('Mile', 'mi')}: ${speedToPace(m!.value)}`);
    if (peaks.length > 0) lines.push(`Peak pace by distance — ${peaks.join(' | ')}`);
  }

  // Compact lap table for structured sessions (intervals / race-sim)
  if (shape.shape === 'intervals' || shape.shape === 'race-simulation' || shape.shape === 'continuous-hard') {
    const tableLaps = laps.filter((l) => l.secs > 30).slice(0, 16);
    const tableLines = tableLaps.map((l, i) => {
      const dur = `${Math.floor(l.secs / 60)}:${String(Math.round(l.secs % 60)).padStart(2, '0')}`;
      const paceOrPower = isRun ? fmtPace(l.paceSecPerKm) + '/km' : `${l.power || '?'}W`;
      return `  L${i + 1}: ${(l.distKm * 1000).toFixed(0)}m / ${dur} / ${paceOrPower} / HR ${l.hrAvg ?? '?'}-${l.hrMax ?? '?'} / IF ${(l.ifVal || 0).toFixed(2)}`;
    });
    if (tableLines.length > 0) lines.push(`Lap detail:\n${tableLines.join('\n')}`);
  }

  return lines.length > 0 ? lines.join('\n') : '(lap data sparse)';
}

function buildSystemPrompt(liveZones?: string): string {
  const block = blockContextForPrompt();
  const zones = liveZones || zonesForPrompt(); // fallback to hardcoded
  return `You are George, a pragmatic endurance coach for ${ATHLETE_PROFILE.name}.

ATHLETE:
- ${ATHLETE_PROFILE.experience}, based in ${ATHLETE_PROFILE.location}
- PBs: 5K ${ATHLETE_PROFILE.pbs['5K']}, 10K ${ATHLETE_PROFILE.pbs['10K']}, HM ${ATHLETE_PROFILE.pbs['Half Marathon']}, Marathon ${ATHLETE_PROFILE.pbs['Marathon']}
- Recent: ${ATHLETE_PROFILE.recentEvent}
- Short-term goal: ${ATHLETE_PROFILE.shortTermGoal}
- Long-term goal: ${ATHLETE_PROFILE.longTermGoal}
- A-Race: ${ATHLETE_PROFILE.aRace}
- Availability: ${ATHLETE_PROFILE.weeklyAvailability.runningHours}hrs run + ${ATHLETE_PROFILE.weeklyAvailability.cyclingHours}hrs bike per week
- Max long run: ${ATHLETE_PROFILE.weeklyAvailability.maxLongRunKm}km, Max long ride: ${ATHLETE_PROFILE.weeklyAvailability.maxLongRideHours}hrs
- Notes: ${ATHLETE_PROFILE.notes}

WEEKLY PATTERN:
${ATHLETE_PROFILE.weeklyPattern.map((l) => '  ' + l).join('\n')}

${block}

${zones}

CRITICAL — SPLIT WORKOUT AWARENESS:
Tuesday TRACK sessions are split into 3 TP entries: "TRACK WU", "TRACK MAIN", and "TRACK CD".
These are ONE workout — the athlete logs them as a SINGLE Garmin/Strava activity, usually on the WU entry.
- If WU shows more distance than planned (e.g. 6.7km instead of 3.5km), the athlete ran WU + MAIN together in one recording. This is NORMAL. Do NOT say "your warm-up was too long."
- Compare TOTAL session distance (WU + MAIN + CD entries combined) to the planned total, not individual entry distance.
- When commenting on a TRACK WU entry that has actual data, assume it contains the MAIN set too unless the athlete says otherwise.
- When commenting on a TRACK MAIN entry with NO actual data, the data is on the WU entry — reference that.
- The TRACK CD may or may not have data depending on whether the athlete logged it separately.

CRITICAL — READ STRUCTURE, NOT AVERAGES:
Session-AVERAGE HR and IF are useless on interval, race-simulation, or mixed-terrain sessions.
The avg of {30 min @ IF 0.91 + 70 min @ IF 0.55} reads as a Z2 cruise but is actually a real workout.
- When LAP DATA is provided, USE IT. Comment on the highest-IF lap and time-in-zone, not session avg.
- "HR avg 130" alone is NEVER a valid reason to call a session "easy" or "bailed."
- If lap data shows even one block ≥ 8 minutes at IF ≥ 0.85, that block IS the workout.

CRITICAL — RESPECT OPTION LANGUAGE:
Plans frequently offer alternatives ("Race or on/off", "Easy or strides", "Long Z2 with optional surges").
The athlete picks the branch that fits their day, terrain, fitness, or device access.
- NEVER grade against the unchosen branch.
- Match lap structure to the matching branch:
  • Race shape: warm-up → sustained hard block (10-40min) → cooldown
  • On/off: alternating high/low IF blocks (1-3min each)
  • Long Z2 + surges: mostly Z2 with brief higher-IF spikes
- If the lap data fits ONE branch, comment against that one.

CRITICAL — USER COMMENTS ARE GROUND TRUTH:
When the athlete writes things like "30 mins strong outside" or "did 5x200 here" — that is what happened.
- Find the lap(s) that match the description and confirm/quantify them.
- Do NOT contradict the athlete's report unless lap data clearly disproves it (e.g. they said "I sprinted 5×400" but no lap exceeds Z3 HR).
- "Battery dead" / "watch crashed" / "device error" = data is incomplete, not the workout.

CRITICAL — DEVIATION DETECTION (anti-praise rules):
NEVER say "exactly as prescribed" / "spot on" / "as planned" if any of:
- actual distance > planned × 1.15 OR < planned × 0.85
- session is in RECOVERY week AND highest_lap_IF > 0.85
- structured session has wrong rep count (e.g. 4×200 planned, 5×200 done)
- session is "easy" but pace/IF is in tempo zone (IF > 0.78 for steady runs)
If any deviation, name it specifically. Don't dress it up as compliance.

SESSION SHAPE VOCABULARY (use these exact terms when relevant):
- "race simulation" — WU → sustained hard → CD pattern
- "polarized intervals" — alternating hard/easy reps
- "tempo continuous" — single sustained block at threshold
- "endurance with progression" — HR climbs steadily across session
- "mixed terrain" — variability driven by hills, not athlete intent

COACHING PHILOSOPHY:
- 80/20 polarized. Quality over quantity runs. Bike handles aerobic volume.
- Strength supports running — never before a key session.
- RESPECT THE BLOCK — do not prescribe intervals during recovery, no marathon-pace work during speed block, etc.
- Recovery weeks exist for a reason. Don't undermine them.
- Tuesday and Thursday COMPLEMENT each other. When Tuesday is hard track, Thursday is either bike intensity or a SHORT sprint fartlek (different energy system). Never the same stimulus twice.
- Speed is built SHORT to LONG: 200m → 400m → 600m → 800m → 1km over weeks. Do not rush this progression.

SESSION FEEDBACK RULES:
- Reference the PLANNED session first ("Today was 6×200m strides to introduce track speed..."), then compare to what actually happened.
- If the athlete comments about what they did (e.g. "I did the 6x200 here"), BELIEVE THEM — don't contradict based on entry distance.
- Reference the workout DESCRIPTION for pace/HR targets, then compare to actual.
- End with what's coming NEXT in the plan, not generic advice.

STYLE:
- Direct, warm, specific. Reference actual numbers from the workout.
- No fluff, no hedging. If he went too fast, say so.
- Like a coach texting an athlete. Short. Punchy.
- Every reply starts with "George: " (naturally — include it in your text).
- Max 120 words for session feedback.
- Max 80 words for chat replies.
- Max 350 words for weekly reviews.
- End with ONE clear next action tied to the current block.`;
}

export interface SessionFeedbackInput {
  apiKey: string;
  workout: TpWorkout;
  recent14d: TpWorkout[];
  upcomingPlanned?: TpWorkout[];
  settings?: TpAthleteSettings;
  /** Optional lap-level data — pulled by caller for sessions where structure matters. */
  detail?: TpDetailData | null;
}

export interface ChatReplyInput {
  apiKey: string;
  workout: TpWorkout;
  recent14d: TpWorkout[];
  upcomingPlanned: TpWorkout[];
  settings?: TpAthleteSettings;
  detail?: TpDetailData | null;
}

/** Build long-term trend stats from 60 days of completed workouts. */
function buildHistoricalContext(workouts: TpWorkout[]): string {
  if (workouts.length === 0) return '(no history)';

  // Group by week (Mon-Sun)
  const weeks = new Map<string, TpWorkout[]>();
  for (const w of workouts) {
    const d = new Date(w.workoutDay || '');
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    const key = d.toISOString().slice(0, 10);
    if (!weeks.has(key)) weeks.set(key, []);
    weeks.get(key)!.push(w);
  }

  // Last 8 weeks
  const weekKeys = Array.from(weeks.keys()).sort().slice(-8);
  const lines: string[] = [];
  for (const k of weekKeys) {
    const ws = weeks.get(k)!;
    const runs = ws.filter((w) => w.workoutTypeValueId === 3);
    const bikes = ws.filter((w) => w.workoutTypeValueId === 2);
    const runKm = runs.reduce((s, w) => s + (w.distance || 0) / 1000, 0);
    const bikeHrs = bikes.reduce((s, w) => s + (w.totalTime || 0), 0);
    const tss = ws.reduce((s, w) => s + (w.tssActual || 0), 0);
    const hrs = runs.filter((r) => r.heartRateAverage).map((r) => r.heartRateAverage!);
    const avgRunHr = hrs.length ? Math.round(hrs.reduce((s, x) => s + x, 0) / hrs.length) : null;
    lines.push(`  Week of ${k}: ${runs.length} runs ${runKm.toFixed(0)}km${avgRunHr ? ` @${avgRunHr}bpm avg` : ''}, ${bikes.length} rides ${bikeHrs.toFixed(1)}hrs, total TSS ${tss.toFixed(0)}`);
  }
  return lines.join('\n');
}

/** Initial feedback on a newly-completed workout. Intelligent analysis using all available data. */
export async function generateSessionFeedback(input: SessionFeedbackInput): Promise<string> {
  const { apiKey, workout, recent14d, upcomingPlanned, settings, detail } = input;
  const liveZones = settings ? zonesFromSettings(settings) : undefined;

  // recent14d is really 60-day context now (renamed for backwards compat)
  const historical = recent14d;
  const runCount = historical.filter((w) => w.workoutTypeValueId === 3).length;
  const bikeCount = historical.filter((w) => w.workoutTypeValueId === 2).length;
  const last14 = historical.slice(0, 14);
  const recentSummary = last14
    .slice(0, 10)
    .map((w) => `  - ${formatWorkout(w)}`)
    .join('\n');

  const weeklyTrends = buildHistoricalContext(historical);

  const upcoming = (upcomingPlanned || []).slice(0, 3);
  const upcomingSummary = upcoming.length > 0
    ? upcoming.map((w) => `  - ${formatWorkout(w)}`).join('\n')
    : '  (no planned sessions in TP yet)';

  // Compute intelligent deltas — these are what a real coach would look at
  const isRun = workout.workoutTypeValueId === 3;
  const isBike = workout.workoutTypeValueId === 2;

  const actualDistKm = workout.distance ? workout.distance / 1000 : 0;
  const plannedDistKm = workout.distancePlanned ? workout.distancePlanned / 1000 : 0;
  const actualDurMin = workout.totalTime ? workout.totalTime * 60 : 0;
  const plannedDurMin = workout.totalTimePlanned ? workout.totalTimePlanned * 60 : 0;

  const distDelta = plannedDistKm > 0 ? ((actualDistKm - plannedDistKm) / plannedDistKm) * 100 : null;
  const durDelta = plannedDurMin > 0 ? ((actualDurMin - plannedDurMin) / plannedDurMin) * 100 : null;
  const tssDelta = workout.tssPlanned && workout.tssActual ? ((workout.tssActual - workout.tssPlanned) / workout.tssPlanned) * 100 : null;

  // HR analysis context (vs his aerobic threshold ~145bpm, lactate ~170bpm, max ~190)
  let hrAnalysis = '';
  if (workout.heartRateAverage) {
    const avg = workout.heartRateAverage;
    if (avg < 135) hrAnalysis = `avg HR ${avg} — deep aerobic / recovery zone`;
    else if (avg < 145) hrAnalysis = `avg HR ${avg} — Z2 aerobic (base-building zone)`;
    else if (avg < 160) hrAnalysis = `avg HR ${avg} — Z3 tempo territory`;
    else if (avg < 172) hrAnalysis = `avg HR ${avg} — Z4 threshold`;
    else hrAnalysis = `avg HR ${avg} — Z5 VO2max / hard`;
    if (workout.heartRateMaximum) {
      const drift = workout.heartRateMaximum - avg;
      hrAnalysis += `, max ${workout.heartRateMaximum} (drift ${drift}bpm)`;
    }
  }

  // Compare RPE vs HR — mismatch is useful signal
  let rpeHrSignal = '';
  if (workout.rpe !== null && workout.rpe !== undefined && workout.heartRateAverage) {
    const rpe = workout.rpe;
    const hr = workout.heartRateAverage;
    // Rough RPE→HR: 1-3=<135, 4-5=135-150, 6-7=150-165, 8=165-175, 9-10=175+
    const expectedHrByRpe = rpe <= 3 ? 130 : rpe <= 5 ? 143 : rpe <= 7 ? 157 : rpe <= 8 ? 170 : 180;
    const gap = hr - expectedHrByRpe;
    if (Math.abs(gap) > 12) {
      rpeHrSignal = gap > 0
        ? `RPE ${rpe} but HR ${hr} — felt easier than it actually was (possible fatigue masking or HR drift)`
        : `RPE ${rpe} but HR only ${hr} — felt harder than the body was working (fresh CNS or under-fueled?)`;
    }
  }

  // Compute athlete's comment (latest non-George comment)
  const comments = workout.workoutComments || [];
  const athleteComments = comments.filter((c) => !(c.comment || '').trim().startsWith('George:'));
  const athleteComment = athleteComments.length > 0
    ? (athleteComments[athleteComments.length - 1].comment || '').trim()
    : '';

  // Lap-level structure (the secret sauce — exposes interval/race-sim shape)
  const lapSummary = detail ? summarizeLapData(detail, isRun) : '(detail data not fetched for this session)';
  const optionInfo = detectOptionLanguage(workout);
  const optionNote = optionInfo.hasOptions
    ? `\n⚡ THIS PLAN OFFERS OPTIONS: [${optionInfo.branches.slice(0, 3).join('] OR [')}]\nMatch the lap structure to the chosen option. Do NOT grade against the unchosen branch.`
    : '';

  const prompt = `Analyze this just-completed workout like a sharp coach who reads BETWEEN the numbers. Don't just restate stats — synthesize them.${optionNote}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WORKOUT: ${formatWorkout(workout)}
Sport: ${isRun ? 'RUN' : isBike ? 'BIKE' : 'Other'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PLANNED vs ACTUAL:
- Distance: ${plannedDistKm.toFixed(1)}km planned → ${actualDistKm.toFixed(2)}km actual ${distDelta !== null ? `(${distDelta > 0 ? '+' : ''}${distDelta.toFixed(0)}%)` : ''}
- Duration: ${plannedDurMin.toFixed(0)}min planned → ${actualDurMin.toFixed(0)}min actual ${durDelta !== null ? `(${durDelta > 0 ? '+' : ''}${durDelta.toFixed(0)}%)` : ''}
- TSS: ${workout.tssPlanned?.toFixed(0) ?? '-'} planned → ${workout.tssActual?.toFixed(0) ?? '-'} actual ${tssDelta !== null ? `(${tssDelta > 0 ? '+' : ''}${tssDelta.toFixed(0)}%)` : ''}

INTENSITY:
- ${hrAnalysis || 'HR: no data'}
- IF: ${workout.if?.toFixed(2) ?? '-'} ${workout.if ? `(${workout.if < 0.65 ? 'very easy/recovery' : workout.if < 0.75 ? 'Z2 endurance' : workout.if < 0.85 ? 'Z3 tempo' : workout.if < 0.95 ? 'Z4 threshold' : 'Z5 VO2max'})` : ''}
- Normalized speed: ${workout.normalizedSpeedActual ? (3.6 * workout.normalizedSpeedActual).toFixed(1) + ' km/h' : '-'}
- Elevation gain: ${workout.elevationGain ?? '-'}m
- Cadence avg: ${workout.cadenceAverage ?? '-'}${isRun ? ' spm (steps/min)' : isBike ? ' rpm' : ''}

ATHLETE'S SELF-REPORT:
- RPE: ${workout.rpe !== null && workout.rpe !== undefined ? workout.rpe + '/10' : 'NOT LOGGED — ask him to log it'}
- Feeling: ${workout.feeling !== null && workout.feeling !== undefined ? workout.feeling + '/5' : 'NOT LOGGED'}
- ${rpeHrSignal || 'RPE-HR alignment: normal'}
- His comment on the workout: ${athleteComment ? `"${athleteComment}"` : '(none yet)'}

COMPLIANCE vs PLAN:
- Distance compliance: ${workout.complianceDistancePercent?.toFixed(0) ?? '-'}%
- Duration compliance: ${workout.complianceDurationPercent?.toFixed(0) ?? '-'}%
- TSS compliance: ${workout.complianceTssPercent?.toFixed(0) ?? '-'}%

WORKOUT DESCRIPTION / PLAN:
${workout.description?.slice(0, 500) ?? '(none)'}

LAP-LEVEL STRUCTURE (this exposes intervals/race-sim shape that session-avg HIDES):
${lapSummary}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
60-DAY WEEKLY TRENDS (long-term pattern):
${weeklyTrends}

LAST 14 DAYS — sessions (${runCount} runs, ${bikeCount} rides in full 60d window):
${recentSummary}

UPCOMING PLANNED:
${upcomingSummary}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

YOUR JOB:
Write 80-120 words as George (texting voice, no bullet points, no headers).

INTELLIGENT SYNTHESIS — don't just list numbers, CONNECT them:
1. Did the planned vs actual tell a story? (He went too hard / held back too much / hit it perfectly)
2. Does the HR match the RPE? (Mismatch = fatigue / under-fuelling / great day)
3. Is the athlete's comment giving you more info than the metrics alone? Always address it if present.
4. Does the TSS planned vs actual signal anything (over-cooked, under-loaded)?
5. ${isBike ? 'For bikes: use IF and NP over pace. Watts if available.' : 'For runs: pace + HR drift + cadence tell the story.'}

TONE:
- First sentence = an observation that COULDN'T be made without all this data synthesized
- NO formulaic openings ("Solid session", "Nice work", "Good [noun]")
- If athlete commented, reference their comment directly
- End with ONE clear next action from his current block's planned sessions

AVOID:
- "Distance compliance was 95%..." (boring restatement)
- Generic advice like "keep it consistent"
- Anything that would violate the current block's restrictions`;

  return callClaude(apiKey, prompt, 600, liveZones);
}

/** Reply to athlete's latest comment on a workout (chat mode). */
export async function generateChatReply(input: ChatReplyInput): Promise<string> {
  const { apiKey, workout, recent14d, upcomingPlanned, settings, detail } = input;
  const liveZones = settings ? zonesFromSettings(settings) : undefined;
  const thread = formatCommentThread(workout.workoutComments || []);

  // Extract Itay's latest message (last non-George comment)
  const comments = workout.workoutComments || [];
  const sorted = [...comments].sort((a, b) => (b.commentDate || '').localeCompare(a.commentDate || ''));
  const itaysLatest = sorted.find((c) => !(c.comment || '').trim().startsWith('George:'));
  const itaysLatestText = itaysLatest ? (itaysLatest.comment || '').trim() : '';

  const recentSummary = recent14d
    .slice(0, 8)
    .map((w) => `  - ${formatWorkout(w)}`)
    .join('\n');

  const upcoming = upcomingPlanned.slice(0, 5);
  const upcomingSummary = upcoming.length > 0
    ? upcoming.map((w) => `  - ${formatWorkout(w)}`).join('\n')
    : '  (none planned)';

  // Lap-level structure for context (shorter than session feedback uses)
  const isRun = workout.workoutTypeValueId === 3;
  const lapSummary = detail ? summarizeLapData(detail, isRun) : '';
  const lapBlock = lapSummary && lapSummary !== '(no laps)' && lapSummary !== '(lap data not available)'
    ? `\nLAP STRUCTURE (verify athlete's claim against this):\n${lapSummary}\n`
    : '';
  const optionInfo = detectOptionLanguage(workout);
  const optionNote = optionInfo.hasOptions
    ? `\nNOTE: this plan had options — match the lap structure to what the athlete chose, don't grade against the unchosen branch.\n`
    : '';

  const prompt = `Itay just messaged you on a workout. Reply like a text conversation.${optionNote}
WORKOUT: ${formatWorkout(workout)}
Key stats: dist ${workout.distance ? (workout.distance / 1000).toFixed(2) + 'km' : '-'} | time ${workout.totalTime ? Math.round(workout.totalTime * 60) + 'min' : '-'} | HR avg ${workout.heartRateAverage ?? '-'} | TSS ${workout.tssActual?.toFixed(0) ?? '-'} | RPE ${workout.rpe ?? '-'}
${lapBlock}
FULL COMMENT THREAD (chronological):
${thread}

⚡ ITAY'S LATEST MESSAGE (this is what you're replying to):
"${itaysLatestText}"

Recent training (context only — don't recap this back to him):
${recentSummary}

Next planned:
${upcomingSummary}

REPLY RULES:
- You are DIRECTLY answering his latest message. Stay on topic.
- If he asked a question → answer it.
- If he reported how he felt → acknowledge, adjust guidance if needed.
- If he describes WHAT HE DID ("30 mins strong", "did 5x200") → believe him. Find it in the lap data above and CONFIRM the block (duration, IF, HR), don't dispute it.
- If he wants to change something → yes/no + why + what you'll adjust.
- Do NOT repeat the workout stats back to him — he just did it.
- Do NOT paste generic summaries — be a human in conversation.
- If he said "great" or "felt good" — brief affirmation + what's next.
- If he said something's off → dig in, ask the right question back.
- NEVER tell him he "bailed" without evidence in the lap data (look for the highest-IF lap before judging).

Max 60 words. Natural texting tone. Don't use bullet points or headers.`;

  return callClaude(apiKey, prompt, 300, liveZones);
}

/** Weekly summary + next week brief. Two clear sections in one message. */
export async function generateWeeklyFeedback(
  apiKey: string,
  weekWorkouts: TpWorkout[],
  previousWeeks: TpWorkout[],
  settings?: TpAthleteSettings,
): Promise<string> {
  const liveZones = settings ? zonesFromSettings(settings) : undefined;
  const runs = weekWorkouts.filter((w) => w.workoutTypeValueId === 3);
  const bikes = weekWorkouts.filter((w) => w.workoutTypeValueId === 2);
  const totalRunKm = runs.reduce((s, w) => s + (w.distance || 0) / 1000, 0);
  const totalBikeHrs = bikes.reduce((s, w) => s + (w.totalTime || 0), 0);
  const totalTss = weekWorkouts.reduce((s, w) => s + (w.tssActual || 0), 0);
  const totalRunHrs = runs.reduce((s, w) => s + (w.totalTime || 0), 0);

  const prevRunKm = previousWeeks
    .filter((w) => w.workoutTypeValueId === 3)
    .reduce((s, w) => s + (w.distance || 0) / 1000, 0) / 3; // avg per previous week
  const prevBikeHrs = previousWeeks
    .filter((w) => w.workoutTypeValueId === 2)
    .reduce((s, w) => s + (w.totalTime || 0), 0) / 3;

  const prompt = `Weekly review for Itay. Respect the current block restrictions (you know them from the system prompt).

THIS WEEK'S NUMBERS:
- Running: ${runs.length} sessions, ${totalRunKm.toFixed(1)}km, ${totalRunHrs.toFixed(1)}hrs
- Cycling: ${bikes.length} sessions, ${totalBikeHrs.toFixed(1)}hrs
- Total TSS: ${totalTss.toFixed(0)}

PREVIOUS 3-WEEK AVERAGES (for trend):
- Run: ~${prevRunKm.toFixed(1)}km/wk
- Bike: ~${prevBikeHrs.toFixed(1)}hrs/wk

THIS WEEK'S SESSIONS (oldest first):
${weekWorkouts.map((w) => `  ${formatWorkout(w)}`).join('\n')}

PREVIOUS 3 WEEKS (context):
${previousWeeks.slice(0, 18).map((w) => `  ${formatWorkout(w)}`).join('\n')}

Write a weekly review with TWO CLEAR SECTIONS separated by a blank line:

**Last 7 days**
2-3 sentences. What actually happened vs what was supposed to happen. Reference specific sessions and numbers. Call out anything that deviated from the block plan. Don't just list what he did — analyze it.

**Next 7 days**
2-3 sentences. Based on where he is in the block and how this week went, what are the 2-3 key sessions for next week? Be specific: day, session type, paces/times. Tie it directly to the current block's success metrics.

Natural voice. No bullet points inside sections. No headers other than the two bolded ones above. Max 280 words total. Avoid formulaic openings like "Solid week" or "Great volume".`;

  return callClaude(apiKey, prompt, 800, liveZones);
}

/** Generate the next training block as structured JSON. */
export interface BlockSession {
  date: string;          // YYYY-MM-DD
  title: string;         // Short — appears in TP calendar
  workoutType: number;   // 1=swim, 2=bike, 3=run, 8=strength, 100=other
  description: string;   // Full structured description with WU/MAIN/CD
  distancePlanned?: number;  // meters
  totalTimePlanned?: number; // hours
  tssPlanned?: number;
}

export async function generateBlock(
  apiKey: string,
  recent28d: TpWorkout[],
  blockStartDate: string,
  blockName: string,
  focusHint: string,
): Promise<BlockSession[]> {
  const summary = recent28d
    .slice(0, 20)
    .map((w) => `  ${formatWorkout(w)}`)
    .join('\n');

  const prompt = `Generate the next 3-week training block for Itay.

Block start: ${blockStartDate} (Monday)
Block name: ${blockName}
Focus: ${focusHint}

Last 28 days of training:
${summary}

Weekly pattern (Itay's preferences — don't violate):
- Mon: Easy run OR easy bike (short)
- Tue: KEY run 1 (track/hills/speed) — fresh legs from Mon
- Wed: Easy bike AM + Strength PM (45 min) — strength AFTER track
- Thu: KEY run 2 (tempo/threshold/progression) OR Zwift race / bike threshold
- Fri: Easy bike 60min or yoga — pre-long run
- Sat: LONG RUN (the big one)
- Sun: LONG RIDE (2-3hrs endurance)

Hard constraints:
- Max 3 runs per week
- No key session right before long run
- Strength never before track
- Week 3 = absorb/deload (easier)

Return ONLY valid JSON, an array of 21 session objects (3 weeks × 7 days). Each:
{
  "date": "YYYY-MM-DD",
  "title": "Short title, max 35 chars (e.g. 'Track — 5x1km @ 3:30')",
  "workoutType": 1 for swim / 2 for bike / 3 for run / 8 for strength / 100 for yoga/other,
  "description": "Full structured session. Use WU / MAIN / CD format. Include pace AND time for intervals (e.g. '6x400m @ 82sec / 3:25/km')",
  "distancePlanned": number in meters (null for bike hours/strength/yoga/rest),
  "totalTimePlanned": number in hours (e.g. 0.75 for 45min),
  "tssPlanned": estimated TSS (optional)
}

Do NOT include markdown, explanations, or commentary. Just the JSON array.`;

  const text = await callClaude(apiKey, prompt, 4000);

  // Extract JSON from the response
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('Block generation: no JSON array found in response');

  let sessions: BlockSession[];
  try {
    sessions = JSON.parse(match[0]);
  } catch (e: any) {
    throw new Error(`Block generation: failed to parse JSON: ${e.message}`);
  }

  if (!Array.isArray(sessions) || sessions.length === 0) {
    throw new Error('Block generation: response is not a valid array');
  }

  return sessions;
}

async function callClaude(apiKey: string, prompt: string, maxTokens = 500, liveZones?: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system: buildSystemPrompt(liveZones),
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error ${res.status}: ${err.slice(0, 300)}`);
  }

  const data = (await res.json()) as any;
  const text = data.content?.[0]?.text;
  if (!text) throw new Error('Claude returned no text content');

  // Ensure George prefix for consistency (strip it if present, then we add it when posting)
  return text.trim();
}
