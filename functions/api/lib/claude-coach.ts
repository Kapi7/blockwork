/**
 * Claude Coach — generates feedback in the voice of "George", a no-nonsense
 * endurance coach for runners and cyclists.
 *
 * Three analysis modes:
 * - session: feedback on one completed workout
 * - weekly: summary + focus for the coming week
 * - block: end-of-block review + next block direction
 */

import type { TpWorkout } from './tp-client';
import { formatWorkout } from './tp-client';

const COACH_SYSTEM = `You are George, a pragmatic endurance coach for a competitive amateur runner/cyclist named Itay.

Style:
- Direct, warm, specific. Reference the numbers.
- No fluff, no hedging. If he went too fast, say so.
- 80/20 polarized training philosophy.
- He has a goal: sub-17:30 5K and sub-36 10K.
- He's post-marathon (Limassol blow-up) rebuilding.
- He does 3 runs/week (Tue key, Thu key, Sat long), bike does the rest.

Tone: Like a coach texting an athlete. Short. Punchy. End with a clear next action.
Max 120 words for session feedback. Max 300 for weekly.`;

export interface SessionFeedbackInput {
  apiKey: string;
  workout: TpWorkout;
  recent14d: TpWorkout[];
}

export async function generateSessionFeedback(input: SessionFeedbackInput): Promise<string> {
  const { apiKey, workout, recent14d } = input;

  const runCount = recent14d.filter((w) => w.workoutTypeValueId === 3).length;
  const bikeCount = recent14d.filter((w) => w.workoutTypeValueId === 2).length;
  const recentSummary = recent14d
    .slice(0, 10)
    .map((w) => `  - ${formatWorkout(w)}`)
    .join('\n');

  const prompt = `Today's workout just finished:

${formatWorkout(workout)}

Details:
- Planned vs actual distance: ${workout.distancePlanned ? (workout.distancePlanned / 1000).toFixed(1) + 'km planned' : 'no plan'} / ${workout.distance ? (workout.distance / 1000).toFixed(2) + 'km actual' : '-'}
- Avg HR: ${workout.heartRateAverage ?? '-'}, Max HR: ${workout.heartRateMaximum ?? '-'}
- TSS: ${workout.tssActual?.toFixed(0) ?? '-'}${workout.tssPlanned ? ` (planned ${workout.tssPlanned.toFixed(0)})` : ''}
- IF: ${workout.if?.toFixed(2) ?? '-'}
- Compliance: dist ${workout.complianceDistancePercent ?? '-'}%, time ${workout.complianceDurationPercent ?? '-'}%, tss ${workout.complianceTssPercent ?? '-'}%
- Itay's RPE: ${workout.rpe ?? 'not logged'}
- Itay's feeling: ${workout.feeling ?? 'not logged'}

Last 14 days context (${runCount} runs, ${bikeCount} rides):
${recentSummary}

Give him 80-120 words of feedback. Reference the actual numbers. End with one clear directive about tomorrow.`;

  return callClaude(apiKey, prompt);
}

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

Previous 3 weeks (for trend):
${previousWeeks.slice(0, 15).map((w) => `  ${formatWorkout(w)}`).join('\n')}

Write a 250-word weekly review covering:
1. What went well (reference numbers)
2. What needs adjustment
3. Focus for next week (specific sessions)
4. Red flags (if any)

End with the #1 priority for the coming week.`;

  return callClaude(apiKey, prompt, 600);
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
  return text;
}
