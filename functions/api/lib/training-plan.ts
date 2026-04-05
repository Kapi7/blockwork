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

/**
 * Training zones — calibrated from Itay's PBs (1:21 HM, 2:52 mara, 18:00 5K target sub-17:30).
 * Use these inside every structured session so targets are explicit.
 */
export const ZONES = {
  run: {
    easy: { pace: '5:00-5:20/km', hr: 'Z1-Z2, <145bpm', rpe: '3-4/10' },
    steady: { pace: '4:40-4:55/km', hr: 'Z2-Z3, 150-165bpm', rpe: '5/10' },
    tempo: { pace: '4:15-4:25/km', hr: 'Z3-Z4, 165-175bpm', rpe: '7/10' },
    threshold: { pace: '4:00-4:10/km', hr: 'Z4, 175-180bpm', rpe: '8/10' },
    fivek: { pace: '3:28-3:35/km', hr: 'Z4-Z5, 180-187bpm', rpe: '9/10' },
    vo2: { pace: '3:15-3:25/km', hr: 'Z5, 185+bpm', rpe: '9.5/10' },
  },
  bike: {
    // Assumed FTP ≈ 250W (update if known). Percentages scale correctly either way.
    z1: { power: '<56% FTP (<140W)', hr: '<125bpm', rpe: '2/10' },
    z2: { power: '56-75% FTP (140-190W)', hr: '125-150bpm', rpe: '3-4/10' },
    z3: { power: '76-90% FTP (190-225W)', hr: '150-165bpm', rpe: '5-6/10' },
    z4: { power: '91-105% FTP (228-263W)', hr: '165-175bpm', rpe: '7-8/10' },
    z5: { power: '106-120% FTP (265-300W)', hr: '175+bpm', rpe: '9/10' },
  },
};

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
      { date: '2026-04-14', title: 'Easy run', workoutType: 3, description: `EASY RUN — base aerobic
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (1km)
  • Easy jog 5:20/km | HR Z1 <140bpm | RPE 3/10

MAIN  (6km)
  • Steady easy 5:05-5:15/km
  • HR cap: Z2, <145bpm
  • Breathing: full nasal, could chat easily
  • RPE 3-4/10

COOL-DOWN  (1km)
  • Jog 5:25/km + walk 2min

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 8km ~42min  |  TSS ~40
FIRST RUN OF BASE BLOCK — no ego. Pace is a CAP, not a target.`, distancePlanned: 8000, totalTimePlanned: 0.7, tssPlanned: 40 },
      { date: '2026-04-15', title: 'KEY 1 — Hill repeats', workoutType: 3, description: `KEY 1 — HILL REPEATS (power)
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (2.5km, ~15min)
  • 2km easy jog 5:10/km | HR <150
  • Dynamic drills: leg swings, high knees, A-skips, B-skips (5min)
  • 3x 80m accelerations (build to 5K pace)

MAIN SET  —  6x 200m UPHILL
  • Grade: 6-8%
  • Target: 42-45sec per rep  (≈ 3:30-3:45/km pace)
  • Effort: 9/10 — DRIVE knees, pump arms, tall posture
  • HR: Z4-Z5 on rep, recover to Z2 before next
  • Recovery: easy jog DOWN the hill (~90sec), full breathing restored

COOL-DOWN  (2.5km)
  • 2km easy 5:20/km
  • 4x 100m FLAT strides (build, not sprint)

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~10km  |  TSS ~65
PURPOSE: neuromuscular power + form under load.
Hills are the foundation that 5K speed sits on.`, distancePlanned: 10000, totalTimePlanned: 0.92, tssPlanned: 65 },
      { date: '2026-04-16', title: 'AM Yoga / Mobility', workoutType: 100, description: 'Yoga / mobility 40min\n- Sun salutations\n- Hip openers, runner\'s lunge sequence\n- Hamstring PNF stretching\n- Foam roll quads, calves, glutes, IT band\n\nRecovery-focused flow between key sessions.', totalTimePlanned: 0.67 },
      { date: '2026-04-16', title: 'PM Strength', workoutType: 8, description: 'Strength 45min\n\n- Back squats 3x8\n- Walking lunges 3x10/leg\n- Single-leg RDL 3x8/leg\n- Box jumps 3x5\n- Plank 3x45sec\n- Copenhagen plank 3x20sec/side\n\nStrength AFTER track day = optimal. Moderate load, good form over heavy weight.', totalTimePlanned: 0.75 },
      { date: '2026-04-17', title: 'KEY 2 — Fartlek', workoutType: 3, description: `KEY 2 — FARTLEK  (find the gears)
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (2km)
  • Easy jog 5:10/km | HR <150
  • 4x 80m strides (build to tempo)

MAIN SET  —  8x (90s HARD / 90s EASY)
  • HARD: 4:00-4:10/km (threshold)
     HR Z4 175-180bpm  |  RPE 8/10
  • EASY: 5:15-5:30/km recovery jog
     HR drop to Z2, ~155bpm  |  RPE 4/10
  • Run by FEEL, not watch — road terrain permitting
  • Total work: 12min | Total set: 24min

COOL-DOWN  (2km)
  • Easy 5:20/km + 2min walk

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~10km  |  TSS ~75
PURPOSE: teach the body to switch gears without blowing up.`, distancePlanned: 10000, totalTimePlanned: 0.95, tssPlanned: 75 },
      { date: '2026-04-18', title: 'Easy run pre-long', workoutType: 3, description: `EASY PRE-LONG
━━━━━━━━━━━━━━━━━━━━━━━━
MAIN  (6km)
  • Easy 5:15-5:25/km | HR Z1-Z2, <140bpm | RPE 3/10
  • Flush legs, stay loose, no surges

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 6km ~32min  |  TSS ~30
Tomorrow is the long run — protect the tank.`, distancePlanned: 6000, totalTimePlanned: 0.52, tssPlanned: 30 },
      { date: '2026-04-19', title: 'Long run — negative split', workoutType: 3, description: `LONG RUN — NEGATIVE SPLIT  (14km)
━━━━━━━━━━━━━━━━━━━━━━━━
SEGMENT 1  —  km 1-10  (PATIENCE)
  • Pace: 5:00-5:05/km
  • HR: Z2 <150bpm
  • RPE 4/10 — feel held back
  • If km 1-3 feel hard → you went too fast

SEGMENT 2  —  km 11-12  (SHIFT)
  • Pace: 4:45-4:50/km
  • HR: Z2-Z3, 155-165bpm
  • RPE 6/10

SEGMENT 3  —  km 13-14  (CONTROLLED PUSH)
  • Pace: 4:35-4:40/km
  • HR: Z3, 165-172bpm
  • RPE 7/10 — finish STRONG, not dead

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 14km ~70min  |  TSS ~90
Last km should be your fastest.
If Seg 3 feels desperate, Seg 1 was too hot.`, distancePlanned: 14000, totalTimePlanned: 1.17, tssPlanned: 90 },
      { date: '2026-04-20', title: 'Long ride — aerobic builder', workoutType: 2, description: `LONG RIDE — Z2 AEROBIC (2.5hrs)
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (15min)
  • Progressive Z1→Z2 | 130→180W | 85-90rpm

MAIN  (2hrs 5min)
  • Steady Z2 | 160-190W (65-75% FTP) | HR 130-150bpm
  • Cadence 85-95rpm
  • Natural Z3 bursts on climbs OK (210-225W, <2min)
  • RPE 3-5/10 — full-sentence chat

COOL-DOWN  (10min)
  • Easy spin Z1 | <140W | 95rpm

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 2.5hrs  |  TSS ~150
Bike = aerobic volume with ZERO impact on legs.
Hydrate: 750ml/hr + electrolytes.`, totalTimePlanned: 2.5, tssPlanned: 150 },

      // ============ WEEK 2 (Apr 21-27) — Build intensity ============
      { date: '2026-04-21', title: 'Easy run + strides', workoutType: 3, description: `EASY + STRIDES
━━━━━━━━━━━━━━━━━━━━━━━━
MAIN  (8km)
  • Easy 5:00-5:10/km | HR Z1-Z2, <145bpm | RPE 3-4/10

FINISHER — 6x 100m STRIDES
  • Build to 90% over 60m, hold 30m, decel 10m
  • Pace feel: ~3:20/km for the fast portion
  • Recovery: full walk-back (60-90sec)
  • Goal: sharp, relaxed, NOT sprinting

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 9km ~48min  |  TSS ~50
Strides prime the nervous system for tomorrow's track.`, distancePlanned: 9000, totalTimePlanned: 0.79, tssPlanned: 50 },
      { date: '2026-04-22', title: 'KEY 1 — Track 6x400m', workoutType: 3, description: `KEY 1 — TRACK SPEED ENDURANCE
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (2.5km, ~15min)
  • 2km easy 5:10/km | HR <150
  • Drills: A-skips, B-skips, butt kicks, high knees (5min)
  • 3x 80m accelerations (tempo → 5K pace → cruise)

MAIN SET  —  6x 400m
  • Target: 84-86 sec per rep  (3:30-3:35/km)
  • HR: Z4-Z5, 178-185bpm on last 100m
  • RPE 8.5/10 — fast but NOT desperate
  • Recovery: 200m jog, ~90sec, keep moving
  • Form cues: relaxed shoulders, quick feet, tall chest

COOL-DOWN  (2km)
  • Easy 5:20/km + 2min walk + gentle stretch

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~10km  |  TSS ~80
5K PACE TERRITORY.
Targets: 84s=fast end | 86s=control end.
Negative split the set (6th = fastest).`, distancePlanned: 10000, totalTimePlanned: 0.95, tssPlanned: 80 },
      { date: '2026-04-23', title: 'AM Yoga / Mobility', workoutType: 100, description: 'Yoga / mobility 40min\nRecovery-focused flow between key sessions.\nFocus: hips, hamstrings, calves.', totalTimePlanned: 0.67 },
      { date: '2026-04-23', title: 'PM Strength', workoutType: 8, description: 'Strength 45min — progress the load\n\n- Front squats 3x6\n- Bulgarian split squats 3x8/leg\n- Hip thrusts 3x10\n- Box jumps 3x5 (higher box)\n- Core circuit: dead bugs, pallof press, side plank\n- Calf raises 3x15 (weighted, slow eccentric)\n\nHeavier than last week. Form first.', totalTimePlanned: 0.75 },
      { date: '2026-04-24', title: 'KEY 2 — Tempo 3x1.5km', workoutType: 3, description: `KEY 2 — TEMPO CRUISE
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (2.5km)
  • 2km easy 5:10/km
  • 4x 100m strides

MAIN SET  —  3x 1.5km
  • Target: 4:15-4:25/km  (threshold)
  • HR: Z4, 172-180bpm steady
  • RPE 7.5/10 — comfortably hard, controlled breathing
  • Recovery: 90sec easy jog (~5:40/km)
  • Goal: METRONOMIC pacing — each rep within 3sec of target

COOL-DOWN  (2km)
  • Easy 5:20/km + walk

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~11km  |  TSS ~85
First real tempo of the block.
If HR drifts >182 mid-rep → ease back.`, distancePlanned: 11000, totalTimePlanned: 0.95, tssPlanned: 85 },
      { date: '2026-04-25', title: 'Easy bike recovery', workoutType: 2, description: `RECOVERY RIDE  (60min)
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (5min)
  • Spin-up Z1 | <140W | 90rpm

MAIN  (50min)
  • Easy Z1 | 120-160W (50-60% FTP)
  • HR <125bpm | Cadence 90-95rpm
  • RPE 2/10 — flushing, not training

COOL-DOWN  (5min)
  • Soft pedal | <120W

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 60min  |  TSS ~35
Protect the legs for tomorrow's long run.
Bike > run today. No exceptions.`, totalTimePlanned: 1.0, tssPlanned: 35 },
      { date: '2026-04-26', title: 'Long run — progressive', workoutType: 3, description: `LONG RUN — PROGRESSIVE  (16km)
━━━━━━━━━━━━━━━━━━━━━━━━
SEGMENT 1  —  km 1-11  (HOLD BACK)
  • Pace: 5:00-5:05/km
  • HR: Z2, <150bpm
  • RPE 4/10 — should feel EASY

SEGMENT 2  —  km 12-14  (SHIFT)
  • Pace: 4:45/km
  • HR: Z3, 155-165bpm
  • RPE 6/10

SEGMENT 3  —  km 15-16  (CONTROLLED SURGE)
  • Pace: 4:30-4:35/km
  • HR: Z3-Z4, 165-172bpm
  • RPE 7.5/10 — strong, not max

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 16km ~82min  |  TSS ~110
Last 5km teaches the body to run fast when TIRED.
Fueling: 30g carbs at km 9 if available.`, distancePlanned: 16000, totalTimePlanned: 1.35, tssPlanned: 110 },
      { date: '2026-04-27', title: 'Long ride + hills', workoutType: 2, description: `LONG RIDE + HILLS  (2h45)
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (15min)
  • Progressive Z1→Z2 | 130→180W | 90rpm

MAIN  —  Endurance + Climbs
  • Base: Z2 | 170-200W (70-80% FTP) | 85-90rpm
  • CLIMBS (3-4 natural or Zwift):
     Seated: Z3 | 210-230W | 80rpm
     Standing surges: 30sec @ Z4 | 250W+ | every 2min
  • HR: 130-160bpm base, 165-175 on climbs
  • RPE 5-7/10 on climbs

COOL-DOWN  (10min)
  • Easy spin Z1 | 95rpm

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 2h45  |  TSS ~170
Hills on the bike = free strength work for running.
Stand on EVERY climb for at least 30sec.`, totalTimePlanned: 2.75, tssPlanned: 170 },

      // ============ WEEK 3 (Apr 28 - May 4) — Absorb + test ============
      { date: '2026-04-28', title: 'Easy bike Z2', workoutType: 2, description: 'Easy recovery ride 60-75min Z1-Z2\n\nFlat, easy, conversation pace.\nAbsorb week — back off running, let the body absorb 2 weeks of work.', totalTimePlanned: 1.25 },
      { date: '2026-04-29', title: 'KEY lite — Hill sprints + tempo', workoutType: 3, description: `KEY LITE — HILL SPRINTS + TEMPO
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (2km)
  • Easy 5:10/km + drills (5min)
  • 3x 60m accelerations

SET 1  —  10x 10sec HILL SPRINTS
  • Grade: 6-10%
  • Effort: ALL-OUT, maximal power
  • RPE 10/10 (neuromuscular, NOT cardio)
  • Recovery: WALK back, full recovery 60-90sec
  • HR not the target — POWER is
  • Focus: explosive drive, knee lift

TRANSITION  (400m easy)

SET 2  —  2km TEMPO
  • Pace: 4:20-4:30/km
  • HR: Z3-Z4, 170-178bpm
  • RPE 7/10 — flow state, not straining

COOL-DOWN  (2km)
  • Easy jog + walk

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~10km  |  TSS ~60
Absorb-week key. Sharp nervous system, contained TSS.`, distancePlanned: 10000, totalTimePlanned: 0.88, tssPlanned: 60 },
      { date: '2026-04-30', title: 'AM Yoga deep stretch', workoutType: 100, description: 'Yoga 40min — deep stretch (absorb week)\n- Long hold pigeon pose 3min/side\n- Deep squat hold 2min\n- Hamstring PNF stretching\n- IT band foam roll\n- Hip 90/90 rotations', totalTimePlanned: 0.67 },
      { date: '2026-04-30', title: 'PM Strength (lighter)', workoutType: 8, description: 'Strength 40min — absorb week, lighter loads\n\n- Deadlift 3x5\n- Hip thrusts 3x10\n- Single-leg calf raises 3x12\n- Core: plank variations, pallof press\n\nMaintain, don\'t overload. Body needs to absorb.', totalTimePlanned: 0.67 },
      { date: '2026-05-01', title: 'Zwift race', workoutType: 2, description: `ZWIFT RACE — B/C category
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (15min)
  • Progressive Z1→Z3 | 130→210W | include 3x 30sec openers @ Z5 (280W+)

RACE  (20-30min)
  • Pick any B or C cat event
  • Effort: RACE IT — sustained Z4-Z5
  • Power: 90-110% FTP (225-275W)
  • HR: 165-180bpm
  • RPE 8-9/10

COOL-DOWN  (10min)
  • Easy Z1 | <150W | 95rpm

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~55min  |  TSS ~60
Absorb-week intensity goes on the BIKE.
Running stays easy — impact drops, aerobic stays up.`, totalTimePlanned: 0.92, tssPlanned: 60 },
      { date: '2026-05-02', title: 'Easy run + strides', workoutType: 3, description: `EASY PRE-LONG
━━━━━━━━━━━━━━━━━━━━━━━━
MAIN  (6km)
  • Easy 5:10-5:20/km | HR Z1-Z2, <140bpm | RPE 3/10

FINISHER — 4x 100m strides
  • Build to 90%, relaxed, walk back

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 6km ~32min  |  TSS ~30
Tomorrow = THE block test. Protect the tank.`, distancePlanned: 6000, totalTimePlanned: 0.52, tssPlanned: 30 },
      { date: '2026-05-03', title: 'Long run — THE BLOCK TEST', workoutType: 3, description: `LONG RUN — THE BLOCK TEST  (18km)
━━━━━━━━━━━━━━━━━━━━━━━━
SEGMENT 1  —  km 1-13  (PATIENCE)
  • Pace: 5:00/km exact
  • HR: Z2, <150bpm
  • RPE 4/10 — FEEL HELD BACK

SEGMENT 2  —  km 14-15  (SHIFT)
  • Pace: 4:40/km
  • HR: Z3, 160-168bpm
  • RPE 6/10

SEGMENT 3  —  km 16-17  (PUSH)
  • Pace: 4:25/km
  • HR: Z3-Z4, 168-175bpm
  • RPE 8/10

SEGMENT 4  —  km 18  (FAST)
  • Pace: 4:15/km
  • HR: Z4, 175-180bpm
  • RPE 9/10 — controlled maximum

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 18km ~90min  |  TSS ~125
THE BLOCK 1 EXAM.
Finish strong → GREEN LIGHT for Block 2 (speed).
Last km MUST be your fastest.
Fuel: 30g carbs at km 9 + 30g at km 14.`, distancePlanned: 18000, totalTimePlanned: 1.5, tssPlanned: 125 },
      { date: '2026-05-04', title: 'Easy recovery ride', workoutType: 2, description: `RECOVERY RIDE  (75min)
━━━━━━━━━━━━━━━━━━━━━━━━
MAIN
  • Easy Z1 | 120-150W (50-60% FTP)
  • HR <125 | Cadence 90-95rpm
  • Flat route, zero surges
  • RPE 2/10

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 75min  |  TSS ~40
Base block DONE.
How did the 18km feel?
Block review → Speed block (Hunt the 5K) starts tomorrow.`, totalTimePlanned: 1.25, tssPlanned: 40 },
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
