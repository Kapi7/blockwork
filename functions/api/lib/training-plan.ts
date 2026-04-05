/**
 * Itay's 12-week training plan — the source of truth George coaches from.
 *
 * Four sequential blocks leading to A-race 5K on June 14:
 *   0: Reset & Reload    (Mar 23 – Apr 13) — current
 *   1: Build the Engine  (Apr 14 – May 4)
 *   2: Hunt the 5K       (May 5  – May 25)
 *   3: Sharpen the Blade (May 26 – Jun 15)
 *
 * Weekly pattern (blocks 1-3): 3 quality runs + bike for aerobic volume.
 *   Mon: Easy run OR bike
 *   Tue: KEY run 1 (track/hills/speed)
 *   Wed: Bike AM + Strength PM
 *   Thu: KEY run 2 (tempo/threshold) OR Zwift race
 *   Fri: Easy bike / yoga (pre-long run)
 *   Sat: Long run
 *   Sun: Long ride 2-3hrs
 */

export interface TrainingBlock {
  id: string;
  number: number;
  name: string;
  phase: 'recovery' | 'base' | 'speed' | 'taper' | 'race';
  startDate: string;  // YYYY-MM-DD
  endDate: string;
  stimulus: string;
  goals: string[];
  successMetrics: string[];
  weekPattern: string;
  restrictions: string[];
}

export const ATHLETE_PROFILE = {
  name: 'Itay Kapiloto',
  location: 'Cyprus',
  experience: '6 years running',
  pbs: {
    '5K': '18:00 (2022)',
    '10K': '36:51 (2022)',
    'Half Marathon': '1:21:43 (Jan 2026)',
    'Marathon': '2:52:10 (2023)',
  },
  recentEvent: 'Limassol Marathon 2026-03-22 — blew up, finished 3:02 targeting 2:48',
  shortTermGoal: 'Sub-17:30 5K',
  longTermGoal: 'Sub-36 10K',
  aRace: '5K on 2026-06-14',
  weeklyAvailability: {
    runningHours: 12,
    cyclingHours: 5,
    maxLongRunKm: 22,
    maxLongRideHours: 3,
  },
  notes: 'Wants to work on strength. 3 runs/week — bike does the volume. Strength never before track.',
  weeklyPattern: [
    'Mon: Easy run OR bike',
    'Tue: KEY run 1 (track/hills/speed) — fresh legs',
    'Wed: Easy bike AM + Strength PM (45min)',
    'Thu: KEY run 2 (tempo/threshold) OR Zwift race / bike threshold',
    'Fri: Easy bike 60min or yoga (pre-long run)',
    'Sat: LONG RUN',
    'Sun: LONG RIDE 2-3hrs',
  ],
};

export const BLOCKS: TrainingBlock[] = [
  {
    id: 'block-0-recovery',
    number: 0,
    name: 'Reset & Reload',
    phase: 'recovery',
    startDate: '2026-03-23',
    endDate: '2026-04-13',
    stimulus: 'Post-marathon recovery. Rebuild movement quality. Return to running pain-free.',
    goals: [
      'Max 3 easy runs/week, under 25km total',
      'Bike 3-4x/week for aerobic maintenance',
      'Yoga/mobility 2x/week',
      'Strides introduced from week 2',
      'Pain-free and motivated by end of block',
    ],
    successMetrics: [
      'Zero niggles by Apr 13',
      'Easy run HR < 140bpm at 5:15+/km',
      'Excited to start base block',
    ],
    weekPattern: 'Easy running only. No key sessions. Bike/yoga/strength in the gaps.',
    restrictions: [
      'NO track sessions, NO tempo, NO intervals',
      'NO runs over 7km',
      'HR cap: 140bpm on easy runs',
      'If anything hurts, stop and rest',
      'Strength must be light (bodyweight, no heavy loads)',
    ],
  },
  {
    id: 'block-1-base',
    number: 1,
    name: 'Build the Engine',
    phase: 'base',
    startDate: '2026-04-14',
    endDate: '2026-05-04',
    stimulus: 'Rebuild aerobic base with structure. Hill work for power. Bike threshold for aerobic ceiling. Strength 2x/week.',
    goals: [
      'Build running to 45-50km/week',
      'Introduce hill repeats (6x200m uphill)',
      'Long run to 18km with negative split',
      'Bike threshold: 4x5min Z4 controlled',
      'Strength progressing load',
    ],
    successMetrics: [
      'Long run 18km, last 5km at 4:35-4:45/km',
      'Hill power: 200m uphill in 42-45sec (3:30-3:45/km pace)',
      'Bike Z4: 4x5min without blowing up',
      'Tempo: 4:15-4:25/km feels smooth',
    ],
    weekPattern: 'Tue = hills OR fartlek. Thu = tempo OR bike threshold. Sat = long run progressive.',
    restrictions: [
      'No 5K pace intervals yet (save for speed block)',
      'Long run must include negative split finish',
      'Week 3 is absorb — back off slightly',
    ],
  },
  {
    id: 'block-2-speed1',
    number: 2,
    name: 'Hunt the 5K',
    phase: 'speed',
    startDate: '2026-05-05',
    endDate: '2026-05-25',
    stimulus: '5K-specific speed. Track intervals at race pace. Zwift races for bike intensity.',
    goals: [
      '5K pace reps (3:28-3:32/km) feeling controlled',
      'Track: 400m in 80-82sec (3:20-3:25/km)',
      'Tempo: 3km @ 4:00-4:05/km continuous',
      '5K time trial at end of block targeting 17:45',
    ],
    successMetrics: [
      '1km reps @ 3:28-3:32/km with HR < 178',
      '400m reps at 80-82sec smooth',
      '3km tempo at 4:00-4:05 controlled',
      '5K time trial under 17:45',
    ],
    weekPattern: 'Tue = TRACK (5x1km @ race pace, 6x800m, or sharpeners). Thu = tempo+speed combo. Sat = long run with fast finish.',
    restrictions: [
      'No full marathon-pace work',
      'Track work must be on track or flat route',
      'Long run max 20km — don\'t rob energy from speed',
    ],
  },
  {
    id: 'block-3-speed2',
    number: 3,
    name: 'Sharpen the Blade',
    phase: 'speed',
    startDate: '2026-05-26',
    endDate: '2026-06-15',
    stimulus: 'Race-specific sharpening. Shorter, faster reps. Taper in week 3. A-race 5K June 14.',
    goals: [
      '5K pace feels automatic',
      '200m reps at 36-38sec (3:00-3:10/km) effortless',
      '3km time trial under 10:30',
      'A-RACE 5K: sub-17:30 (stretch: 17:00-17:15)',
    ],
    successMetrics: [
      '3km time trial under 10:30 (3:30/km)',
      '200m reps at 36-38sec relaxed',
      'A-race 5K sub-17:30',
      'Race execution: even or negative split',
    ],
    weekPattern: 'Tue = race simulation OR 400m speed. Thu = threshold+speed combo. Week 3 = TAPER.',
    restrictions: [
      'Week 3 is strict taper — reduced volume, sharp short reps only',
      'No new training stimuli in week 3',
      'No strength after the first week of this block',
    ],
  },
];

/** Find which block covers the given date. Returns null if outside any block. */
export function currentBlock(date: string = new Date().toISOString().slice(0, 10)): TrainingBlock | null {
  return BLOCKS.find((b) => date >= b.startDate && date <= b.endDate) || null;
}

/** Next block after the current date, or null. */
export function nextBlock(date: string = new Date().toISOString().slice(0, 10)): TrainingBlock | null {
  const current = currentBlock(date);
  if (current) {
    const idx = BLOCKS.findIndex((b) => b.id === current.id);
    return BLOCKS[idx + 1] || null;
  }
  return BLOCKS.find((b) => b.startDate > date) || null;
}

/** Days remaining in the current block. */
export function daysLeftInBlock(block: TrainingBlock, date: string = new Date().toISOString().slice(0, 10)): number {
  const end = new Date(block.endDate);
  const now = new Date(date);
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86400000));
}

/** Format the current block context as a prompt-ready string. */
export function blockContextForPrompt(date: string = new Date().toISOString().slice(0, 10)): string {
  const block = currentBlock(date);
  if (!block) {
    return 'NO ACTIVE BLOCK — athlete is between blocks or training plan needs update.';
  }

  const daysLeft = daysLeftInBlock(block, date);
  const next = nextBlock(date);

  return `CURRENT BLOCK: ${block.name} (Block ${block.number}, phase: ${block.phase})
Dates: ${block.startDate} to ${block.endDate} (${daysLeft} days remaining)

Stimulus: ${block.stimulus}

Block goals:
${block.goals.map((g) => `  - ${g}`).join('\n')}

Success metrics:
${block.successMetrics.map((m) => `  - ${m}`).join('\n')}

Week pattern: ${block.weekPattern}

HARD RESTRICTIONS (do NOT prescribe anything that violates these):
${block.restrictions.map((r) => `  - ${r}`).join('\n')}

${next ? `Next block: ${next.name} (${next.phase}) starts ${next.startDate}.` : ''}`;
}
