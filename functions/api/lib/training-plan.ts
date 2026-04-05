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

export interface BlockSession {
  date: string;                    // YYYY-MM-DD
  title: string;                   // short calendar title, max ~35 chars
  workoutType: number;             // 1=swim, 2=bike, 3=run, 8=strength, 100=other
  description: string;             // full structured session (WU/MAIN/CD)
  distancePlanned?: number;        // meters
  totalTimePlanned?: number;       // hours
  tssPlanned?: number;
}

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
  sessions?: BlockSession[];       // optional detailed session list
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
    sessions: [
      // Week 1 (Mar 23 — Mar 29): full rest transitioning to easy movement
      { date: '2026-04-06', title: 'Easy run', workoutType: 3, description: 'Easy run 6km @ 5:20/km\nHR cap 140bpm. If legs feel heavy, cut to 4km.', distancePlanned: 6000, totalTimePlanned: 0.53 },
      { date: '2026-04-07', title: 'AM Easy bike', workoutType: 2, description: 'Easy spin 45min Z1-Z2\nCadence focus: 85-90rpm\nActive recovery before tomorrow\'s run.', totalTimePlanned: 0.75 },
      { date: '2026-04-07', title: 'PM Strength (light)', workoutType: 8, description: 'Bodyweight strength 30min\n\n- Squats 3x10\n- Lunges 3x8\n- Glute bridges 3x12\n- Plank 3x30sec\n- Bird-dog 3x8/side\n\nLight. Learn the movements. No DOMS.', totalTimePlanned: 0.5 },
      { date: '2026-04-08', title: 'Easy run + strides', workoutType: 3, description: 'Easy run 6km @ 5:15/km\n+ 4x100m strides (build to 90%, full recovery walk)\nStrides should feel fast but relaxed, NOT sprinting.', distancePlanned: 6000, totalTimePlanned: 0.58 },
      { date: '2026-04-09', title: 'Bike endurance', workoutType: 2, description: 'Endurance ride 75-90min Z2\nOutdoor or Zwift. Steady effort, conversational pace.', totalTimePlanned: 1.25 },
      { date: '2026-04-10', title: 'Yoga / Mobility', workoutType: 100, description: 'Yoga / Mobility 40min\n- Sun salutations 8min\n- Hip openers 10min\n- Runner lunges 8min\n- Foam roll quads, calves, glutes 10min\n- Savasana 4min', totalTimePlanned: 0.67 },
      { date: '2026-04-11', title: 'Easy run + strides', workoutType: 3, description: 'Easy run 7km @ 5:10/km\n+ 6x100m strides\nLast run of recovery block. Should feel smooth and controlled.', distancePlanned: 7000, totalTimePlanned: 0.63 },
      { date: '2026-04-12', title: 'Long easy ride', workoutType: 2, description: 'Long easy ride 2-2.5hrs Z2\nLast 20min can push to Z3 if legs feel good.\nThis is the bridge to base block. Enjoy it.', totalTimePlanned: 2.25 },
      { date: '2026-04-13', title: 'Rest / Block review', workoutType: 100, description: 'REST DAY\n\nBlock 0 ends today.\n\nBlock review self-check (rate 1-10):\n- Energy level: _\n- Any pain: _\n- Motivation to train hard: _\n\nBase block starts tomorrow.', totalTimePlanned: 0 },
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
    weekPattern: 'Mon easy | Tue KEY1 (hills/track) | Wed YOGA + strength | Thu KEY2 (tempo) | Fri easy run pre-long | Sat long run | Sun long ride',
    restrictions: [
      'No 5K pace intervals yet (save for speed block)',
      'Long run must include negative split finish',
      'Week 3 is absorb — back off slightly',
    ],
    sessions: [
      // ============ WEEK 1 (Apr 14-20) — Build introduction ============
      { date: '2026-04-14', title: 'Easy run', workoutType: 3, description: 'Easy run 8km @ 5:10/km\nFirst run of base block. Keep it controlled, no ego.\nHR target < 145bpm.', distancePlanned: 8000, totalTimePlanned: 0.7 },
      { date: '2026-04-15', title: 'KEY 1 — Hill repeats', workoutType: 3, description: 'Hill repeats — power development\n\nWU: 2km easy + dynamic drills (leg swings, high knees, A-skips)\n\nMAIN: 6x200m uphill @ hard effort (42-45sec / 3:30-3:45/km pace)\n- Find a 6-8% grade hill\n- Drive knees, pump arms, stay tall\n- Jog back down for recovery (take 90sec+)\n\nCD: 2km easy + 4x100m flat strides\n\nTotal: ~10km. Hills build the power that speed sits on.', distancePlanned: 10000, totalTimePlanned: 0.92, tssPlanned: 65 },
      { date: '2026-04-16', title: 'AM Yoga / Mobility', workoutType: 100, description: 'Yoga / mobility 40min\n- Sun salutations\n- Hip openers, runner\'s lunge sequence\n- Hamstring PNF stretching\n- Foam roll quads, calves, glutes, IT band\n\nRecovery-focused flow between key sessions.', totalTimePlanned: 0.67 },
      { date: '2026-04-16', title: 'PM Strength', workoutType: 8, description: 'Strength 45min\n\n- Back squats 3x8\n- Walking lunges 3x10/leg\n- Single-leg RDL 3x8/leg\n- Box jumps 3x5\n- Plank 3x45sec\n- Copenhagen plank 3x20sec/side\n\nStrength AFTER track day = optimal. Moderate load, good form over heavy weight.', totalTimePlanned: 0.75 },
      { date: '2026-04-17', title: 'KEY 2 — Fartlek', workoutType: 3, description: 'Fartlek — find the gears\n\nWU: 2km easy\n\nMAIN: 8x (90sec hard / 90sec easy)\n- Hard = 4:00-4:10/km effort (by feel, not watch)\n- Easy = 5:15+ recovery jog\n- Total: ~24min of work\n\nCD: 2km easy\n\nTotal: ~10km. Run by feel. Hard should be 8/10 effort.', distancePlanned: 10000, totalTimePlanned: 0.95, tssPlanned: 75 },
      { date: '2026-04-18', title: 'Easy run pre-long', workoutType: 3, description: 'Easy run 6km @ 5:15/km\n\nPre-long run day. Keep short and easy.\nFlush legs, stay loose.', distancePlanned: 6000, totalTimePlanned: 0.52 },
      { date: '2026-04-19', title: 'Long run — build endurance', workoutType: 3, description: 'Long run 14km — negative split\n\nSeg 1: km 1-10 @ 5:00-5:05/km (easy, relaxed)\nSeg 2: km 11-12 @ 4:45-4:50/km (pick it up slightly)\nSeg 3: km 13-14 @ 4:35-4:40/km (controlled push)\n\nFinish feeling strong, not dead.\nIf Seg 3 feels hard, Seg 1 was too fast.', distancePlanned: 14000, totalTimePlanned: 1.17, tssPlanned: 90 },
      { date: '2026-04-20', title: 'Long ride — aerobic builder', workoutType: 2, description: 'Long ride 2.5hrs Z2\n\n- Outdoor route with some hills\n- Or Zwift — pick a hilly world\n- Steady Z2, natural Z3 on climbs\n- Hydrate properly\n\nBike does the aerobic volume. No impact on the legs.', totalTimePlanned: 2.5, tssPlanned: 150 },

      // ============ WEEK 2 (Apr 21-27) — Build intensity ============
      { date: '2026-04-21', title: 'Easy run + strides', workoutType: 3, description: 'Easy run 9km @ 5:05/km\n+ 6x100m strides at the end\n\nStrides: build to 90%, hold 30m, walk back recovery.\nShould feel sharp, not sprinting.', distancePlanned: 9000, totalTimePlanned: 0.79 },
      { date: '2026-04-22', title: 'KEY 1 — Track speed endurance', workoutType: 3, description: 'Track — speed endurance\n\nWU: 2km easy + drills (A-skips, B-skips, butt kicks) + 3x80m accelerations\n\nMAIN: 6x400m @ 84-86sec (3:30-3:35/km pace)\n- 200m jog recovery (keep moving, ~90sec)\n- Smooth and controlled — don\'t tighten up\n- Focus: relaxed shoulders, quick feet\n\nCD: 2km easy\n\nTotal: ~10km. This is 5K pace territory. Should feel fast but NOT desperate.', distancePlanned: 10000, totalTimePlanned: 0.95, tssPlanned: 80 },
      { date: '2026-04-23', title: 'AM Yoga / Mobility', workoutType: 100, description: 'Yoga / mobility 40min\nRecovery-focused flow between key sessions.\nFocus: hips, hamstrings, calves.', totalTimePlanned: 0.67 },
      { date: '2026-04-23', title: 'PM Strength', workoutType: 8, description: 'Strength 45min — progress the load\n\n- Front squats 3x6\n- Bulgarian split squats 3x8/leg\n- Hip thrusts 3x10\n- Box jumps 3x5 (higher box)\n- Core circuit: dead bugs, pallof press, side plank\n- Calf raises 3x15 (weighted, slow eccentric)\n\nHeavier than last week. Form first.', totalTimePlanned: 0.75 },
      { date: '2026-04-24', title: 'KEY 2 — Tempo cruise', workoutType: 3, description: 'Tempo cruise — lock in the pace\n\nWU: 2km easy + 4x100m strides\n\nMAIN: 3x1.5km @ 4:15-4:25/km\n- 90sec jog recovery between reps\n- Smooth, metronomic pace\n- Breathing should be controlled, not gasping\n\nCD: 2km easy\n\nTotal: ~11km. First real tempo of the block.', distancePlanned: 11000, totalTimePlanned: 0.95, tssPlanned: 85 },
      { date: '2026-04-25', title: 'Easy bike recovery', workoutType: 2, description: 'Easy recovery ride 60min Z1\n\nFlat route, low power, high cadence.\nRecovery before tomorrow\'s long run.\n\nChoose bike over run today — protect the legs.', totalTimePlanned: 1.0 },
      { date: '2026-04-26', title: 'Long run — progressive', workoutType: 3, description: 'Long run 16km — progressive\n\nSeg 1: km 1-11 @ 5:00/km (patience — hold back)\nSeg 2: km 12-14 @ 4:45/km (shift gears)\nSeg 3: km 15-16 @ 4:30-4:35/km (controlled surge)\n\nLast km should be your fastest.\nThe last 5km teaches your body to run fast when tired.', distancePlanned: 16000, totalTimePlanned: 1.35, tssPlanned: 110 },
      { date: '2026-04-27', title: 'Long ride + hills', workoutType: 2, description: 'Long ride 2.5-3hrs — endurance + hills\n\n- Outdoor: pick a route with 3-4 climbs\n- Or Zwift: hilly route (Innsbruck, Watopia hilly)\n- Z2 base, push Z3 on every climb\n- Stand on climbs for 30sec intervals\n\nHills on the bike = free strength work.', totalTimePlanned: 2.75, tssPlanned: 170 },

      // ============ WEEK 3 (Apr 28 - May 4) — Absorb + test ============
      { date: '2026-04-28', title: 'Easy bike Z2', workoutType: 2, description: 'Easy recovery ride 60-75min Z1-Z2\n\nFlat, easy, conversation pace.\nAbsorb week — back off running, let the body absorb 2 weeks of work.', totalTimePlanned: 1.25 },
      { date: '2026-04-29', title: 'KEY lite — Hills + tempo', workoutType: 3, description: 'Hill sprints + tempo finish (absorb week)\n\nWU: 2km easy + drills\n\nMAIN SET 1: 10x10sec hill sprints\n- ALL-OUT effort, maximal power\n- Walk back to start (full recovery — 60-90sec)\n- These are neuromuscular, not cardio\n\nMAIN SET 2: 2km tempo @ 4:20-4:30/km\n- Smooth transition from hills to flat\n\nCD: 2km easy\n\nTotal: ~10km. Lighter than a full key session — absorb week.', distancePlanned: 10000, totalTimePlanned: 0.88, tssPlanned: 60 },
      { date: '2026-04-30', title: 'AM Yoga deep stretch', workoutType: 100, description: 'Yoga 40min — deep stretch (absorb week)\n- Long hold pigeon pose 3min/side\n- Deep squat hold 2min\n- Hamstring PNF stretching\n- IT band foam roll\n- Hip 90/90 rotations', totalTimePlanned: 0.67 },
      { date: '2026-04-30', title: 'PM Strength (lighter)', workoutType: 8, description: 'Strength 40min — absorb week, lighter loads\n\n- Deadlift 3x5\n- Hip thrusts 3x10\n- Single-leg calf raises 3x12\n- Core: plank variations, pallof press\n\nMaintain, don\'t overload. Body needs to absorb.', totalTimePlanned: 0.67 },
      { date: '2026-05-01', title: 'Zwift race', workoutType: 2, description: 'Zwift race — B/C category (absorb week intensity on bike)\n\nPick a short B or C category race (20-30min).\n+ 15min warmup, 10min cooldown.\n\nThis replaces a run key session — recovery week = hard bike, easy running.\nIntensity stays, running impact drops.', totalTimePlanned: 0.92, tssPlanned: 60 },
      { date: '2026-05-02', title: 'Easy run + strides', workoutType: 3, description: 'Easy run 6km @ 5:15/km\n+ 4x100m strides\n\nPre-long run prep. Short, easy, stay loose.', distancePlanned: 6000, totalTimePlanned: 0.52 },
      { date: '2026-05-03', title: 'Long run — THE TEST', workoutType: 3, description: 'Long run 18km — THE BLOCK TEST\n\nSeg 1: km 1-13 @ 5:00/km (PATIENCE)\nSeg 2: km 14-15 @ 4:40/km (shift)\nSeg 3: km 16-17 @ 4:25/km (push)\nSeg 4: km 18 @ 4:15/km (FAST)\n\nYour longest and most important run of the block.\nLast km = fastest km. This proves you\'re ready for speed block.\nIf you finish this strong → green light for Block 2.', distancePlanned: 18000, totalTimePlanned: 1.5, tssPlanned: 125 },
      { date: '2026-05-04', title: 'Easy recovery ride', workoutType: 2, description: 'Easy recovery ride 60-90min Z1\n\nSpin out the long run.\nEasy, flat, no effort.\n\nBase block done. How did the 18km feel?\nBlock review → Speed block starts tomorrow.', totalTimePlanned: 1.25 },
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
