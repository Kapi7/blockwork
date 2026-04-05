/**
 * Claude Coach — generates feedback in the voice of "George", a pragmatic
 * endurance coach. Three modes:
 * - session: initial feedback on a completed workout
 * - chat:    reply to athlete's comment on a workout
 * - weekly:  7-day summary + focus for coming week
 * - block:   generates next training block (array of workouts)
 */

import type { TpWorkout } from './tp-client';
import { formatWorkout, formatCommentThread } from './tp-client';
import { ATHLETE_PROFILE, blockContextForPrompt } from './training-plan';

function buildSystemPrompt(): string {
  const block = blockContextForPrompt();
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

COACHING PHILOSOPHY:
- 80/20 polarized. Quality over quantity runs. Bike handles aerobic volume.
- Strength supports running — never before a key session.
- RESPECT THE BLOCK — do not prescribe intervals during recovery, no marathon-pace work during speed block, etc.
- Recovery weeks exist for a reason. Don't undermine them.

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

Write 80-120 words of feedback in a natural, conversational voice — no bullet points, no headers, no formulaic openings.

AVOID these openings (they feel robotic):
- "Solid session"
- "Nice work"
- "Good [noun]"
- "[Distance]km at [pace]..."

INSTEAD, open with an observation specific to THIS session vs his pattern. Examples:
- "HR crept up in the last 20 minutes — you were fighting it, weren't you?"
- "Three days in a row now hitting Z2 and holding it. That's the point."
- "Compliance says 95% but your IF says otherwise — tell me about the last 15 minutes."
- "Different from Tuesday's grind — this one looks smooth."

Reference specific numbers from the workout. Tie feedback to his CURRENT BLOCK (respect the restrictions above). End with ONE clear next action matching the block phase — not random generic advice.`;

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

  const prompt = `Itay just messaged you on a workout. Reply like a text conversation.

WORKOUT: ${formatWorkout(workout)}
Key stats: dist ${workout.distance ? (workout.distance / 1000).toFixed(2) + 'km' : '-'} | time ${workout.totalTime ? Math.round(workout.totalTime * 60) + 'min' : '-'} | HR avg ${workout.heartRateAverage ?? '-'} | TSS ${workout.tssActual?.toFixed(0) ?? '-'} | RPE ${workout.rpe ?? '-'}

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
- If he wants to change something → yes/no + why + what you'll adjust.
- Do NOT repeat the workout stats back to him — he just did it.
- Do NOT paste generic summaries — be a human in conversation.
- If he said "great" or "felt good" — brief affirmation + what's next.
- If he said something's off → dig in, ask the right question back.

Max 60 words. Natural texting tone. Don't use bullet points or headers.`;

  return callClaude(apiKey, prompt, 300);
}

/** Weekly summary + next week brief. Two clear sections in one message. */
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

  return callClaude(apiKey, prompt, 800);
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
