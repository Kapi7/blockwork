/**
 * Claude Coach — generates feedback in the voice of "George", a pragmatic
 * endurance coach. Three modes:
 * - session: initial feedback on a completed workout
 * - chat:    reply to athlete's comment on a workout
 * - weekly:  7-day summary + focus for coming week
 * - block:   generates next training block (array of workouts)
 */

import type { TpWorkout } from './tp-client';
import { formatWorkout, formatCommentThread, workoutTypeName } from './tp-client';

const COACH_SYSTEM = `You are George, a pragmatic endurance coach for a competitive amateur runner/cyclist named Itay.

About Itay:
- 6 years running, based in Cyprus
- PBs: 5K 18:00 (2022), 10K 36:51 (2022), HM 1:21:43, Marathon 2:52:10
- Just blew up at Limassol Marathon (3:02 vs 2:48 target)
- Short-term goal: sub-17:30 5K
- Long-term goal: sub-36 10K
- Also wants to work on strength

Training setup (3 runs/week, bike does the volume):
- Mon: Easy run or bike
- Tue: KEY run 1 (track/hills/speed) on fresh legs
- Wed: Easy bike + strength PM
- Thu: KEY run 2 (tempo/threshold) OR bike threshold
- Fri: Easy bike or yoga (pre-long run)
- Sat: Long run
- Sun: Long ride (2-3hrs)

Philosophy: 80/20 polarized. Quality over quantity runs. Bike handles aerobic volume. Strength supports running.

Style:
- Direct, warm, specific. Reference the numbers.
- No fluff, no hedging. If he went too fast, say so.
- Like a coach texting an athlete. Short. Punchy.
- Always sign off with a clear next action.
- Start every reply with "George: " (the system infrastructure strips it — you include it naturally).
- Max 120 words for session feedback.
- Max 80 words for chat replies.
- Max 300 words for weekly.`;

export interface SessionFeedbackInput {
  apiKey: string;
  workout: TpWorkout;
  recent14d: TpWorkout[];
  upcomingPlanned?: TpWorkout[];
}

/** Initial feedback on a newly-completed workout. */
export async function generateSessionFeedback(input: SessionFeedbackInput): Promise<string> {
  const { apiKey, workout, recent14d, upcomingPlanned } = input;

  const runCount = recent14d.filter((w) => w.workoutTypeValueId === 3).length;
  const bikeCount = recent14d.filter((w) => w.workoutTypeValueId === 2).length;
  const recentSummary = recent14d
    .slice(0, 10)
    .map((w) => `  - ${formatWorkout(w)}`)
    .join('\n');

  const upcoming = (upcomingPlanned || []).slice(0, 3);
  const upcomingSummary = upcoming.length > 0
    ? upcoming.map((w) => `  - ${formatWorkout(w)}`).join('\n')
    : '  (no planned sessions in TP yet)';

  const prompt = `Just-finished workout:

${formatWorkout(workout)}

Details:
- Planned: ${workout.distancePlanned ? (workout.distancePlanned / 1000).toFixed(1) + 'km' : '-'} / ${workout.totalTimePlanned ? Math.round(workout.totalTimePlanned * 60) + 'min' : '-'} / TSS ${workout.tssPlanned?.toFixed(0) ?? '-'}
- Actual: ${workout.distance ? (workout.distance / 1000).toFixed(2) + 'km' : '-'} / ${workout.totalTime ? Math.round(workout.totalTime * 60) + 'min' : '-'} / TSS ${workout.tssActual?.toFixed(0) ?? '-'}
- HR: avg ${workout.heartRateAverage ?? '-'}, max ${workout.heartRateMaximum ?? '-'}
- IF: ${workout.if?.toFixed(2) ?? '-'}
- Compliance: dist ${workout.complianceDistancePercent ?? '-'}%, time ${workout.complianceDurationPercent ?? '-'}%, tss ${workout.complianceTssPercent ?? '-'}%
- RPE: ${workout.rpe ?? 'not logged'} / Feeling: ${workout.feeling ?? 'not logged'}
- Description: ${workout.description?.slice(0, 300) ?? '(none)'}

Last 14 days (${runCount} runs, ${bikeCount} rides):
${recentSummary}

Upcoming planned sessions:
${upcomingSummary}

Give Itay 80-120 words of feedback. Reference the actual numbers. End with one clear directive tied to his upcoming sessions.`;

  return callClaude(apiKey, prompt, 500);
}

export interface ChatReplyInput {
  apiKey: string;
  workout: TpWorkout;
  recent14d: TpWorkout[];
  upcomingPlanned: TpWorkout[];
}

/** Reply to athlete's latest comment on a workout (chat mode). */
export async function generateChatReply(input: ChatReplyInput): Promise<string> {
  const { apiKey, workout, recent14d, upcomingPlanned } = input;
  const thread = formatCommentThread(workout.workoutComments || []);

  const recentSummary = recent14d
    .slice(0, 8)
    .map((w) => `  - ${formatWorkout(w)}`)
    .join('\n');

  const upcoming = upcomingPlanned.slice(0, 5);
  const upcomingSummary = upcoming.length > 0
    ? upcoming.map((w) => `  - ${formatWorkout(w)}`).join('\n')
    : '  (none planned)';

  const prompt = `Itay commented on this workout — you need to reply.

Workout: ${formatWorkout(workout)}
Details: dist ${workout.distance ? (workout.distance / 1000).toFixed(2) + 'km' : '-'}, time ${workout.totalTime ? Math.round(workout.totalTime * 60) + 'min' : '-'}, HR avg ${workout.heartRateAverage ?? '-'}, TSS ${workout.tssActual?.toFixed(0) ?? '-'}, RPE ${workout.rpe ?? '-'}

Comment thread (chronological):
${thread}

Last 14 days context:
${recentSummary}

Next planned:
${upcomingSummary}

Itay's latest message is the last one in the thread. Reply to it directly — like texting. If he asks a question, answer it. If he reports how he felt, acknowledge it and give guidance. If he wants to adjust something, be direct: yes/no and why.

Max 80 words. Conversational but specific.`;

  return callClaude(apiKey, prompt, 400);
}

/** Weekly summary. */
export async function generateWeeklyFeedback(
  apiKey: string,
  weekWorkouts: TpWorkout[],
  previousWeeks: TpWorkout[],
): Promise<string> {
  const runs = weekWorkouts.filter((w) => w.workoutTypeValueId === 3);
  const bikes = weekWorkouts.filter((w) => w.workoutTypeValueId === 2);
  const totalRunKm = runs.reduce((s, w) => s + (w.distance || 0) / 1000, 0);
  const totalBikeHrs = bikes.reduce((s, w) => s + (w.totalTime || 0), 0);
  const totalTss = weekWorkouts.reduce((s, w) => s + (w.tssActual || 0), 0);

  const prompt = `Weekly review. Last 7 days:

Running: ${runs.length} sessions, ${totalRunKm.toFixed(1)}km total
Cycling: ${bikes.length} sessions, ${totalBikeHrs.toFixed(1)}hrs total
Combined TSS: ${totalTss.toFixed(0)}

Sessions:
${weekWorkouts.map((w) => `  ${formatWorkout(w)}`).join('\n')}

Previous 3 weeks (trend context):
${previousWeeks.slice(0, 15).map((w) => `  ${formatWorkout(w)}`).join('\n')}

Write a 200-250 word weekly review covering:
1. What went well (reference numbers)
2. What needs adjustment
3. Focus for next week (specific sessions)
4. Red flags

End with the #1 priority for the coming week.`;

  return callClaude(apiKey, prompt, 700);
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

async function callClaude(apiKey: string, prompt: string, maxTokens = 500): Promise<string> {
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
      system: COACH_SYSTEM,
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
