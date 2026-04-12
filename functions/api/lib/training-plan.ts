/**
 * Itay's 16-week training plan — Sang track + Canova fartlek + Norwegian accountability.
 * The source of truth George coaches from.
 *
 * Five sequential blocks leading to 5K TT Jul 4, then 10K TT Aug 1:
 *   0: Reset & Reload              (Mar 23 – Apr 13)
 *   1: Introduction to Speed       (Apr 13 – May 10) — base phase, first track sessions
 *   2: Building the Engine          (May 11 – Jun 7)  — speed phase, 1km reps + 16x400m
 *   3: Race-Specific Sharpening     (Jun 8  – Jul 5)  — speed → 5K TT Jul 4
 *   4: 10K Campaign                 (Jul 6  – Aug 1)  — speed → 10K TT Aug 1
 *
 * Weekly pattern (blocks 1-4):
 *   Mon: Easy bike 60-90min Z2
 *   Tue: TRACK session (3 TP entries: WU / MAIN / CD)
 *   Wed: Easy run 6-7km + strides, max 40min
 *   Thu: FARTLEK — continuous run with surges (single entry)
 *   Fri: OFF or easy bike 45-60min
 *   Sat: LONG RUN with inserts
 *   Sun: Gym (strength + plyos) + easy bike 45-60min
 */

export interface BlockSession {
  date: string;                    // YYYY-MM-DD
  title: string;                   // short calendar title, max ~35 chars
  workoutType: number;             // 1=swim, 2=bike, 3=run, 9=strength, 100=other/yoga
  description: string;             // full structured session (WU/MAIN/CD)
  distancePlanned?: number;        // meters
  totalTimePlanned?: number;       // hours
  tssPlanned?: number;
  structure?: TpWorkoutStructure;  // real TP structured workout (synced to Garmin)
}

/**
 * TP structured workout schema (reverse-engineered from live capture of
 * TrainingPeaks default library item "30-30 Fun" on 2026-04-05).
 *
 * Key insight: `percentOfThresholdPace` means 100% = his LTP (3:45/km).
 * Higher % = FASTER pace. So 5K goal (3:30/km = 210s) = 225/210 = 107%.
 *
 * primaryIntensityMetric options:
 *   - "percentOfThresholdPace"  (for running, relative to pace threshold)
 *   - "percentOfFtp"            (for cycling, relative to FTP)
 *   - "percentOfThresholdHr"    (HR-targeted, relative to LTHR)
 */
export interface TpStructureStep {
  type?: 'step';
  name: string;
  length: { value: number; unit: 'second' | 'meter' | 'kilometer' | 'mile' };
  targets: Array<{ minValue: number; maxValue: number }>;
  intensityClass: 'warmUp' | 'active' | 'rest' | 'coolDown';
  openDuration?: boolean;
}

export interface TpStructureGroup {
  type: 'step' | 'repetition';
  length: { value: number; unit: 'repetition' };
  steps: TpStructureStep[];
  /** Cumulative start offset in meters (for distance-based) or seconds (duration). */
  begin?: number;
  /** Cumulative end offset in the same unit as begin. */
  end?: number;
}

export interface TpWorkoutStructure {
  structure: TpStructureGroup[];
  primaryLengthMetric: 'duration' | 'distance';
  primaryIntensityMetric: 'percentOfThresholdPace' | 'percentOfFtp' | 'percentOfThresholdHr';
  primaryIntensityTargetOrRange: 'target' | 'range';
  polyline?: Array<[number, number]>;
  /**
   * Display unit for distance labels in the TP UI. Without this, the segment
   * bar shows "undefined" instead of km/m. Captured from TP library workouts
   * (e.g. "Track Work 4x800m" uses "mile" for US users). Itay is metric →
   * "kilometer". The `length.value` stays in meters regardless.
   */
  visualizationDistanceUnit?: 'kilometer' | 'mile';
}

// ────────────────────────────────────────────────────────────────────────
// Structure builder helpers — converts high-level intent into TP schema
// ────────────────────────────────────────────────────────────────────────

/** Convert pace (mm:ss/km) to % of Itay's threshold pace (3:45/km = 225s). */
function pacePctOfThreshold(paceMmSs: string): number {
  const [m, s] = paceMmSs.split(':').map(Number);
  const seconds = m * 60 + s;
  return Math.round((225 / seconds) * 100);
}

/** Single-step block by DURATION (warm-up, cool-down, standalone segment). */
function singleStep(
  name: string,
  seconds: number,
  minPct: number,
  maxPct: number,
  intensityClass: TpStructureStep['intensityClass'],
): TpStructureGroup {
  return {
    type: 'step',
    length: { value: 1, unit: 'repetition' },
    steps: [{
      type: 'step',
      name,
      length: { value: seconds, unit: 'second' },
      targets: [{ minValue: minPct, maxValue: maxPct }],
      intensityClass,
      openDuration: false,
    }],
  };
}

/**
 * Distance length for a step. Always stored as `meter` with value in meters.
 * TP renders the UI label using the structure-root `visualizationDistanceUnit`
 * ("kilometer" for metric users), converting 1000 m → "1 km" automatically.
 */
function distLen(meters: number): { value: number; unit: 'meter' } {
  return { value: meters, unit: 'meter' };
}

/** Single-step block by DISTANCE. */
function distStep(
  name: string,
  meters: number,
  minPct: number,
  maxPct: number,
  intensityClass: TpStructureStep['intensityClass'],
): TpStructureGroup {
  return {
    type: 'step',
    length: { value: 1, unit: 'repetition' },
    steps: [{
      type: 'step',
      name,
      length: distLen(meters),
      targets: [{ minValue: minPct, maxValue: maxPct }],
      intensityClass,
      openDuration: false,
    }],
  };
}

/**
 * Repeating distance-based interval set (e.g. 6x 400m hard + 200m jog).
 */
function repeatSetDist(
  reps: number,
  hardMeters: number, hardMinPct: number, hardMaxPct: number,
  restMeters: number, restMinPct: number, restMaxPct: number,
): TpStructureGroup {
  return {
    type: 'repetition',
    length: { value: reps, unit: 'repetition' },
    steps: [
      {
        type: 'step',
        name: 'Hard',
        length: distLen(hardMeters),
        targets: [{ minValue: hardMinPct, maxValue: hardMaxPct }],
        intensityClass: 'active',
        openDuration: false,
      },
      {
        type: 'step',
        name: 'Jog',
        length: distLen(restMeters),
        targets: [{ minValue: restMinPct, maxValue: restMaxPct }],
        intensityClass: 'rest',
        openDuration: false,
      },
    ],
  };
}

/** Repeating interval set (e.g. 6x400m hard/rest). */
function repeatSet(
  reps: number,
  hardSeconds: number, hardMinPct: number, hardMaxPct: number,
  restSeconds: number, restMinPct: number, restMaxPct: number,
): TpStructureGroup {
  return {
    type: 'repetition',
    length: { value: reps, unit: 'repetition' },
    steps: [
      {
        type: 'step',
        name: 'Hard',
        length: { value: hardSeconds, unit: 'second' },
        targets: [{ minValue: hardMinPct, maxValue: hardMaxPct }],
        intensityClass: 'active',
        openDuration: false,
      },
      {
        type: 'step',
        name: 'Easy',
        length: { value: restSeconds, unit: 'second' },
        targets: [{ minValue: restMinPct, maxValue: restMaxPct }],
        intensityClass: 'rest',
        openDuration: false,
      },
    ],
  };
}

/**
 * Decide primaryLengthMetric based on the character of the MAIN work.
 * TP renders the segment preview using this as the unit label — mismatch with
 * step units shows "undefined" in the UI (confirmed by capturing TP's own
 * library workout "Long run, tempo finish" which uses distance + meter steps).
 *
 * Rule: if any ACTIVE-class step uses meters, the workout is distance-based.
 * Warm-up and cool-down segments don't count toward this decision (they're
 * usually time-based regardless).
 */
function detectPrimaryLengthMetric(
  groups: TpStructureGroup[],
): 'distance' | 'duration' {
  const activeSteps: TpStructureStep[] = [];
  for (const g of groups) {
    for (const st of g.steps) {
      if (st.intensityClass === 'active' || st.intensityClass === 'rest') {
        activeSteps.push(st);
      }
    }
  }
  const hasMeterMain = activeSteps.some(
    (s) => s.length.unit === 'meter' || s.length.unit === 'kilometer' || s.length.unit === 'mile',
  );
  return hasMeterMain ? 'distance' : 'duration';
}

/**
 * Compute the polyline visualization array for a structured workout.
 * TP's UI uses this to render the blue bar chart at the top of the workout
 * detail modal AND to resolve segment tooltip labels. Without it, tooltips
 * show "undefined" for the unit.
 *
 * Format: array of [x, y] pairs where x is cumulative position (0..1) and
 * y is intensity (0..1). Each step creates 4 points: rise up from baseline,
 * plateau across the step's length, drop back to baseline. Repetition groups
 * expand to their rep count.
 *
 * Reference: captured from TP library "30-30 Fun" on 2026-04-05.
 */
function computePolyline(groups: TpStructureGroup[]): Array<[number, number]> {
  // First pass: expand repetitions and collect flat step list with length+intensity
  interface FlatStep {
    length: number; // normalized units (seconds OR meters depending on step)
    unit: 'second' | 'meter';
    intensity: number; // midpoint of target % / 100
  }
  const flat: FlatStep[] = [];
  for (const g of groups) {
    const reps = g.length.unit === 'repetition' ? g.length.value : 1;
    for (let r = 0; r < reps; r++) {
      for (const st of g.steps) {
        const u = st.length.unit;
        const unit: 'second' | 'meter' =
          u === 'meter' || u === 'kilometer' || u === 'mile' ? 'meter' : 'second';
        // Normalize distance to meters regardless of input unit (for length math)
        let len = st.length.value;
        if (u === 'kilometer') len *= 1000;
        else if (u === 'mile') len *= 1609.344;
        // Intensity = midpoint of first target, clipped to [0,2] then divided by max
        const tgt = st.targets?.[0];
        const mid = tgt ? (tgt.minValue + tgt.maxValue) / 2 : 75;
        flat.push({ length: len, unit, intensity: mid / 100 });
      }
    }
  }
  if (flat.length === 0) return [];

  // Find max intensity to normalize y to 0..1
  const maxI = Math.max(...flat.map((s) => s.intensity), 1);
  // Compute total length (sum; mixed-unit workouts still render correctly since
  // TP uses this array as a relative-width polyline)
  const total = flat.reduce((a, s) => a + s.length, 0) || 1;

  const pts: Array<[number, number]> = [[0, 0]];
  let cursor = 0;
  for (const s of flat) {
    const x0 = cursor / total;
    cursor += s.length;
    const x1 = cursor / total;
    const y = Math.min(1, Math.max(0, s.intensity / maxI));
    pts.push([x0, y]);
    pts.push([x1, y]);
  }
  pts.push([1, 0]);
  // Round to 3 decimals to match TP's precision
  return pts.map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]);
}

/**
 * Annotate each group with cumulative begin/end offsets. TP library workouts
 * include these on every group (e.g. Track Work 4x800m). Offsets are in the
 * same unit as the primary length metric: meters for distance, seconds for
 * duration. Repetition groups account for reps × per-rep length.
 */
function withBeginEnd(groups: TpStructureGroup[]): TpStructureGroup[] {
  let cursor = 0;
  return groups.map((g) => {
    const reps = g.length.unit === 'repetition' ? g.length.value : 1;
    let perRep = 0;
    for (const st of g.steps) {
      const u = st.length.unit;
      let len = st.length.value;
      if (u === 'kilometer') len *= 1000;
      else if (u === 'mile') len *= 1609.344;
      // second stays as seconds; meter stays as meters
      perRep += len;
    }
    const begin = cursor;
    const end = cursor + perRep * reps;
    cursor = end;
    return { ...g, begin, end };
  });
}

/** Run workout structure keyed to Itay's threshold pace (3:45/km). */
function runStructure(groups: TpStructureGroup[]): TpWorkoutStructure {
  const primary = detectPrimaryLengthMetric(groups);
  return {
    structure: withBeginEnd(groups),
    primaryLengthMetric: primary,
    primaryIntensityMetric: 'percentOfThresholdPace',
    primaryIntensityTargetOrRange: 'range',
    polyline: computePolyline(groups),
    ...(primary === 'distance' ? { visualizationDistanceUnit: 'kilometer' as const } : {}),
  };
}

/** Bike workout structure keyed to Itay's FTP (300W). */
function bikeStructure(groups: TpStructureGroup[]): TpWorkoutStructure {
  const primary = detectPrimaryLengthMetric(groups);
  return {
    structure: withBeginEnd(groups),
    primaryLengthMetric: primary,
    primaryIntensityMetric: 'percentOfFtp',
    primaryIntensityTargetOrRange: 'range',
    polyline: computePolyline(groups),
    ...(primary === 'distance' ? { visualizationDistanceUnit: 'kilometer' as const } : {}),
  };
}

/**
 * KEY-session long warm-up (shared across every KEY run):
 *   1) 2km easy jog (distance-based)
 *   2) Drills + walk break (5min drills described in session text, represented here
 *      as a 300s rest/warm block so the total timing lines up in TP)
 *   3) 4× 100m progressive strides with 90s walk back
 *   4) Short settle (2min walk) before main set
 *
 * Returns the groups that go BEFORE the main set in runStructure([...]).
 */
function keyWarmup(): TpStructureGroup[] {
  return [
    distStep('Easy jog warm up', 2000, 65, 75, 'warmUp'),
    singleStep('Drills + walk break', 300, 30, 50, 'rest'),
    {
      type: 'repetition',
      length: { value: 4, unit: 'repetition' },
      steps: [
        { type: 'step', name: 'Stride 100m', length: { value: 100, unit: 'meter' }, targets: [{ minValue: 115, maxValue: 130 }], intensityClass: 'warmUp', openDuration: false },
        { type: 'step', name: 'Walk back',   length: { value: 90,  unit: 'second' }, targets: [{ minValue: 40,  maxValue: 55 }],  intensityClass: 'rest',   openDuration: false },
      ],
    },
    singleStep('Settle', 120, 30, 50, 'rest'),
  ];
}

/** Standard KEY cool-down jog (10min easy). */
function keyCooldown(): TpStructureGroup {
  return singleStep('Cool down jog', 600, 65, 75, 'coolDown');
}

// Pre-built structures keyed to Itay's real TP zones.
//   Run pace %: 100% = 3:45/km LTP. Faster pace = higher %.
//   Bike power %: 100% = 300W FTP.
// Distance-based where it makes training sense (400m, 1.5km, long-run segments).
// Time-based for warm-ups, cooldowns, and "find-the-gear" style work (fartlek).
export const STRUCTURES = {
  // ═══════════════ RUN: EASY / BASE ═══════════════
  // Easy 8km: 1km WU → 6km steady easy → 1km CD (all distance)
  easyRun8km: runStructure([
    distStep('Warm up',   1000, 65, 75, 'warmUp'),
    distStep('Easy main', 6000, 72, 80, 'active'),
    distStep('Cool down', 1000, 65, 75, 'coolDown'),
  ]),

  // Easy 6km (short recovery run, distance-based)
  easyRun6km: runStructure([
    distStep('Warm up',   1000, 65, 75, 'warmUp'),
    distStep('Easy main', 4000, 72, 80, 'active'),
    distStep('Cool down', 1000, 65, 75, 'coolDown'),
  ]),

  // Easy 7km (Block 0 late week)
  easyRun7km: runStructure([
    distStep('Warm up',   1000, 65, 75, 'warmUp'),
    distStep('Easy main', 5000, 72, 80, 'active'),
    distStep('Cool down', 1000, 65, 75, 'coolDown'),
  ]),

  // Easy 9km + 6x100m strides finisher — ONE 2min transition walk, short walk-back between
  easyRunStrides9km: runStructure([
    distStep('Warm up', 1000, 65, 75, 'warmUp'),
    distStep('Easy main', 7000, 72, 80, 'active'),
    singleStep('Walk 2min transition', 120, 30, 45, 'rest'),
    {
      type: 'repetition',
      length: { value: 6, unit: 'repetition' },
      steps: [
        { type: 'step', name: 'Stride 100m', length: { value: 100, unit: 'meter' }, targets: [{ minValue: 115, maxValue: 130 }], intensityClass: 'active', openDuration: false },
        { type: 'step', name: 'Walk back', length: { value: 60, unit: 'second' }, targets: [{ minValue: 45, maxValue: 60 }], intensityClass: 'rest', openDuration: false },
      ],
    },
    distStep('Cool down', 400, 60, 70, 'coolDown'),
  ]),

  // Easy 6km + 4x100m strides — ONE 2min transition walk, short walk-back between
  easyRunStrides6km: runStructure([
    distStep('Warm up', 1000, 65, 75, 'warmUp'),
    distStep('Easy main', 4000, 72, 80, 'active'),
    singleStep('Walk 2min transition', 120, 30, 45, 'rest'),
    {
      type: 'repetition',
      length: { value: 4, unit: 'repetition' },
      steps: [
        { type: 'step', name: 'Stride 100m', length: { value: 100, unit: 'meter' }, targets: [{ minValue: 115, maxValue: 130 }], intensityClass: 'active', openDuration: false },
        { type: 'step', name: 'Walk back', length: { value: 60, unit: 'second' }, targets: [{ minValue: 45, maxValue: 60 }], intensityClass: 'rest', openDuration: false },
      ],
    },
    distStep('Cool down', 400, 60, 70, 'coolDown'),
  ]),

  // Easy 7km + 4x100m strides — ONE 2min transition walk, short walk-back between
  // 7km total = 1km WU + 5km main + 2min walk + 4×100m strides + 400m CD
  easyRunStrides7km: runStructure([
    distStep('Warm up', 1000, 65, 75, 'warmUp'),
    distStep('Easy main', 5000, 72, 80, 'active'),
    singleStep('Walk 2min transition', 120, 30, 45, 'rest'),
    {
      type: 'repetition',
      length: { value: 4, unit: 'repetition' },
      steps: [
        { type: 'step', name: 'Stride 100m', length: { value: 100, unit: 'meter' }, targets: [{ minValue: 115, maxValue: 130 }], intensityClass: 'active', openDuration: false },
        { type: 'step', name: 'Walk back', length: { value: 60, unit: 'second' }, targets: [{ minValue: 45, maxValue: 60 }], intensityClass: 'rest', openDuration: false },
      ],
    },
    distStep('Cool down', 400, 60, 70, 'coolDown'),
  ]),

  // Easy 8km + 6x100m strides — ONE 2min transition walk, short walk-back between
  easyRunStrides8km: runStructure([
    distStep('Warm up', 1000, 65, 75, 'warmUp'),
    distStep('Easy main', 6000, 72, 80, 'active'),
    singleStep('Walk 2min transition', 120, 30, 45, 'rest'),
    {
      type: 'repetition',
      length: { value: 6, unit: 'repetition' },
      steps: [
        { type: 'step', name: 'Stride 100m', length: { value: 100, unit: 'meter' }, targets: [{ minValue: 115, maxValue: 130 }], intensityClass: 'active', openDuration: false },
        { type: 'step', name: 'Walk back', length: { value: 60, unit: 'second' }, targets: [{ minValue: 45, maxValue: 60 }], intensityClass: 'rest', openDuration: false },
      ],
    },
    distStep('Cool down', 400, 60, 70, 'coolDown'),
  ]),

  // Easy 10km + 6x100m strides — ONE 2min transition walk, short walk-back between
  easyRunStrides10km: runStructure([
    distStep('Warm up', 1000, 65, 75, 'warmUp'),
    distStep('Easy main', 8000, 72, 80, 'active'),
    singleStep('Walk 2min transition', 120, 30, 45, 'rest'),
    {
      type: 'repetition',
      length: { value: 6, unit: 'repetition' },
      steps: [
        { type: 'step', name: 'Stride 100m', length: { value: 100, unit: 'meter' }, targets: [{ minValue: 115, maxValue: 130 }], intensityClass: 'active', openDuration: false },
        { type: 'step', name: 'Walk back', length: { value: 60, unit: 'second' }, targets: [{ minValue: 45, maxValue: 60 }], intensityClass: 'rest', openDuration: false },
      ],
    },
    distStep('Cool down', 400, 60, 70, 'coolDown'),
  ]),

  // 6x 200m uphill (distance-based) — 3:30-3:45/km (100-107% LTP), walk-back rest
  hillRepeats6x200: runStructure([
    ...keyWarmup(),
    {
      type: 'repetition',
      length: { value: 6, unit: 'repetition' },
      steps: [
        { type: 'step', name: 'Uphill HARD', length: { value: 200, unit: 'meter' }, targets: [{ minValue: 100, maxValue: 108 }], intensityClass: 'active', openDuration: false },
        { type: 'step', name: 'Walk down',   length: { value: 90,  unit: 'second' }, targets: [{ minValue: 50, maxValue: 60 }],   intensityClass: 'rest',   openDuration: false },
      ],
    },
    keyCooldown(),
  ]),

  // Fartlek 8x (90s hard / 90s easy) — time-based by design (find-the-gears session)
  fartlek8x90: runStructure([
    ...keyWarmup(),
    repeatSet(8, 90, 90, 100, 90, 65, 75),
    keyCooldown(),
  ]),

  // 6x 400m (DISTANCE) @ 3:30-3:35/km (Z5b 5K pace), 200m jog recovery
  track6x400: runStructure([
    ...keyWarmup(),
    repeatSetDist(6, 400, 105, 110, 200, 55, 65),
    keyCooldown(),
  ]),

  // 3x 1.5km (DISTANCE) tempo @ 4:15/km (88% threshold), 400m jog recovery
  tempo3x1500: runStructure([
    ...keyWarmup(),
    repeatSetDist(3, 1500, 86, 92, 400, 55, 65),
    keyCooldown(),
  ]),

  // Progressive long run 14km — DISTANCE segments
  // NOTE: final segment softened from 83-88% (Z4) to 78-83% (Z3 top) — base block appropriate
  longRun14kmProgressive: runStructure([
    distStep('Segment 1 — patience',  10000, 70, 76, 'active'),
    distStep('Segment 2 — shift',     2000,  78, 83, 'active'),
    distStep('Segment 3 — push',      2000,  78, 83, 'active'),
  ]),

  // Progressive long run 16km — DISTANCE segments
  longRun16kmProgressive: runStructure([
    distStep('Segment 1 — hold back', 11000, 70, 76, 'active'),
    distStep('Segment 2 — shift',     3000,  78, 83, 'active'),
    distStep('Segment 3 — surge',     2000,  83, 90, 'active'),
  ]),

  // The 18km Block test — 4 distance segments, last km fastest
  longRun18kmTest: runStructure([
    distStep('Segment 1 — patience', 13000, 70, 75, 'active'),
    distStep('Segment 2 — shift',    2000,  80, 85, 'active'),
    distStep('Segment 3 — push',     2000,  85, 92, 'active'),
    distStep('Segment 4 — FAST',     1000,  92, 100, 'active'),
  ]),

  // ──────── BIKE ────────
  // Easy bike 45min @ Z1-Z2 (short recovery spin)
  easyBike45: bikeStructure([
    singleStep('Warm up', 300, 45, 55, 'warmUp'),
    singleStep('Z1-Z2 steady', 2100, 55, 68, 'active'),
    singleStep('Cool down', 300, 45, 55, 'coolDown'),
  ]),

  // Easy bike 60min @ Z1-Z2 (50-70% FTP)
  easyBike60: bikeStructure([
    singleStep('Warm up', 600, 50, 60, 'warmUp'),
    singleStep('Z2 steady', 2700, 60, 70, 'active'),
    singleStep('Cool down', 300, 50, 60, 'coolDown'),
  ]),

  // Endurance ride 90min Z2 (68-76% FTP)
  bikeEndurance90: bikeStructure([
    singleStep('Warm up', 600, 50, 65, 'warmUp'),
    singleStep('Z2 endurance', 4500, 65, 75, 'active'),
    singleStep('Cool down', 300, 50, 60, 'coolDown'),
  ]),

  // Long ride 2.5hrs aerobic Z2 (65-75% FTP)
  longRide150: bikeStructure([
    singleStep('Warm up',  900, 50, 65, 'warmUp'),
    singleStep('Z2 endurance', 7500, 65, 75, 'active'),
    singleStep('Cool down', 600, 50, 60, 'coolDown'),
  ]),

  longRide165Hills: bikeStructure([
    singleStep('Warm up',  900, 50, 65, 'warmUp'),
    singleStep('Z2 base + Z3 climbs', 8100, 68, 80, 'active'),
    singleStep('Cool down', 600, 50, 60, 'coolDown'),
  ]),

  recoveryRide60: bikeStructure([
    singleStep('Easy Z1', 3600, 45, 58, 'active'),
  ]),

  // Zwift race — 55min: 15 WU, 25 race (90-110% FTP), 15 CD
  zwiftRace: bikeStructure([
    singleStep('Warm up + openers', 900, 55, 85, 'warmUp'),
    singleStep('RACE', 1500, 90, 110, 'active'),
    singleStep('Cool down', 600, 45, 60, 'coolDown'),
  ]),

  // Bike 90s on/off — 8 reps: 90s Z3-Z4 (85-95% FTP) / 90s Z1 (50-60% FTP)
  // Fun, manageable intensity to wake up the engine. Not a threshold test.
  bikeOnOff90: bikeStructure([
    singleStep('Warm up', 600, 50, 65, 'warmUp'),
    repeatSet(8, 90, 85, 95, 90, 50, 60),  // 8 × (90s ON / 90s OFF) = 24min
    singleStep('Cool down', 600, 50, 60, 'coolDown'),
  ]),

  // Long ride 2hrs Z2 with Z3 surges (feel-based bridge ride)
  longRide120Bridge: bikeStructure([
    singleStep('Warm up', 600, 50, 65, 'warmUp'),
    singleStep('Z2 base', 2400, 65, 75, 'active'),
    singleStep('Z3 surge 1', 300, 78, 85, 'active'),
    singleStep('Z2 settle', 1200, 65, 75, 'active'),
    singleStep('Z3 surge 2', 300, 78, 85, 'active'),
    singleStep('Z2 settle', 1200, 65, 75, 'active'),
    singleStep('Z3 surge 3', 300, 78, 85, 'active'),
    singleStep('Z2 cruise out', 600, 65, 75, 'active'),
    singleStep('Cool down', 300, 50, 60, 'coolDown'),
  ]),

  // Bike tempo intervals — 60min, 3×8min Z3 / 4min Z1
  bikeTempoIntervals: bikeStructure([
    singleStep('Warm up', 600, 50, 65, 'warmUp'),
    repeatSet(3, 480, 78, 85, 240, 45, 55),
    singleStep('Cool down', 600, 50, 60, 'coolDown'),
  ]),

  // Bike sweet spot — 75min, 2×15min @ 88-93% FTP
  bikeSweetSpot: bikeStructure([
    singleStep('Warm up', 600, 50, 65, 'warmUp'),
    singleStep('Sweet spot 1', 900, 88, 93, 'active'),
    singleStep('Recovery', 300, 45, 55, 'rest'),
    singleStep('Sweet spot 2', 900, 88, 93, 'active'),
    singleStep('Z2 endurance', 1200, 65, 75, 'active'),
    singleStep('Cool down', 600, 50, 60, 'coolDown'),
  ]),

  // Bike cadence drills — 60min Z2 with 4×3min high-cadence 100+ rpm
  bikeCadenceDrills: bikeStructure([
    singleStep('Warm up', 600, 50, 65, 'warmUp'),
    repeatSet(4, 180, 60, 70, 300, 60, 70),
    singleStep('Z2 steady', 600, 60, 70, 'active'),
    singleStep('Cool down', 360, 50, 60, 'coolDown'),
  ]),

  // Bike endurance 75min Z2
  bikeEndurance75: bikeStructure([
    singleStep('Warm up', 600, 50, 65, 'warmUp'),
    singleStep('Z2 endurance', 3600, 65, 75, 'active'),
    singleStep('Cool down', 300, 50, 60, 'coolDown'),
  ]),

  // Bike over-under — 60min, 4×(3min Z4 / 2min Z2)
  bikeOverUnder: bikeStructure([
    singleStep('Warm up', 720, 50, 65, 'warmUp'),
    repeatSet(4, 180, 91, 100, 120, 60, 70),
    singleStep('Z2 endurance', 900, 65, 75, 'active'),
    singleStep('Cool down', 360, 50, 60, 'coolDown'),
  ]),

  // Long ride 3hrs Z2
  longRide180: bikeStructure([
    singleStep('Warm up', 900, 50, 65, 'warmUp'),
    singleStep('Z2 endurance', 9000, 65, 75, 'active'),
    singleStep('Cool down', 600, 50, 60, 'coolDown'),
  ]),

  // Key lite — 10x 10sec hill sprints + 2km tempo finish
  hillSprintsTempo: runStructure([
    ...keyWarmup(),
    repeatSet(10, 10, 120, 140, 80, 50, 60),  // 10 × (10s ALL-OUT / 80s walk-back)
    singleStep('Tempo 2km', 540, 86, 92, 'active'),  // ~9min tempo
    keyCooldown(),
  ]),

  // ═══════════════ BLOCK 3: 5K SPEED ═══════════════
  // Run pace: 5K target 17:30 = 3:30/km = 107% of 3:45 threshold.
  // 400m at 3:20/km = 80sec per 400 = 112%. 800m at 3:25/km = 109%.

  // 5×1km @ 3:32-3:36/km (103-105%) — first full 1km reps, SLIGHTLY SLOWER than
  // 5K goal pace. Calibrated to athlete's real ability (historical best 1km: 3:34).
  // Builds confidence before sharpener week. 400m jog recovery.
  track5x1km: runStructure([
    ...keyWarmup(),
    repeatSetDist(5, 1000, 103, 105, 400, 55, 65),
    keyCooldown(),
  ]),

  // 6×800m @ 3:25-3:30/km (107-110%) — realistic overspeed, slightly faster than
  // 5K goal pace. Matches his historical 600-800m cruise ability. 400m jog.
  track6x800m: runStructure([
    ...keyWarmup(),
    repeatSetDist(6, 800, 107, 110, 400, 55, 65),
    keyCooldown(),
  ]),

  // Tempo 3km @ 3:55/km (96%) + 4×200m sharpeners @ 3:15/km (115%)
  tempoAndSharpeners: runStructure([
    ...keyWarmup(),
    distStep('Tempo 3km', 3000, 94, 98, 'active'),
    singleStep('Recovery jog', 180, 55, 65, 'rest'),
    repeatSetDist(4, 200, 113, 118, 200, 50, 60),
    keyCooldown(),
  ]),

  // 2km tempo @ 3:50/km (98%) + 6×400m @ 3:15-3:20/km (112-115%)
  tempoAnd400s: runStructure([
    ...keyWarmup(),
    distStep('Tempo 2km', 2000, 96, 100, 'active'),
    singleStep('Recovery jog', 180, 55, 65, 'rest'),
    repeatSetDist(6, 400, 112, 115, 200, 50, 60),
    keyCooldown(),
  ]),

  // 3×1km sharpener (taper week) @ 3:28-3:32/km (105-108%) — polish AT 5K goal
  // pace with low volume. Sharpens CNS without fatiguing for race week.
  sharpener3x1km: runStructure([
    ...keyWarmup(),
    repeatSetDist(3, 1000, 105, 108, 400, 55, 65),
    keyCooldown(),
  ]),

  // Long run 14km with 3km tempo finish @ 4:00-4:10/km (90-94%)
  longRun14kmTempoFinish: runStructure([
    distStep('Easy', 11000, 70, 76, 'active'),
    distStep('Tempo finish', 3000, 90, 96, 'active'),
  ]),

  // Long run 12km with 2km @ 5K pace finish (3:30 = 107%)
  longRun12km5kFinish: runStructure([
    distStep('Easy', 10000, 70, 76, 'active'),
    distStep('5K pace finish', 2000, 105, 110, 'active'),
  ]),

  // 5K TIME TRIAL — WU, race, CD
  tt5k: runStructure([
    singleStep('Warm up + openers', 900, 65, 85, 'warmUp'),
    distStep('5K RACE', 5000, 105, 112, 'active'),
    singleStep('Cool down', 600, 55, 70, 'coolDown'),
  ]),

  // 3km time trial (race simulation)
  tt3k: runStructure([
    singleStep('Warm up + drills', 900, 65, 80, 'warmUp'),
    distStep('3km RACE', 3000, 108, 115, 'active'),
    singleStep('Cool down', 600, 55, 70, 'coolDown'),
  ]),

  // 10km long run with 3km @ 5K pace finish
  longRun10km5kFinish: runStructure([
    distStep('Easy', 7000, 70, 76, 'active'),
    distStep('5K pace finish', 3000, 105, 110, 'active'),
  ]),

  // Race-week opener: 4km easy + 2x200m at race pace
  raceWeekOpener: runStructure([
    distStep('Easy jog', 4000, 65, 75, 'warmUp'),
    repeatSetDist(2, 200, 107, 112, 200, 50, 60),
  ]),

  // Speed combo: 4x400m + 4x200m
  speedCombo400200: runStructure([
    ...keyWarmup(),
    repeatSetDist(4, 400, 112, 118, 200, 50, 60),
    singleStep('Recovery jog', 180, 55, 65, 'rest'),
    repeatSetDist(4, 200, 115, 125, 200, 45, 55),
    keyCooldown(),
  ]),

  // 3x2km tempo @ 10K pace
  tempo3x2km: runStructure([
    ...keyWarmup(),
    repeatSetDist(3, 2000, 100, 104, 400, 55, 65),
    keyCooldown(),
  ]),

  // 4x2km tempo @ 10K race pace
  tempo4x2km: runStructure([
    ...keyWarmup(),
    repeatSetDist(4, 2000, 102, 105, 400, 55, 65),
    keyCooldown(),
  ]),

  // 14km long run with last 4km @ 10K pace
  longRun14km10kFinish: runStructure([
    distStep('Easy', 10000, 70, 76, 'active'),
    distStep('10K pace finish', 4000, 98, 103, 'active'),
  ]),

  // 10K time trial
  tt10k: runStructure([
    singleStep('Warm up + openers', 900, 65, 85, 'warmUp'),
    distStep('10K RACE', 10000, 103, 107, 'active'),
    singleStep('Cool down', 600, 55, 70, 'coolDown'),
  ]),

  // ═══════════════ SUB-THRESHOLD (Norwegian Singles) ═══════════════
  // Sub-threshold = 5-15 sec/km SLOWER than 3:45 threshold
  // % values here: LOWER % = SLOWER pace (since 100% = 3:45)

  // 4×1km sub-threshold @ 95-98% (3:50-3:56/km), 60s jog — intro version
  subThreshold4x1km: runStructure([
    ...keyWarmup(),
    repeatSetDist(4, 1000, 95, 98, 200, 55, 65),
    keyCooldown(),
  ]),

  // 5×1km sub-threshold @ 96-99%, 60s jog
  subThreshold5x1km: runStructure([
    ...keyWarmup(),
    repeatSetDist(5, 1000, 96, 99, 200, 55, 65),
    keyCooldown(),
  ]),

  // 6×1km sub-threshold @ 96-99%, 60s jog (Bakken classic)
  subThreshold6x1km: runStructure([
    ...keyWarmup(),
    repeatSetDist(6, 1000, 96, 99, 200, 55, 65),
    keyCooldown(),
  ]),

  // 4×2km sub-threshold @ 95-98%, 90s jog
  subThreshold4x2km: runStructure([
    ...keyWarmup(),
    repeatSetDist(4, 2000, 95, 98, 400, 55, 65),
    keyCooldown(),
  ]),

  // 3×3km sub-threshold @ 95-97%, 2min jog (long reps, deep in block)
  subThreshold3x3km: runStructure([
    ...keyWarmup(),
    repeatSetDist(3, 3000, 95, 97, 400, 55, 65),
    keyCooldown(),
  ]),

  // ═══════════════ 5K PACE ON-RAMP (NEW TRAINING STIMULUS) ═══════════════
  // 5K goal pace = 3:29/km = ~107% of 3:45 threshold

  // 10×200m @ 3:25-3:30/km (107-110%), 200m jog — first introduction
  reps10x200m: runStructure([
    ...keyWarmup(),
    repeatSetDist(10, 200, 112, 118, 200, 50, 60),
    keyCooldown(),
  ]),

  // 10×400m @ 3:22-3:28/km (108-112%), 200m jog — less aggressive than before,
  // matches realistic short-rep speed (historical 400m cruise ~80-82s).
  reps10x400m: runStructure([
    ...keyWarmup(),
    repeatSetDist(10, 400, 108, 112, 200, 50, 60),
    keyCooldown(),
  ]),

  // 8×600m @ 3:25-3:30/km (107-110%) — closer to realistic 5K pace target,
  // bridges to 1km reps without overshooting.
  reps8x600m: runStructure([
    ...keyWarmup(),
    repeatSetDist(8, 600, 107, 110, 200, 55, 65),
    keyCooldown(),
  ]),

  // 6×800m @ 3:28-3:32/km (105-108%), 300m jog — bridges into 1km reps
  reps6x800m: runStructure([
    ...keyWarmup(),
    repeatSetDist(6, 800, 105, 108, 300, 55, 65),
    keyCooldown(),
  ]),

  // ═══════════════ SPECIFIC LONG RUNS (Canova inserts) ═══════════════

  // 14km easy + sub-threshold 3km finish @ 95-98%
  longRun14kmSubThreshold: runStructure([
    distStep('Easy Z2', 11000, 70, 76, 'active'),
    distStep('Sub-threshold finish', 3000, 95, 98, 'active'),
  ]),

  // 16km with 4km @ sub-threshold finish
  longRun16kmSubThreshold: runStructure([
    distStep('Easy Z2', 12000, 70, 76, 'active'),
    distStep('Sub-threshold finish', 4000, 95, 98, 'active'),
  ]),

  // 18km CAPPED BLOCK TEST — no Z5a. Pure Z2→Z3 discipline test.
  longRun18kmCapped: runStructure([
    distStep('Easy Z1-Z2', 13000, 70, 76, 'active'),
    distStep('Z3 tempo', 4000, 85, 92, 'active'),
    distStep('Easy cool down', 1000, 70, 76, 'active'),
  ]),

  // 12km with 4km at 10K pace (3:36/km = 104%)
  longRun12km10kFinish: runStructure([
    distStep('Easy Z2', 8000, 70, 76, 'active'),
    distStep('10K pace finish', 4000, 102, 105, 'active'),
  ]),

  // Easy run 10km (longer easy)
  easyRun10km: runStructure([
    distStep('Warm up', 1000, 65, 75, 'warmUp'),
    distStep('Easy main', 8000, 72, 80, 'active'),
    distStep('Cool down', 1000, 65, 75, 'coolDown'),
  ]),

  // Easy run 12km (medium distance)
  easyRun12km: runStructure([
    distStep('Warm up', 1000, 65, 75, 'warmUp'),
    distStep('Easy main', 10000, 72, 80, 'active'),
    distStep('Cool down', 1000, 65, 75, 'coolDown'),
  ]),

  // Easy run 14km (base long run)
  easyRun14km: runStructure([
    distStep('Warm up', 1000, 65, 75, 'warmUp'),
    distStep('Easy main', 12000, 72, 80, 'active'),
    distStep('Cool down', 1000, 65, 75, 'coolDown'),
  ]),

  // Long run 18km with 4km sub-threshold finish
  longRun18kmSubThreshold: runStructure([
    distStep('Easy Z2', 14000, 70, 76, 'active'),
    distStep('Sub-threshold finish', 4000, 95, 98, 'active'),
  ]),

  // Long run 16km with 4km @ 10K pace finish
  longRun16km10kFinish: runStructure([
    distStep('Easy Z2', 12000, 70, 76, 'active'),
    distStep('10K pace finish', 4000, 102, 105, 'active'),
  ]),

  // ═══════════════ KEY SESSION SPLIT HELPERS (WU / MAIN / CD) ═══════════════
  // KEY workouts are run on the track — WU/CD happen in road shoes, MAIN in
  // track spikes. These structures are exposed as 3 separate TP entries on
  // the same date so the athlete can sync/track each leg independently.

  // Generic KEY warm-up (~25-30 min). 3km jog + drills + 5×100m strides + settle.
  keyWarmup: runStructure([
    distStep('Easy jog 3km', 3000, 65, 75, 'warmUp'),
    singleStep('Drills + walk 2min', 300, 30, 50, 'rest'),
    {
      type: 'repetition',
      length: { value: 5, unit: 'repetition' },
      steps: [
        { type: 'step', name: 'Stride 100m', length: { value: 100, unit: 'meter' }, targets: [{ minValue: 115, maxValue: 130 }], intensityClass: 'warmUp', openDuration: false },
        { type: 'step', name: 'Walk back', length: { value: 90, unit: 'second' }, targets: [{ minValue: 40, maxValue: 55 }], intensityClass: 'rest', openDuration: false },
      ],
    },
    singleStep('Settle 2min', 120, 30, 50, 'rest'),
  ]),

  // Generic KEY cool-down (~10-12 min). 2km easy jog + walk/stretch.
  keyCooldown: runStructure([
    distStep('Easy jog cool down', 2000, 60, 70, 'coolDown'),
    singleStep('Walk + stretch', 180, 30, 45, 'rest'),
  ]),

  // ─────── Sub-threshold MAIN sets (no WU/CD) ───────
  mainSubThreshold4x1km: runStructure([
    repeatSetDist(4, 1000, 95, 98, 200, 55, 65),
  ]),
  mainSubThreshold5x1km: runStructure([
    repeatSetDist(5, 1000, 96, 99, 200, 55, 65),
  ]),
  mainSubThreshold6x1km: runStructure([
    repeatSetDist(6, 1000, 96, 99, 200, 55, 65),
  ]),

  // ─────── 5K pace on-ramp MAIN sets (no WU/CD) ───────
  mainReps10x200m: runStructure([
    repeatSetDist(10, 200, 112, 118, 200, 50, 60),
  ]),
  mainReps12x400m: runStructure([
    repeatSetDist(12, 400, 108, 112, 200, 50, 60),
  ]),
  mainReps10x600m: runStructure([
    repeatSetDist(10, 600, 107, 110, 200, 55, 65),
  ]),

  // ─────── Track MAIN sets (no WU/CD) ───────
  mainTrack5x1km: runStructure([
    repeatSetDist(5, 1000, 103, 105, 400, 55, 65),
  ]),
  mainTrack6x800m: runStructure([
    repeatSetDist(6, 800, 107, 110, 400, 55, 65),
  ]),
  mainSharpener3x1km: runStructure([
    repeatSetDist(3, 1000, 105, 108, 400, 55, 65),
  ]),

  // ─────── 10K pace MAIN sets (no WU/CD) ───────
  mainTempo3x2km: runStructure([
    repeatSetDist(3, 2000, 100, 104, 400, 55, 65),
  ]),
  mainTempo4x2km: runStructure([
    repeatSetDist(4, 2000, 102, 105, 400, 55, 65),
  ]),

  // ─────── Bumped interval MAIN sets (calibrated to athlete capacity) ───────
  mainReps12x200m: runStructure([
    repeatSetDist(12, 200, 112, 118, 200, 50, 60),
  ]),
  mainReps12x400mBumped: runStructure([
    repeatSetDist(12, 400, 108, 112, 200, 50, 60),
  ]),
  mainReps10x600mBumped: runStructure([
    repeatSetDist(10, 600, 107, 110, 200, 55, 65),
  ]),
  mainReps8x800m: runStructure([
    repeatSetDist(8, 800, 105, 108, 300, 55, 65),
  ]),
  mainTrack6x1km: runStructure([
    repeatSetDist(6, 1000, 103, 105, 400, 55, 65),
  ]),
  mainTrack8x800m: runStructure([
    repeatSetDist(8, 800, 107, 110, 400, 55, 65),
  ]),
  mainSharpener4x1km: runStructure([
    repeatSetDist(4, 1000, 105, 108, 400, 55, 65),
  ]),
  mainTempo5x2km: runStructure([
    repeatSetDist(5, 2000, 102, 105, 400, 55, 65),
  ]),

  // ─────── Longer long runs (calibrated to athlete avg 20.6km) ───────
  longRun20kmSubThreshold: runStructure([
    distStep('Easy Z2', 16000, 70, 76, 'active'),
    distStep('Sub-threshold finish', 4000, 95, 98, 'active'),
  ]),
  longRun20kmEasy: runStructure([
    distStep('Warm up', 1000, 65, 75, 'warmUp'),
    distStep('Easy main', 18000, 72, 80, 'active'),
    distStep('Cool down', 1000, 65, 75, 'coolDown'),
  ]),
  longRun16kmEasy: runStructure([
    distStep('Warm up', 1000, 65, 75, 'warmUp'),
    distStep('Easy main', 14000, 72, 80, 'active'),
    distStep('Cool down', 1000, 65, 75, 'coolDown'),
  ]),
  longRun20km5kFinish: runStructure([
    distStep('Easy Z2', 17000, 70, 76, 'active'),
    distStep('5K pace finish', 3000, 103, 108, 'active'),
  ]),
  longRun18km5kFinish: runStructure([
    distStep('Easy Z2', 15000, 70, 76, 'active'),
    distStep('5K pace finish', 3000, 103, 108, 'active'),
  ]),
  longRun18km10kFinish: runStructure([
    distStep('Easy Z2', 14000, 70, 76, 'active'),
    distStep('10K pace finish', 4000, 102, 105, 'active'),
  ]),

  // ─────── Thursday sub-threshold / fartlek quality ───────
  thuSubThreshold12km: runStructure([
    distStep('Warm up', 2000, 65, 75, 'warmUp'),
    distStep('Easy', 4000, 72, 80, 'active'),
    distStep('Sub-threshold', 4000, 95, 98, 'active'),
    distStep('Cool down', 2000, 65, 75, 'coolDown'),
  ]),
  thuFartlek10km: runStructure([
    distStep('Warm up', 2000, 65, 75, 'warmUp'),
    distStep('Easy', 3000, 72, 80, 'active'),
    repeatSet(6, 60, 103, 108, 120, 70, 80),
    distStep('Cool down', 2000, 65, 75, 'coolDown'),
  ]),

  // ─────── Block test 20km ───────
  longRun20kmCapped: runStructure([
    distStep('Easy Z1-Z2', 15000, 70, 76, 'active'),
    distStep('Z3 tempo', 4000, 85, 92, 'active'),
    distStep('Easy cool down', 1000, 70, 76, 'active'),
  ]),

  // ═══════════════ NEW PLAN: TRACK MAIN SETS (no WU/CD — separate TP entries) ═══════════════

  // Phase 1 track sessions
  mainTrack10x400mIntro: runStructure([ repeatSetDist(10, 400, 99, 101, 200, 50, 60) ]),
  mainTrack12x400m: runStructure([ repeatSetDist(12, 400, 102, 104, 200, 50, 60) ]),
  mainTrack6x800mIntro: runStructure([ repeatSetDist(6, 800, 99, 101, 200, 55, 65) ]),
  mainTrack8x400m4x200m: runStructure([
    repeatSetDist(8, 400, 102, 104, 200, 50, 60),
    repeatSetDist(4, 200, 112, 118, 200, 45, 55),
  ]),

  // Phase 2 track sessions
  mainTrack5x1kmSpeed: runStructure([ repeatSetDist(5, 1000, 105, 107, 400, 55, 65) ]),
  mainTrack16x400m: runStructure([ repeatSetDist(16, 400, 105, 107, 200, 45, 55) ]),
  mainTrack4x1200m4x400m: runStructure([
    repeatSetDist(4, 1200, 105, 107, 400, 55, 65),
    repeatSetDist(4, 400, 109, 112, 200, 50, 60),
  ]),
  mainTrack6x400m6x200m: runStructure([
    repeatSetDist(6, 400, 107, 109, 200, 50, 60),
    repeatSetDist(6, 200, 115, 120, 200, 45, 55),
  ]),

  // Phase 3 track sessions
  mainTrack8x200m5x1km: runStructure([
    repeatSetDist(8, 200, 118, 125, 200, 40, 50),
    repeatSetDist(5, 1000, 105, 108, 400, 55, 65),
  ]),
  mainTrack20x400m: runStructure([ repeatSetDist(20, 400, 109, 112, 200, 40, 50) ]),
  mainTrack6x800m6x200m: runStructure([
    repeatSetDist(6, 800, 107, 110, 400, 55, 65),
    repeatSetDist(6, 200, 120, 127, 200, 40, 55),
  ]),
  mainTrackOpener4x400m4x200m: runStructure([
    repeatSetDist(4, 400, 112, 118, 200, 60, 70),
    repeatSetDist(4, 200, 120, 127, 200, 55, 65),
  ]),

  // Phase 4 track sessions
  mainTrack10x400mRelaxed: runStructure([ repeatSetDist(10, 400, 102, 104, 200, 50, 60) ]),
  mainTrack5x2km: runStructure([ repeatSetDist(5, 2000, 105, 107, 400, 55, 65) ]),
  mainTrack3x2km6x400m: runStructure([
    repeatSetDist(3, 2000, 106, 108, 400, 55, 65),
    repeatSetDist(6, 400, 112, 118, 200, 50, 60),
  ]),
  mainTrackOpener3x1km4x200m: runStructure([
    repeatSetDist(3, 1000, 108, 110, 400, 55, 65),
    repeatSetDist(4, 200, 120, 127, 200, 55, 65),
  ]),

  // ═══════════════ THURSDAY FARTLEK STRUCTURES (single entry, NOT split) ═══════════════

  fartlek8x1min: runStructure([
    distStep('Warm up jog', 3000, 65, 75, 'warmUp'),
    repeatSet(8, 60, 99, 103, 120, 70, 80),
    distStep('Cool down', 2000, 65, 75, 'coolDown'),
  ]),
  fartlek6x2min: runStructure([
    distStep('Warm up jog', 3000, 65, 75, 'warmUp'),
    repeatSet(6, 120, 99, 103, 120, 70, 80),
    distStep('Cool down', 2000, 65, 75, 'coolDown'),
  ]),
  fartlek8x3min: runStructure([
    distStep('Warm up jog', 3000, 65, 75, 'warmUp'),
    repeatSet(8, 180, 100, 103, 60, 70, 80),
    distStep('Cool down', 2000, 65, 75, 'coolDown'),
  ]),
  fartlekRecovery6x1min: runStructure([
    distStep('Warm up jog', 3000, 65, 75, 'warmUp'),
    repeatSet(6, 60, 98, 100, 120, 70, 80),
    distStep('Cool down', 2000, 65, 75, 'coolDown'),
  ]),
  fartlek4x4min: runStructure([
    distStep('Warm up jog', 3000, 65, 75, 'warmUp'),
    repeatSet(4, 240, 99, 103, 120, 70, 80),
    repeatSet(4, 60, 107, 112, 60, 70, 80),
    distStep('Cool down', 2000, 65, 75, 'coolDown'),
  ]),
  fartlekKenyan45_15: runStructure([
    distStep('Warm up jog', 3000, 65, 75, 'warmUp'),
    repeatSet(20, 45, 107, 112, 15, 75, 85),
    singleStep('Recovery', 180, 60, 70, 'rest'),
    repeatSet(5, 120, 99, 103, 60, 70, 80),
    distStep('Cool down', 2000, 65, 75, 'coolDown'),
  ]),
  fartlekCanovaMultiPace: runStructure([
    distStep('Warm up jog', 3000, 65, 75, 'warmUp'),
    distStep('2km threshold', 2000, 95, 98, 'active'),
    distStep('1km 5K pace', 1000, 107, 110, 'active'),
    distStep('2km threshold', 2000, 95, 98, 'active'),
    distStep('1km 5K pace', 1000, 107, 110, 'active'),
    distStep('1km threshold', 1000, 98, 100, 'active'),
    distStep('Cool down', 2000, 65, 75, 'coolDown'),
  ]),
  fartlek10kSpecific: runStructure([
    distStep('Warm up jog', 3000, 65, 75, 'warmUp'),
    singleStep('5min @ 10K pace', 300, 103, 106, 'active'),
    singleStep('2min easy', 120, 70, 80, 'rest'),
    singleStep('5min @ 10K pace', 300, 103, 106, 'active'),
    singleStep('2min easy', 120, 70, 80, 'rest'),
    repeatSet(8, 45, 115, 120, 75, 70, 80),
    distStep('Cool down', 2000, 65, 75, 'coolDown'),
  ]),
  fartlekPyramid: runStructure([
    distStep('Warm up jog', 3000, 65, 75, 'warmUp'),
    singleStep('1min hard', 60, 107, 112, 'active'),
    singleStep('1min easy', 60, 70, 80, 'rest'),
    singleStep('2min hard', 120, 107, 112, 'active'),
    singleStep('2min easy', 120, 70, 80, 'rest'),
    singleStep('3min hard', 180, 107, 112, 'active'),
    singleStep('3min easy', 180, 70, 80, 'rest'),
    singleStep('4min hard', 240, 107, 112, 'active'),
    singleStep('4min easy', 240, 70, 80, 'rest'),
    singleStep('3min hard', 180, 107, 112, 'active'),
    singleStep('3min easy', 180, 70, 80, 'rest'),
    singleStep('2min hard', 120, 107, 112, 'active'),
    singleStep('2min easy', 120, 70, 80, 'rest'),
    singleStep('1min hard', 60, 107, 112, 'active'),
    distStep('Cool down', 2000, 65, 75, 'coolDown'),
  ]),
  fartlek5kRhythm: runStructure([
    distStep('Warm up jog', 3000, 65, 75, 'warmUp'),
    repeatSet(10, 120, 107, 110, 60, 70, 80),
    distStep('Cool down', 2000, 65, 75, 'coolDown'),
  ]),
  fartlek10kRhythm: runStructure([
    distStep('Warm up jog', 3000, 65, 75, 'warmUp'),
    repeatSet(6, 180, 103, 106, 120, 70, 80),
    repeatSet(4, 60, 109, 115, 60, 70, 80),
    distStep('Cool down', 2000, 65, 75, 'coolDown'),
  ]),
  fartlek6x2minEasy: runStructure([
    distStep('Warm up jog', 3000, 65, 75, 'warmUp'),
    repeatSet(6, 120, 98, 100, 120, 70, 80),
    distStep('Cool down', 2000, 65, 75, 'coolDown'),
  ]),
  fartlek4x4minReduced: runStructure([
    distStep('Warm up jog', 3000, 65, 75, 'warmUp'),
    repeatSet(4, 240, 103, 106, 120, 70, 80),
    distStep('Cool down', 2000, 65, 75, 'coolDown'),
  ]),

  // ═══════════════ NEW LONG RUN STRUCTURES ═══════════════

  longRun20kmFastFinish: runStructure([
    distStep('Easy', 17000, 72, 80, 'active'),
    distStep('Fast finish', 3000, 88, 93, 'active'),
  ]),
  longRun21kmEasy: runStructure([
    distStep('Easy', 21000, 72, 80, 'active'),
  ]),
  longRun22kmFastFinish: runStructure([
    distStep('Easy', 18000, 72, 80, 'active'),
    distStep('Fast finish', 4000, 88, 93, 'active'),
  ]),
  longRun23kmFastFinish: runStructure([
    distStep('Easy', 19000, 72, 80, 'active'),
    distStep('Fast finish', 4000, 90, 95, 'active'),
  ]),
  longRun24kmStrongFinish: runStructure([
    distStep('Easy', 20000, 72, 80, 'active'),
    distStep('Strong finish', 4000, 90, 95, 'active'),
  ]),
  longRun22kmSteady: runStructure([
    distStep('Steady', 22000, 72, 80, 'active'),
  ]),
  longRun20kmFastFinish4: runStructure([
    distStep('Easy', 16000, 72, 80, 'active'),
    distStep('Fast finish', 4000, 90, 95, 'active'),
  ]),
  longRun18kmEasy: runStructure([
    distStep('Easy', 18000, 72, 80, 'active'),
  ]),
  longRun16kmEasyRecovery: runStructure([
    distStep('Easy', 16000, 72, 80, 'active'),
  ]),
  longRun20kmThresholdFinish: runStructure([
    distStep('Easy', 17000, 72, 80, 'active'),
    distStep('Threshold finish', 3000, 95, 100, 'active'),
  ]),
  longRun22kmRhythmFinish: runStructure([
    distStep('Easy', 17000, 72, 80, 'active'),
    distStep('Rhythm', 5000, 90, 95, 'active'),
  ]),

  // ═══════════════ EASY RUN STRUCTURES ═══════════════

  easyRun5km: runStructure([
    distStep('Easy', 5000, 72, 80, 'active'),
  ]),
  easyRun4km: runStructure([
    distStep('Easy', 4000, 72, 80, 'active'),
  ]),
  easyRun4kmStrides: runStructure([
    distStep('Easy', 3000, 72, 80, 'active'),
    singleStep('Walk 2min transition', 120, 30, 45, 'rest'),
    {
      type: 'repetition',
      length: { value: 4, unit: 'repetition' },
      steps: [
        { type: 'step', name: 'Stride 80m', length: { value: 80, unit: 'meter' }, targets: [{ minValue: 115, maxValue: 130 }], intensityClass: 'active', openDuration: false },
        { type: 'step', name: 'Walk back', length: { value: 60, unit: 'second' }, targets: [{ minValue: 45, maxValue: 60 }], intensityClass: 'rest', openDuration: false },
      ],
    },
    distStep('Cool down', 300, 60, 70, 'coolDown'),
  ]),

  // Easy 10km recovery (no strides)
  easyRun10kmRecovery: runStructure([
    distStep('Easy', 10000, 72, 80, 'active'),
  ]),
};

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
 * Itay's REAL zones pulled LIVE from TrainingPeaks on 2026-04-05 via
 *   GET /fitness/v1/athletes/3030673/settings  → heartRateZones, powerZones, speedZones
 *
 * He uses the SAME HR set for bike AND run (one cardiovascular engine).
 *
 * CRITICAL DATA POINT: at 4:19/km marathon pace his HR was 160 → Z3 Tempo.
 * Marathon pace should sit SOLID Z2 (146-156). He ran his 2:52 goal at Z3 and blew up.
 * Any sustained running above Z3 burns him. Keep long runs Z2 → only intervals go hot.
 */
export const ZONES = {
  // Heart-rate zones (used for BOTH run and bike — Itay has one cardio engine).
  hr: {
    lthr: 180,          // lactate threshold HR (bpm)
    maxHR: 193,
    restingHR: 44,
    z1: { min: 0,   max: 145, label: 'Z1 Recovery' },
    z2: { min: 146, max: 156, label: 'Z2 Aerobic' },
    z3: { min: 157, max: 165, label: 'Z3 Tempo' },
    z4: { min: 166, max: 174, label: 'Z4 SubThreshold' },
    z5a:{ min: 175, max: 180, label: 'Z5a SuperThreshold' },
    z5b:{ min: 181, max: 185, label: 'Z5b Aerobic Capacity' },
    z5c:{ min: 186, max: 200, label: 'Z5c Anaerobic Capacity' },
  },
  // Cycling power zones (Coggan model, calibrated to his 300W FTP in TP).
  power: {
    ftp: 300,
    z1: { min: 0,   max: 167, label: 'Z1 Recovery' },
    z2: { min: 168, max: 227, label: 'Z2 Endurance' },
    z3: { min: 228, max: 272, label: 'Z3 Tempo' },
    z4: { min: 273, max: 317, label: 'Z4 Threshold' },
    z5: { min: 318, max: 362, label: 'Z5 VO2max' },
    z6: { min: 363, max: 2000,label: 'Z6 Anaerobic' },
  },
  // Run pace zones (from TP, threshold 3:45/km).
  pace: {
    thresholdPerKm: '3:45/km',
    z1: '>4:50/km',
    z2: '4:17-4:50/km',
    z3: '3:58-4:17/km',
    z4: '3:45-3:58/km',
    z5a:'3:38-3:45/km',
    z5b:'3:22-3:38/km',
    z5c:'<3:22/km',
  },
};

/** Short human-readable zone summary for Claude's system prompt. */
export function zonesForPrompt(): string {
  return `ITAY'S REAL TP ZONES (use THESE exact numbers, never guess):

HR (same set for run + bike):
  Z1 Recovery     0-145
  Z2 Aerobic      146-156
  Z3 Tempo        157-165
  Z4 SubThreshold 166-174
  Z5a SuperThr.   175-180
  Z5b VO2/AeroCap 181-185
  Z5c Anaerobic   186-200
  LTHR 180 | MaxHR 193 | Resting 44

BIKE POWER (FTP 300W):
  Z1 <167W | Z2 168-227W | Z3 228-272W | Z4 273-317W | Z5 318-362W | Z6 363W+

RUN PACE (threshold 3:45/km):
  Z1 >4:50 | Z2 4:17-4:50 | Z3 3:58-4:17 | Z4 3:45-3:58 | Z5a 3:38-3:45 | Z5b 3:22-3:38 | Z5c <3:22

MARATHON-BLOWUP LESSON: he ran 2:52 goal pace (4:05/km) at HR 160 → Z3 Tempo and blew up.
Marathon sustainable is Z2. Long runs stay Z2. Threshold reps live in Z4. 5K pace = Z5a-b.`;
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
      { date: '2026-04-06', title: 'Easy run', workoutType: 3, description: 'Easy run 6km @ 5:20/km\nHR cap 140bpm. If legs feel heavy, cut to 4km.', distancePlanned: 6000, totalTimePlanned: 0.53, structure: STRUCTURES.easyRun6km },
      { date: '2026-04-07', title: 'AM Easy bike', workoutType: 2, description: 'Easy spin 45min Z1-Z2\nCadence focus: 85-90rpm\nActive recovery before tomorrow\'s run.', totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },
      { date: '2026-04-07', title: 'PM Strength (light)', workoutType: 9, description: 'Bodyweight strength 30min\n\n- Squats 3x10\n- Lunges 3x8\n- Glute bridges 3x12\n- Plank 3x30sec\n- Bird-dog 3x8/side\n\nLight. Learn the movements. No DOMS.', totalTimePlanned: 0.5 },
      { date: '2026-04-08', title: 'Easy run + strides', workoutType: 3, description: 'Easy run 6km @ 5:15/km\n+ 4x100m strides (build to 90%, full recovery walk)\nStrides should feel fast but relaxed, NOT sprinting.', distancePlanned: 6000, totalTimePlanned: 0.58, structure: STRUCTURES.easyRunStrides6km },
      { date: '2026-04-09', title: 'Bike endurance', workoutType: 2, description: 'Endurance ride 75-90min Z2\nOutdoor or Zwift. Steady effort, conversational pace.', totalTimePlanned: 1.25, structure: STRUCTURES.bikeEndurance90 },
      { date: '2026-04-10', title: 'Yoga / Mobility', workoutType: 100, description: 'Yoga / Mobility 40min\n- Sun salutations 8min\n- Hip openers 10min\n- Runner lunges 8min\n- Foam roll quads, calves, glutes 10min\n- Savasana 4min', totalTimePlanned: 0.67 },
      { date: '2026-04-11', title: 'Easy run + strides', workoutType: 3, description: 'Easy run 7km @ 5:10/km\n+ 6x100m strides\nLast run of recovery block. Should feel smooth and controlled.', distancePlanned: 7000, totalTimePlanned: 0.63, structure: STRUCTURES.easyRunStrides7km },
      { date: '2026-04-12', title: 'Long easy ride', workoutType: 2, description: 'Long easy ride 2-2.5hrs Z2\nLast 20min can push to Z3 if legs feel good.\nThis is the bridge to base block. Enjoy it.', totalTimePlanned: 2.25, structure: STRUCTURES.longRide150 },
      { date: '2026-04-13', title: 'Rest / Block review', workoutType: 100, description: 'REST DAY\n\nBlock 0 ends today.\n\nBlock review self-check (rate 1-10):\n- Energy level: _\n- Any pain: _\n- Motivation to train hard: _\n\nBridge week starts tomorrow — bike intensity + easy running.', totalTimePlanned: 0 },
    ],
  },
  {
    id: 'block-1-speed-intro',
    number: 1,
    name: 'Introduction to Speed',
    phase: 'base',
    startDate: '2026-04-13',
    endDate: '2026-05-10',
    stimulus: 'First track sessions ever. Introduce 400m and 800m reps at sub-LTP to LTP pace. Thursday fartlek as continuous run quality session. Long runs with fast finishes.',
    goals: [
      'Learn track: 400m reps (88-90sec), progressing to 86sec by week 2',
      '800m reps introduced week 3 at controlled effort',
      'Thursday fartlek = continuous quality (8-12km), NOT intervals',
      'Long runs 20-22km with fast finish inserts',
      'Bike Mon/Fri/Sun fills aerobic volume without impact',
      'Gym Sunday for strength + explosive power',
    ],
    successMetrics: [
      '10×400m @ 88-90sec smooth with HR recovering between reps',
      '6×800m @ 2:56-3:00 controlled, negative split the set',
      'Long run fast finishes at 4:15-4:20/km without HR drift above 165',
      'All easy runs HR <150 at 5:00-5:10/km',
    ],
    weekPattern: 'Mon bike | Tue TRACK (3 entries: WU/MAIN/CD) | Wed easy+strides | Thu FARTLEK (1 entry) | Fri bike/OFF | Sat long run | Sun gym+bike',
    restrictions: [
      'Week 4 is recovery — lighter track, shorter fartlek, easy long run',
      'Track sessions ALWAYS split into 3 TP entries (WU/MAIN/CD)',
      'Fartlek is ALWAYS a single continuous run entry',
      'HR cap on long run easy portion: 160',
    ],
    sessions: [
      // ============ WEEK 1 (Apr 13-19) — First track session ever ============
      { date: '2026-04-13', title: 'Easy bike 60min Z2', workoutType: 2, description: `Easy bike 60min Z2\n168-227W | HR 146-156 | Cadence 85-90rpm\nFirst bike of Block 1. Steady aerobic spin.`, totalTimePlanned: 1.0, structure: STRUCTURES.easyBike60 },
      { date: '2026-04-14', title: 'TRACK WU', workoutType: 3, description: `WARM-UP (25-30min)
━━━━━━━━━━━━━━━━━━━━━━━━
  * 3km easy jog 5:30-6:00/km (HR <145)
  * Dynamic drills 5min: leg swings, A-skips, B-skips, high knees, butt kicks, carioca
  * 2min walk break
  * 5x 100m progressive strides @ 3:30-4:00/km (90s walk back between)
  * 2min settle before main set

Road shoes. Easy jog to the track.`, distancePlanned: 3500, totalTimePlanned: 0.3, structure: STRUCTURES.keyWarmup },
      { date: '2026-04-14', title: 'TRACK MAIN: 10x400m @ 88-90sec', workoutType: 3, description: `MAIN SET -- 10x 400m (FIRST TRACK SESSION EVER)
━━━━━━━━━━━━━━━━━━━━━━━━
  * Target pace: 3:40/km (99-101% of LTP) -- 88-90 sec per 400m
  * HR target: 165-172 bpm (Z4) by rep 5-10
  * Recovery: 90sec jog between reps (200m)
  * Effort: 7/10 -- controlled, learning track rhythm
  * Total quality: 4km at pace + 2km jog recovery
  * THIS IS YOUR FIRST TRACK SESSION. Feel the surface. Find your rhythm.
  * Run relaxed. Tall posture. Quick feet. Breathe out hard.

BAILOUT: If HR drifts above 178 OR pace slows by 3+ sec/km on 2 consecutive reps, STOP and jog home easy. Quality over quantity.

Track shoes/racing flats.`, distancePlanned: 4000, totalTimePlanned: 0.35, tssPlanned: 55, structure: STRUCTURES.mainTrack10x400mIntro },
      { date: '2026-04-14', title: 'TRACK CD', workoutType: 3, description: `COOL-DOWN (10-12min)
━━━━━━━━━━━━━━━━━━━━━━━━
  * 2km easy jog 5:30+/km
  * 3min walk + stretch: hamstrings, calves, hips

Back in road shoes.`, distancePlanned: 2000, totalTimePlanned: 0.2, structure: STRUCTURES.keyCooldown },
      { date: '2026-04-15', title: 'Easy 7km + strides', workoutType: 3, description: `Easy run 7km + 4x100m strides
Pace: 5:00-5:10/km | HR <150 | Max 40min
Strides: 4x100m @ 3:30-3:45/km with walk-back recovery.
Keeps leg turnover fresh between Tue track and Thu fartlek.`, distancePlanned: 7000, totalTimePlanned: 0.65, structure: STRUCTURES.easyRunStrides7km },
      { date: '2026-04-16', title: 'Fartlek 10km', workoutType: 3, description: `FARTLEK -- 10km continuous run
━━━━━━━━━━━━━━━━━━━━━━━━
  * 3km warm-up jog @ 5:00-5:15/km
  * 8x (1min hard @ 3:40/km / 2min easy @ 5:00/km)
  * 2km cool-down jog
  * Total: ~10km in ~50min
  * Hard efforts = sub-LTP, finding the gear
  * Easy efforts = truly easy, HR drops before next rep
  * This is a CONTINUOUS run -- no stopping, no walking
  * First fartlek of the plan. Feel-based, not GPS-chasing.`, distancePlanned: 10000, totalTimePlanned: 0.83, structure: STRUCTURES.fartlek8x1min },
      { date: '2026-04-17', title: 'Easy bike 45min', workoutType: 2, description: `Easy bike 45min Z1-Z2\n150-200W | HR <150 | Cadence 85-90rpm\nActive recovery. Keep it smooth and short.`, totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },
      { date: '2026-04-18', title: 'Long run 20km', workoutType: 3, description: `LONG RUN -- 20km WITH FAST FINISH
━━━━━━━━━━━━━━━━━━━━━━━━
SEGMENT 1 -- km 1-17 (EASY)
  * Pace: 4:45-5:00/km (Z2)
  * HR: <160 -- HARD CAP
  * RPE 4/10 -- fully conversational

SEGMENT 2 -- km 18-20 (FAST FINISH)
  * Pace: 4:20/km (~88-93% of LTP)
  * HR: 155-165 (Z2 high to Z3)
  * RPE 6/10 -- comfortably hard

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 20km | ~1h40
If HR creeps above 160 in the easy portion, SLOW DOWN.
The fast finish should feel like shifting gears, not grinding.`, distancePlanned: 20000, totalTimePlanned: 1.67, tssPlanned: 110, structure: STRUCTURES.longRun20kmFastFinish },
      { date: '2026-04-19', title: 'Gym', workoutType: 9, description: `Gym 45min -- Strength + explosive
━━━━━━━━━━━━━━━━━━━━━━━━
  * Back squats 3x5 (build to ~75% 1RM)
  * Romanian deadlifts 3x8
  * Box jumps 3x5
  * Single-leg calf raises 3x12
  * Plank 3x45sec
  * Copenhagen plank 3x20sec/side
  * Core: dead bug 3x8/side

First gym session of the block. Learn the movements, find working weights.`, totalTimePlanned: 0.75 },
      { date: '2026-04-19', title: 'Easy bike 45min', workoutType: 2, description: `Easy bike 45min Z1-Z2\n150-200W | HR <150\nPost-gym active recovery spin. Keep it smooth.`, totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },

      // ============ WEEK 2 (Apr 20-26) — Faster 400s ============
      { date: '2026-04-20', title: 'Easy bike 60min Z2', workoutType: 2, description: `Easy bike 60min Z2\n168-227W | HR 146-156 | Cadence 85-90rpm\nSteady aerobic spin. Recovery day before track.`, totalTimePlanned: 1.0, structure: STRUCTURES.easyBike60 },
      { date: '2026-04-21', title: 'TRACK WU', workoutType: 3, description: `WARM-UP (25-30min)
━━━━━━━━━━━━━━━━━━━━━━━━
  * 3km easy jog 5:30-6:00/km (HR <145)
  * Dynamic drills 5min
  * 5x 100m progressive strides (90s walk back)
  * 2min settle

Road shoes. Easy jog to the track.`, distancePlanned: 3500, totalTimePlanned: 0.3, structure: STRUCTURES.keyWarmup },
      { date: '2026-04-21', title: 'TRACK MAIN: 12x400m @ 86-88sec', workoutType: 3, description: `MAIN SET -- 12x 400m (FASTER 400s)
━━━━━━━━━━━━━━━━━━━━━━━━
  * Target pace: 3:36/km (102-104%) -- 86-88 sec per 400m
  * HR target: 168-175 bpm (Z4-Z5a) by rep 5-12
  * Recovery: 90sec jog (200m) between reps
  * Effort: 7.5/10 -- stronger than last week, still controlled
  * Total quality: 4.8km at pace
  * Progression from week 1: same format, faster pace, +2 reps
  * Negative split: reps 9-12 should match reps 1-4

BAILOUT: If HR drifts above 180 OR pace slows by 3+ sec/km on 2 consecutive reps, STOP. Quality over quantity.

Track shoes/racing flats.`, distancePlanned: 4800, totalTimePlanned: 0.4, tssPlanned: 65, structure: STRUCTURES.mainTrack12x400m },
      { date: '2026-04-21', title: 'TRACK CD', workoutType: 3, description: `COOL-DOWN (10-12min)
━━━━━━━━━━━━━━━━━━━━━━━━
  * 2km easy jog 5:30+/km
  * 3min walk + stretch

Back in road shoes.`, distancePlanned: 2000, totalTimePlanned: 0.2, structure: STRUCTURES.keyCooldown },
      { date: '2026-04-22', title: 'Easy 7km + strides', workoutType: 3, description: `Easy run 7km + 4x100m strides\nPace: 5:00-5:10/km | HR <150 | Max 40min\nStrides: 4x100m with walk-back.`, distancePlanned: 7000, totalTimePlanned: 0.65, structure: STRUCTURES.easyRunStrides7km },
      { date: '2026-04-23', title: 'Fartlek 11km', workoutType: 3, description: `FARTLEK -- 11km continuous run
━━━━━━━━━━━━━━━━━━━━━━━━
  * 3km warm-up jog @ 5:00-5:15/km
  * 6x (2min hard @ 3:40/km / 2min easy @ 5:00/km)
  * 2km cool-down jog
  * Total: ~11km in ~55min
  * Longer hard efforts than week 1 -- building time at speed
  * Keep easy truly easy. HR should drop before next surge.
  * Continuous run. No stopping.`, distancePlanned: 11000, totalTimePlanned: 0.92, structure: STRUCTURES.fartlek6x2min },
      { date: '2026-04-24', title: 'Easy bike 45min', workoutType: 2, description: `Easy bike 45min Z1-Z2\n150-200W | HR <150\nPre-long-run recovery spin.`, totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },
      { date: '2026-04-25', title: 'Long run 21km', workoutType: 3, description: `LONG RUN -- 21km WITH FAST FINISH
━━━━━━━━━━━━━━━━━━━━━━━━
SEGMENT 1 -- km 1-18 (EASY)
  * Pace: 4:40-4:50/km (Z2)
  * HR: <160

SEGMENT 2 -- km 19-21 (FAST FINISH)
  * Pace: 4:15/km (~88-93%)
  * HR: 155-165

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 21km | ~1h42
Progression from week 1: +1km. Same structure.`, distancePlanned: 21000, totalTimePlanned: 1.7, tssPlanned: 115, structure: STRUCTURES.longRun21kmEasy },
      { date: '2026-04-26', title: 'Gym', workoutType: 9, description: `Gym 45min -- Strength + explosive
━━━━━━━━━━━━━━━━━━━━━━━━
  * Back squats 3x5 (add 2.5-5kg vs week 1)
  * Romanian deadlifts 3x8
  * Bounding 3x6 (short, explosive)
  * Box jumps 3x5
  * Plank 3x45sec
  * Side plank 3x30sec/side
  * Dead bug 3x10/side

Progress the load from last week.`, totalTimePlanned: 0.75 },
      { date: '2026-04-26', title: 'Easy bike 45min', workoutType: 2, description: `Easy bike 45min Z1-Z2\n150-200W | HR <150\nPost-gym recovery spin.`, totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },

      // ============ WEEK 3 (Apr 27 - May 3) — Introduce 800m ============
      { date: '2026-04-27', title: 'Bike endurance 75min Z2', workoutType: 2, description: `Endurance ride 75min Z2\n168-227W | HR 146-156 | 85-90rpm\nLonger bike this week. Building aerobic volume.`, totalTimePlanned: 1.25, structure: STRUCTURES.bikeEndurance75 },
      { date: '2026-04-28', title: 'TRACK WU', workoutType: 3, description: `WARM-UP (25-30min)
━━━━━━━━━━━━━━━━━━━━━━━━
  * 3km easy jog 5:30-6:00/km (HR <145)
  * Dynamic drills 5min
  * 5x 100m progressive strides (90s walk back)
  * 2min settle

Road shoes. Easy jog to the track.`, distancePlanned: 3500, totalTimePlanned: 0.3, structure: STRUCTURES.keyWarmup },
      { date: '2026-04-28', title: 'TRACK MAIN: 6x800m @ 2:56-3:00', workoutType: 3, description: `MAIN SET -- 6x 800m (FIRST 800m REPS)
━━━━━━━━━━━━━━━━━━━━━━━━
  * Target pace: 3:40/km (99-101%) -- 2:56-3:00 per 800m
  * HR target: 168-175 bpm (Z4-Z5a) by rep 3-6
  * Recovery: 2min jog (200m) between reps
  * Effort: 7.5/10 -- controlled, learning the 800m rhythm
  * Total quality: 4.8km at pace
  * NEW STIMULUS: longer reps. The 800m forces you to settle into pace.
  * First 200m of each rep = find the rhythm. Last 200m = hold it.
  * Negative split the set if possible.

BAILOUT: If HR drifts above 180 OR pace slows by 3+ sec/km on 2 consecutive reps, STOP. Quality over quantity.

Track shoes/racing flats.`, distancePlanned: 4800, totalTimePlanned: 0.4, tssPlanned: 65, structure: STRUCTURES.mainTrack6x800mIntro },
      { date: '2026-04-28', title: 'TRACK CD', workoutType: 3, description: `COOL-DOWN (10-12min)
━━━━━━━━━━━━━━━━━━━━━━━━
  * 2km easy jog 5:30+/km
  * 3min walk + stretch

Back in road shoes.`, distancePlanned: 2000, totalTimePlanned: 0.2, structure: STRUCTURES.keyCooldown },
      { date: '2026-04-29', title: 'Easy 7km + strides', workoutType: 3, description: `Easy run 7km + 4x100m strides\nPace: 5:00-5:10/km | HR <150 | Max 40min\nStrides: 4x100m with walk-back.`, distancePlanned: 7000, totalTimePlanned: 0.65, structure: STRUCTURES.easyRunStrides7km },
      { date: '2026-04-30', title: 'Fartlek 11.5km', workoutType: 3, description: `FARTLEK -- 11.5km continuous run
━━━━━━━━━━━━━━━━━━━━━━━━
  * 3km warm-up jog @ 5:00-5:15/km
  * 8x (3min hard @ 3:42/km / 1min easy jog)
  * 2km cool-down jog
  * Total: ~11.5km in ~55min
  * Longer hard efforts (3min) with shorter recovery (1min)
  * Hard = slightly slower than LTP. Aerobic, not anaerobic.
  * The 1min recovery means you never fully recover -- building fatigue resistance.
  * Continuous. No stopping.`, distancePlanned: 11500, totalTimePlanned: 0.92, structure: STRUCTURES.fartlek8x3min },
      { date: '2026-05-01', title: 'Easy bike 45min', workoutType: 2, description: `Easy bike 45min Z1-Z2\n150-200W | HR <150\nPre-long-run day. Keep it short and easy.`, totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },
      { date: '2026-05-02', title: 'Long run 22km', workoutType: 3, description: `LONG RUN -- 22km WITH FAST FINISH
━━━━━━━━━━━━━━━━━━━━━━━━
SEGMENT 1 -- km 1-18 (EASY)
  * Pace: 4:40/km (Z2)
  * HR: <160

SEGMENT 2 -- km 19-22 (FAST FINISH)
  * Pace: 4:15/km (~88-93%)
  * HR: 155-165

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 22km | ~1h47
Biggest long run of Block 1. Progressive overload from weeks 1-2.`, distancePlanned: 22000, totalTimePlanned: 1.78, tssPlanned: 120, structure: STRUCTURES.longRun22kmFastFinish },
      { date: '2026-05-03', title: 'Gym', workoutType: 9, description: `Gym 45min -- Peak strength week
━━━━━━━━━━━━━━━━━━━━━━━━
  * Front squats 3x5 (heaviest yet)
  * Romanian deadlifts 3x6
  * Depth jumps 3x5
  * Box jumps 3x5
  * Plank 3x50sec
  * Pallof press 3x10/side

Peak gym session of the block. Next week is recovery.`, totalTimePlanned: 0.75 },
      { date: '2026-05-03', title: 'Easy bike 45min', workoutType: 2, description: `Easy bike 45min Z1-Z2\n150-200W | HR <150\nPost-gym recovery spin.`, totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },

      // ============ WEEK 4 (May 4-10) — RECOVERY + FIRST TEST ============
      { date: '2026-05-04', title: 'Easy bike 45min', workoutType: 2, description: `Easy bike 45min Z1\n<167W | HR <145\nRecovery week. Easy spin. Let the body absorb 3 weeks of work.`, totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },
      { date: '2026-05-05', title: 'TRACK WU', workoutType: 3, description: `WARM-UP (25-30min)
━━━━━━━━━━━━━━━━━━━━━━━━
  * 3km easy jog 5:30-6:00/km (HR <145)
  * Dynamic drills 5min
  * 5x 100m progressive strides (90s walk back)
  * 2min settle

Road shoes. Recovery week -- lighter session today.`, distancePlanned: 3500, totalTimePlanned: 0.3, structure: STRUCTURES.keyWarmup },
      { date: '2026-05-05', title: 'TRACK MAIN: 8x400m + 4x200m (recovery)', workoutType: 3, description: `MAIN SET -- 8x400m + 4x200m (RECOVERY WEEK -- LIGHTER)
━━━━━━━━━━━━━━━━━━━━━━━━
SET 1: 8x 400m
  * Target pace: 3:36/km (102-104%) -- 86sec per 400m
  * Recovery: 90sec jog (200m) between reps

SET 2: 4x 200m
  * Target pace: 3:15/km (112-118%) -- 40-42sec per 200m
  * Recovery: 200m walk/jog between reps

  * Total quality: ~4km. Lighter session. Recovery week.
  * Run smooth and sharp, NOT hard. Leave feeling fast.

BAILOUT: If anything feels heavy, stop early. Recovery week = protect the tank.`, distancePlanned: 4000, totalTimePlanned: 0.35, tssPlanned: 50, structure: STRUCTURES.mainTrack8x400m4x200m },
      { date: '2026-05-05', title: 'TRACK CD', workoutType: 3, description: `COOL-DOWN (10-12min)
━━━━━━━━━━━━━━━━━━━━━━━━
  * 2km easy jog 5:30+/km
  * 3min walk + stretch

Back in road shoes.`, distancePlanned: 2000, totalTimePlanned: 0.2, structure: STRUCTURES.keyCooldown },
      { date: '2026-05-06', title: 'Easy 5km', workoutType: 3, description: `Easy run 5km\nPace: 5:10-5:20/km | HR <150\nShort recovery run. Just movement. No strides today.`, distancePlanned: 5000, totalTimePlanned: 0.43, structure: STRUCTURES.easyRun5km },
      { date: '2026-05-07', title: 'Fartlek 8km (easy)', workoutType: 3, description: `FARTLEK -- 8km easy (RECOVERY WEEK)
━━━━━━━━━━━━━━━━━━━━━━━━
  * 3km warm-up jog @ 5:00-5:15/km
  * 6x (1min hard @ 3:45/km / 2min easy)
  * 2km cool-down jog
  * Total: ~8km in ~40min
  * Recovery week fartlek. Shorter, easier. Keep the pattern but reduce load.
  * Hard efforts should feel comfortable, not straining.`, distancePlanned: 8000, totalTimePlanned: 0.67, structure: STRUCTURES.fartlekRecovery6x1min },
      { date: '2026-05-08', title: 'OFF', workoutType: 100, description: `REST DAY\n\nComplete rest. Recovery week. Sleep well. Hydrate.`, totalTimePlanned: 0 },
      { date: '2026-05-09', title: 'Long run 16km easy', workoutType: 3, description: `LONG RUN -- 16km PURE EASY (RECOVERY)
━━━━━━━━━━━━━━━━━━━━━━━━
  * Pace: 4:50/km (Z2)
  * HR: <150 -- HARD CAP
  * RPE 3/10 -- conversational, relaxed
  * No fast finish. No inserts. Pure easy.

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 16km | ~1h17
Recovery long run. If HR drifts above 150, walk.`, distancePlanned: 16000, totalTimePlanned: 1.28, tssPlanned: 75, structure: STRUCTURES.longRun16kmEasyRecovery },
      { date: '2026-05-10', title: 'Gym (light)', workoutType: 9, description: `Gym 30min -- LIGHT maintenance
━━━━━━━━━━━━━━━━━━━━━━━━
  * Bodyweight squats 2x10
  * Glute bridges 2x12
  * Plank 2x40sec
  * Dead bug 2x8/side

Very light. Recovery week. No DOMS.`, totalTimePlanned: 0.5 },
      { date: '2026-05-10', title: 'Easy bike 45min', workoutType: 2, description: `Easy bike 45min Z1\n<167W | HR <145\nBlock 1 ends. Block 2 starts tomorrow.`, totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },
    ],
  },
  // ═══════════════ BLOCK 2: Building the Engine (May 11 - Jun 7) ═══════════════
  {
    id: 'block-2-building',
    number: 2,
    name: 'Building the Engine',
    phase: 'speed',
    startDate: '2026-05-11',
    endDate: '2026-06-07',
    stimulus: '1km reps begin. 400m reps increase to 16x. Track sessions become race-pace specific. Thursday fartlek adds Kenyan and Canova styles. Long runs reach 24km. Ends with 5K time trial fitness check.',
    goals: [
      '5x1km @ 3:32-3:35 (105-107%) -- first full 1km reps at speed',
      '16x400m @ 3:30-3:35 (105-107%) -- THE volume 400 session',
      '4x1200m + 4x400m mixed session -- peak speed week',
      'Long runs reach 24km with strong finishes',
      '5K time trial Jun 4: fitness check (18:00-18:15 target)',
    ],
    successMetrics: [
      '5x1km @ 3:32-3:35 with HR <180 on last rep',
      '16x400m all within 84-86sec window',
      'Long run 24km completed with 4km at 4:05/km',
      '5K TT result 18:00-18:15 (not peaked, just a check)',
    ],
    weekPattern: 'Mon bike | Tue TRACK (3 entries: WU/MAIN/CD) | Wed easy+strides | Thu FARTLEK (1 entry) | Fri bike/OFF | Sat long run | Sun gym+bike',
    restrictions: [
      'Week 8 is recovery + 5K TT fitness check',
      'Track sessions ALWAYS split into 3 TP entries',
      'Fartlek ALWAYS single continuous run entry',
      '5K TT is a FITNESS CHECK, not peaked -- go out at 3:38, negative split',
    ],
    sessions: [
      // ============ WEEK 5 (May 11-17) — 1km reps begin ============
      { date: '2026-05-11', title: 'Easy bike 60min Z2', workoutType: 2, description: `Easy bike 60min Z2\n168-227W | HR 146-156 | Cadence 85-90rpm\nFirst day of Block 2. Steady aerobic.`, totalTimePlanned: 1.0, structure: STRUCTURES.easyBike60 },
      { date: '2026-05-12', title: 'TRACK WU', workoutType: 3, description: `WARM-UP (25-30min)
━━━━━━━━━━━━━━━━━━━━━━━━
  * 3km easy jog 5:30-6:00/km (HR <145)
  * Dynamic drills 5min
  * 5x 100m progressive strides (90s walk back)
  * 2min settle

Road shoes. Easy jog to the track.`, distancePlanned: 3500, totalTimePlanned: 0.3, structure: STRUCTURES.keyWarmup },
      { date: '2026-05-12', title: 'TRACK MAIN: 5x1km @ 3:32-3:35', workoutType: 3, description: `MAIN SET -- 5x 1km (FIRST 1KM REPS AT SPEED)
━━━━━━━━━━━━━━━━━━━━━━━━
  * Target pace: 3:32-3:35/km (105-107% of LTP)
  * HR target: 172-180 bpm (Z5a) by rep 3-5
  * Recovery: 2:30 jog (400m) between reps
  * Effort: 8/10 -- strong but you could do 1 more
  * Total quality: 5km at speed
  * LANDMARK SESSION: first time holding speed for a full km.
  * Start conservatively (3:35 rep 1), build to 3:32 by rep 5.
  * Negative split the set.

BAILOUT: If HR drifts above 182 OR pace slows by 3+ sec/km on 2 consecutive reps, STOP. Quality over quantity.

Track shoes/racing flats.`, distancePlanned: 5000, totalTimePlanned: 0.4, tssPlanned: 70, structure: STRUCTURES.mainTrack5x1kmSpeed },
      { date: '2026-05-12', title: 'TRACK CD', workoutType: 3, description: `COOL-DOWN (10-12min)
━━━━━━━━━━━━━━━━━━━━━━━━
  * 2km easy jog 5:30+/km
  * 3min walk + stretch

Back in road shoes.`, distancePlanned: 2000, totalTimePlanned: 0.2, structure: STRUCTURES.keyCooldown },
      { date: '2026-05-13', title: 'Easy 7km + strides', workoutType: 3, description: `Easy run 7km + 4x100m strides\nPace: 5:00-5:10/km | HR <150 | Max 40min`, distancePlanned: 7000, totalTimePlanned: 0.65, structure: STRUCTURES.easyRunStrides7km },
      { date: '2026-05-14', title: 'Fartlek 12km (multi-pace)', workoutType: 3, description: `FARTLEK -- 12km multi-pace continuous run
━━━━━━━━━━━━━━━━━━━━━━━━
  * 3km warm-up jog
  * 4x (4min hard @ 3:38/km / 2min easy)
  * 4x (1min fast @ 3:25/km / 1min easy)
  * 2km cool-down jog
  * Total: ~12km in ~58min
  * Two-speed fartlek: longer efforts at threshold, shorter at 5K pace.
  * The 1min fast bursts introduce top-end speed on tired legs.`, distancePlanned: 12000, totalTimePlanned: 0.97, structure: STRUCTURES.fartlek4x4min },
      { date: '2026-05-15', title: 'Easy bike 45min', workoutType: 2, description: `Easy bike 45min Z1-Z2\n150-200W | HR <150`, totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },
      { date: '2026-05-16', title: 'Long run 22km', workoutType: 3, description: `LONG RUN -- 22km WITH FAST FINISH
━━━━━━━━━━━━━━━━━━━━━━━━
SEGMENT 1 -- km 1-18 (EASY)
  * Pace: 4:35/km (Z2) | HR: <160

SEGMENT 2 -- km 19-22 (FAST FINISH)
  * Pace: 4:10/km (~88-93%) | HR: 155-165

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 22km | ~1h45`, distancePlanned: 22000, totalTimePlanned: 1.75, tssPlanned: 120, structure: STRUCTURES.longRun22kmFastFinish },
      { date: '2026-05-17', title: 'Gym', workoutType: 9, description: `Gym 45min -- Strength + explosive
━━━━━━━━━━━━━━━━━━━━━━━━
  * Back squats 3x5 (heavy)
  * Romanian deadlifts 3x8
  * Bounding 3x6
  * Box jumps 3x5
  * Plank 3x45sec
  * Copenhagen plank 3x20sec/side`, totalTimePlanned: 0.75 },
      { date: '2026-05-17', title: 'Easy bike 45min', workoutType: 2, description: `Easy bike 45min Z1-Z2\n150-200W | HR <150\nPost-gym spin.`, totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },

      // ============ WEEK 6 (May 18-24) — 16x400m + Kenyan fartlek ============
      { date: '2026-05-18', title: 'Easy bike 60min Z2', workoutType: 2, description: `Easy bike 60min Z2\n168-227W | HR 146-156`, totalTimePlanned: 1.0, structure: STRUCTURES.easyBike60 },
      { date: '2026-05-19', title: 'TRACK WU', workoutType: 3, description: `WARM-UP (25-30min)
━━━━━━━━━━━━━━━━━━━━━━━━
  * 3km easy jog (HR <145)
  * Dynamic drills 5min
  * 5x 100m strides (90s walk back)
  * 2min settle`, distancePlanned: 3500, totalTimePlanned: 0.3, structure: STRUCTURES.keyWarmup },
      { date: '2026-05-19', title: 'TRACK MAIN: 16x400m @ 84-86sec', workoutType: 3, description: `MAIN SET -- 16x 400m (THE SESSION)
━━━━━━━━━━━━━━━━━━━━━━━━
  * Target pace: 3:30-3:35/km (105-107%) -- 84-86 sec per 400m
  * HR target: 175-182 bpm (Z5a-Z5b) by rep 8-16
  * Recovery: 75sec jog (200m) between reps -- shorter rest than before
  * Effort: 8.5/10 -- THIS is the volume session
  * Total quality: 6.4km at speed
  * 16 reps. THE session that builds 5K race endurance.
  * First 4 = find rhythm. Middle 8 = hold. Last 4 = character.
  * If last 4 are within 2sec of first 4, you've nailed it.

BAILOUT: If HR drifts above 185 OR pace slows by 3+ sec/km on 2 consecutive reps, STOP.

Track shoes/racing flats.`, distancePlanned: 6400, totalTimePlanned: 0.5, tssPlanned: 85, structure: STRUCTURES.mainTrack16x400m },
      { date: '2026-05-19', title: 'TRACK CD', workoutType: 3, description: `COOL-DOWN (10-12min)
━━━━━━━━━━━━━━━━━━━━━━━━
  * 2km easy jog 5:30+/km
  * 3min walk + stretch`, distancePlanned: 2000, totalTimePlanned: 0.2, structure: STRUCTURES.keyCooldown },
      { date: '2026-05-20', title: 'Easy 7km + strides', workoutType: 3, description: `Easy run 7km + 4x100m strides\nPace: 5:00-5:10/km | HR <150`, distancePlanned: 7000, totalTimePlanned: 0.65, structure: STRUCTURES.easyRunStrides7km },
      { date: '2026-05-21', title: 'Fartlek 12km (Kenyan)', workoutType: 3, description: `FARTLEK -- 12km Kenyan style
━━━━━━━━━━━━━━━━━━━━━━━━
  * 3km warm-up jog
  * 20x (45sec hard @ 3:25-3:30/km / 15sec float)
  * 3min recovery jog
  * 5x (2min @ 3:40/km / 1min easy)
  * 2km cool-down jog
  * Total: ~12km
  * KENYAN FARTLEK: very short hard/float ratio builds speed endurance.
  * The 15sec float = keep moving, don't stop. Just back off the gas.
  * Second set (5x2min) is a change of rhythm on tired legs.`, distancePlanned: 12000, totalTimePlanned: 0.97, structure: STRUCTURES.fartlekKenyan45_15 },
      { date: '2026-05-22', title: 'OFF', workoutType: 100, description: `REST DAY\n\nFull rest. Big week. Let the body absorb.`, totalTimePlanned: 0 },
      { date: '2026-05-23', title: 'Long run 23km', workoutType: 3, description: `LONG RUN -- 23km WITH FAST FINISH
━━━━━━━━━━━━━━━━━━━━━━━━
SEGMENT 1 -- km 1-19 (EASY)
  * Pace: 4:35/km (Z2) | HR: <160

SEGMENT 2 -- km 20-23 (FAST FINISH)
  * Pace: 4:05/km (~90-95%) | HR: 158-168

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 23km | ~1h50`, distancePlanned: 23000, totalTimePlanned: 1.83, tssPlanned: 130, structure: STRUCTURES.longRun23kmFastFinish },
      { date: '2026-05-24', title: 'Gym', workoutType: 9, description: `Gym 45min -- Strength + explosive
━━━━━━━━━━━━━━━━━━━━━━━━
  * Front squats 3x5 (heavy)
  * Hip thrusts 3x8
  * Depth jumps 3x5
  * Box jumps 3x5
  * Plank 3x45sec
  * Pallof press 3x10/side`, totalTimePlanned: 0.75 },
      { date: '2026-05-24', title: 'Easy bike 45min', workoutType: 2, description: `Easy bike 45min Z1-Z2\n150-200W | HR <150\nPost-gym spin.`, totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },

      // ============ WEEK 7 (May 25-31) — Peak speed week ============
      { date: '2026-05-25', title: 'Bike endurance 75min Z2', workoutType: 2, description: `Endurance ride 75min Z2\n168-227W | HR 146-156\nLonger bike this week.`, totalTimePlanned: 1.25, structure: STRUCTURES.bikeEndurance75 },
      { date: '2026-05-26', title: 'TRACK WU', workoutType: 3, description: `WARM-UP (25-30min)
━━━━━━━━━━━━━━━━━━━━━━━━
  * 3km easy jog (HR <145)
  * Dynamic drills 5min
  * 5x 100m strides (90s walk back)
  * 2min settle`, distancePlanned: 3500, totalTimePlanned: 0.3, structure: STRUCTURES.keyWarmup },
      { date: '2026-05-26', title: 'TRACK MAIN: 4x1200m + 4x400m', workoutType: 3, description: `MAIN SET -- 4x1200m + 4x400m (PEAK SPEED WEEK)
━━━━━━━━━━━━━━━━━━━━━━━━
SET 1: 4x 1200m
  * Target pace: 3:30-3:32/km (105-107%) -- 4:12-4:14 per 1200m
  * Recovery: 2:30 jog (400m)

SET 2: 4x 400m
  * Target pace: 3:20-3:25/km (109-112%) -- 80-82sec per 400m
  * Recovery: 90sec jog (200m)

  * Total quality: 6.4km
  * MIXED SESSION: 1200m for endurance, 400m for top-end speed.
  * The 400s should feel sharp and fast after the 1200s.
  * Peak session of the block.

BAILOUT: If HR drifts above 185 OR pace collapses, STOP.`, distancePlanned: 6400, totalTimePlanned: 0.5, tssPlanned: 85, structure: STRUCTURES.mainTrack4x1200m4x400m },
      { date: '2026-05-26', title: 'TRACK CD', workoutType: 3, description: `COOL-DOWN (10-12min)
━━━━━━━━━━━━━━━━━━━━━━━━
  * 2km easy jog 5:30+/km
  * 3min walk + stretch`, distancePlanned: 2000, totalTimePlanned: 0.2, structure: STRUCTURES.keyCooldown },
      { date: '2026-05-27', title: 'Easy 7km + strides', workoutType: 3, description: `Easy run 7km + 4x100m strides\nPace: 5:00-5:10/km | HR <150`, distancePlanned: 7000, totalTimePlanned: 0.65, structure: STRUCTURES.easyRunStrides7km },
      { date: '2026-05-28', title: 'Fartlek 13km (Canova multi-pace)', workoutType: 3, description: `FARTLEK -- 13km Canova multi-pace CONTINUOUS
━━━━━━━━━━━━━━━━━━━━━━━━
  * 3km warm-up jog
  * 2km @ 3:50/km (threshold)
  * 1km @ 3:30/km (5K pace)
  * 2km @ 3:50/km (threshold)
  * 1km @ 3:30/km (5K pace)
  * 1km @ 3:45/km (LTP)
  * 2km cool-down jog
  * Total: ~13km | Quality: 7km
  * CANOVA CONTINUOUS: no stopping between pace changes.
  * The pace shifts teach the body to change gears mid-run.
  * This is the most challenging fartlek of the block.`, distancePlanned: 13000, totalTimePlanned: 1.0, structure: STRUCTURES.fartlekCanovaMultiPace },
      { date: '2026-05-29', title: 'OFF', workoutType: 100, description: `REST DAY\n\nPeak week. Rest before Saturday's biggest long run.`, totalTimePlanned: 0 },
      { date: '2026-05-30', title: 'Long run 24km', workoutType: 3, description: `LONG RUN -- 24km WITH STRONG FINISH (BIGGEST OF SEASON)
━━━━━━━━━━━━━━━━━━━━━━━━
SEGMENT 1 -- km 1-20 (EASY)
  * Pace: 4:35/km (Z2) | HR: <160

SEGMENT 2 -- km 21-24 (STRONG FINISH)
  * Pace: 4:05/km (~90-95%) | HR: 158-168

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 24km | ~1h55
BIGGEST LONG RUN OF THE SEASON. Respect the distance.
If HR drifts above 160 before km 20, SLOW DOWN.`, distancePlanned: 24000, totalTimePlanned: 1.92, tssPlanned: 140, structure: STRUCTURES.longRun24kmStrongFinish },
      { date: '2026-05-31', title: 'Gym', workoutType: 9, description: `Gym 45min -- Strength + explosive
━━━━━━━━━━━━━━━━━━━━━━━━
  * Front squats 3x5
  * Hip thrusts 3x8
  * Depth jumps 3x5
  * Broad jumps 3x5
  * Plank 3x45sec
  * Dead bug 3x10/side`, totalTimePlanned: 0.75 },
      { date: '2026-05-31', title: 'Easy bike 45min', workoutType: 2, description: `Easy bike 45min Z1-Z2\n150-200W | HR <150`, totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },

      // ============ WEEK 8 (Jun 1-7) — RECOVERY + 5K TIME TRIAL ============
      { date: '2026-06-01', title: 'Easy bike 45min', workoutType: 2, description: `Easy bike 45min Z1\n<167W | HR <145\nRecovery week. Easy.`, totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },
      { date: '2026-06-02', title: 'TRACK WU', workoutType: 3, description: `WARM-UP (25-30min)
━━━━━━━━━━━━━━━━━━━━━━━━
  * 3km easy jog (HR <145)
  * Dynamic drills 5min
  * 5x 100m strides (90s walk back)
  * 2min settle

Recovery week -- sharp session, not hard.`, distancePlanned: 3500, totalTimePlanned: 0.3, structure: STRUCTURES.keyWarmup },
      { date: '2026-06-02', title: 'TRACK MAIN: 6x400m + 6x200m (sharp)', workoutType: 3, description: `MAIN SET -- 6x400m + 6x200m (RECOVERY WEEK SHARPENER)
━━━━━━━━━━━━━━━━━━━━━━━━
SET 1: 6x 400m
  * Target pace: 3:25-3:30/km (107-109%) -- 82-84sec per 400m
  * Recovery: 90sec jog (200m)

SET 2: 6x 200m
  * Target pace: 3:10-3:15/km (115-120%) -- 38-40sec per 200m
  * Recovery: 200m walk/jog

  * Total quality: 3.6km. Sharp, not fatiguing.
  * Leave feeling FAST, not tired. 5K TT on Thursday.

BAILOUT: If anything feels heavy, stop early. Protect the tank.`, distancePlanned: 3600, totalTimePlanned: 0.32, tssPlanned: 45, structure: STRUCTURES.mainTrack6x400m6x200m },
      { date: '2026-06-02', title: 'TRACK CD', workoutType: 3, description: `COOL-DOWN (10-12min)
━━━━━━━━━━━━━━━━━━━━━━━━
  * 2km easy jog 5:30+/km
  * 3min walk + stretch`, distancePlanned: 2000, totalTimePlanned: 0.2, structure: STRUCTURES.keyCooldown },
      { date: '2026-06-03', title: 'Easy 5km', workoutType: 3, description: `Easy run 5km\nPace: 5:15/km | HR <150\nVery easy. Pre-TT day. Just movement.`, distancePlanned: 5000, totalTimePlanned: 0.43, structure: STRUCTURES.easyRun5km },
      { date: '2026-06-04', title: '5K TIME TRIAL (fitness check)', workoutType: 3, description: `5K TIME TRIAL -- FITNESS CHECK (NOT PEAKED)
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP (15min)
  * 2km easy jog + drills + 3x100m at pace

RACE -- 5km
  * Target: 18:00-18:15 (3:36-3:39/km)
  * NOT a peak effort. This is a mid-season check.
  * Go out at 3:38. Negative split if possible.
  * Km 1: 3:38-3:40 -- CONTROLLED
  * Km 2-3: 3:36-3:38 -- settle
  * Km 4-5: 3:34-3:36 -- push if feeling good

COOL-DOWN (10min)
  * Easy jog + walk

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~9km | TSS ~55
This tells us where you are. Not a race. A data point.`, distancePlanned: 5000, totalTimePlanned: 0.5, tssPlanned: 55, structure: STRUCTURES.tt5k },
      { date: '2026-06-05', title: 'OFF', workoutType: 100, description: `REST DAY\n\nPost-TT recovery. Full rest.`, totalTimePlanned: 0 },
      { date: '2026-06-06', title: 'Easy 10km', workoutType: 3, description: `Easy run 10km\nPace: 4:50/km | HR <150\nRecovery from TT. Honest volume.`, distancePlanned: 10000, totalTimePlanned: 0.83, structure: STRUCTURES.easyRun10kmRecovery },
      { date: '2026-06-07', title: 'OFF', workoutType: 100, description: `REST DAY\n\nBlock 2 complete. Block 3 starts tomorrow.\nReflect: how did the 5K TT feel? What pace was sustainable?`, totalTimePlanned: 0 },
    ],
  },
  // ═══════════════ BLOCK 3: Race-Specific Sharpening (Jun 8 - Jul 5) ═══════════════
  {
    id: 'block-3-sharpening',
    number: 3,
    name: 'Race-Specific Sharpening',
    phase: 'speed',
    startDate: '2026-06-08',
    endDate: '2026-07-05',
    stimulus: '5K pace at 1km distance. 20x400m Kipchoge session. 6x800m overspeed. Race model week. 5K TT Jul 4 sub-17:30.',
    goals: [
      '8x200m + 5x1km combo session at 5K pace',
      '20x400m @ 80-82sec -- the definitive speed-endurance session',
      '6x800m + 6x200m -- overspeed training',
      'Opener week sharpeners: 4x400m + 4x200m with full recovery',
      '5K TT Jul 4: sub-17:30 (3:28/3:30/3:30/3:30/3:28 = 17:26)',
    ],
    successMetrics: [
      '20x400m all within 80-82sec window (never slower than 83)',
      '6x800m @ 2:44-2:48 controlled',
      'Opener session feeling sharp and electric',
      '5K TT sub-17:30',
    ],
    weekPattern: 'Mon bike | Tue TRACK (3 entries: WU/MAIN/CD) | Wed easy+strides | Thu FARTLEK (1 entry) | Fri bike/OFF | Sat long run | Sun gym+bike',
    restrictions: [
      'Week 12 is race week -- Tue = opener, Thu = rest/strides, Sat = RACE',
      'No new training stimuli in race week',
      'No gym in race week',
      'Long runs drop to 20km max in this block',
    ],
    sessions: [
      // ============ WEEK 9 (Jun 8-14) — 5K pace at 1km distance ============
      { date: '2026-06-08', title: 'Easy bike 60min Z2', workoutType: 2, description: `Easy bike 60min Z2\n168-227W | HR 146-156\nFirst day of Block 3. Steady aerobic.`, totalTimePlanned: 1.0, structure: STRUCTURES.easyBike60 },
      { date: '2026-06-09', title: 'TRACK WU', workoutType: 3, description: `WARM-UP (25-30min)
━━━━━━━━━━━━━━━━━━━━━━━━
  * 3km easy jog (HR <145)
  * Dynamic drills 5min
  * 5x 100m strides (90s walk back)
  * 2min settle`, distancePlanned: 3500, totalTimePlanned: 0.3, structure: STRUCTURES.keyWarmup },
      { date: '2026-06-09', title: 'TRACK MAIN: 8x200m + 5x1km', workoutType: 3, description: `MAIN SET -- 8x200m + 5x1km (SPEED + ENDURANCE COMBO)
━━━━━━━━━━━━━━━━━━━━━━━━
SET 1: 8x 200m (SPEED PRIMER)
  * Target pace: 3:10-3:15/km (118-125%) -- 38-39sec per 200m
  * Recovery: 60sec walk (200m)
  * Purpose: wake up the CNS, prime fast-twitch fibers

SET 2: 5x 1km (5K PACE)
  * Target pace: 3:28-3:32/km (105-108%)
  * Recovery: 2:30 jog (400m)
  * Purpose: race-specific endurance

  * Total quality: 6.6km
  * The 200s prime the legs. The 1kms are the MAIN work.
  * 5x1km should feel more controlled BECAUSE of the 200m primer.

BAILOUT: If HR drifts above 185 OR pace collapses, STOP.`, distancePlanned: 6600, totalTimePlanned: 0.5, tssPlanned: 80, structure: STRUCTURES.mainTrack8x200m5x1km },
      { date: '2026-06-09', title: 'TRACK CD', workoutType: 3, description: `COOL-DOWN (10-12min)
━━━━━━━━━━━━━━━━━━━━━━━━
  * 2km easy jog 5:30+/km
  * 3min walk + stretch`, distancePlanned: 2000, totalTimePlanned: 0.2, structure: STRUCTURES.keyCooldown },
      { date: '2026-06-10', title: 'Easy 7km + strides', workoutType: 3, description: `Easy run 7km + 4x100m strides\nPace: 5:00-5:10/km | HR <150`, distancePlanned: 7000, totalTimePlanned: 0.65, structure: STRUCTURES.easyRunStrides7km },
      { date: '2026-06-11', title: 'Fartlek 12km (10K-specific)', workoutType: 3, description: `FARTLEK -- 12km 10K-specific
━━━━━━━━━━━━━━━━━━━━━━━━
  * 3km warm-up jog
  * 2x (5min @ 3:36/km + 2min easy)
  * 8x (45sec @ 3:15/km + 75sec easy)
  * 2km cool-down jog
  * Total: ~12km
  * Two-part fartlek: longer 10K-pace efforts + short overspeed bursts.
  * The 45sec bursts at 3:15 develop top-end speed on fatigued legs.`, distancePlanned: 12000, totalTimePlanned: 0.97, structure: STRUCTURES.fartlek10kSpecific },
      { date: '2026-06-12', title: 'OFF', workoutType: 100, description: `REST DAY`, totalTimePlanned: 0 },
      { date: '2026-06-13', title: 'Long run 20km', workoutType: 3, description: `LONG RUN -- 20km WITH FAST FINISH
━━━━━━━━━━━━━━━━━━━━━━━━
SEGMENT 1 -- km 1-16 (EASY)
  * Pace: 4:30/km (Z2) | HR: <160

SEGMENT 2 -- km 17-20 (FAST FINISH)
  * Pace: 4:00/km (~90-95%) | HR: 158-168

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 20km | ~1h35`, distancePlanned: 20000, totalTimePlanned: 1.58, tssPlanned: 115, structure: STRUCTURES.longRun20kmFastFinish4 },
      { date: '2026-06-14', title: 'Gym', workoutType: 9, description: `Gym 45min -- Strength + explosive
━━━━━━━━━━━━━━━━━━━━━━━━
  * Front squats 3x5
  * Hip thrusts 3x8
  * Depth jumps 3x5
  * Box jumps 3x5
  * Plank 3x45sec
  * Pallof press 3x10/side`, totalTimePlanned: 0.75 },
      { date: '2026-06-14', title: 'Easy bike 45min', workoutType: 2, description: `Easy bike 45min Z1-Z2\n150-200W | HR <150`, totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },

      // ============ WEEK 10 (Jun 15-21) — THE 20x400m session ============
      { date: '2026-06-15', title: 'Easy bike 60min Z2', workoutType: 2, description: `Easy bike 60min Z2\n168-227W | HR 146-156`, totalTimePlanned: 1.0, structure: STRUCTURES.easyBike60 },
      { date: '2026-06-16', title: 'TRACK WU', workoutType: 3, description: `WARM-UP (25-30min)
━━━━━━━━━━━━━━━━━━━━━━━━
  * 3km easy jog (HR <145)
  * Dynamic drills 5min
  * 5x 100m strides (90s walk back)
  * 2min settle

THE session today. Be ready.`, distancePlanned: 3500, totalTimePlanned: 0.3, structure: STRUCTURES.keyWarmup },
      { date: '2026-06-16', title: 'TRACK MAIN: 20x400m @ 80-82sec', workoutType: 3, description: `MAIN SET -- 20x 400m (KIPCHOGE SESSION)
━━━━━━━━━━━━━━━━━━━━━━━━
  * Target pace: 3:20-3:25/km (109-112%) -- 80-82sec per 400m
  * HR target: 178-185 bpm (Z5a-Z5b) by rep 10-20
  * Recovery: 60-75sec jog (200m) -- SHORT rest
  * Effort: 9/10 -- this is THE session
  * Total quality: 8km at speed
  * 20 REPS. This is the definitive 5K speed-endurance session.
  * First 5 = easy. Middle 10 = discipline. Last 5 = character.
  * If all 20 are within 80-82sec, you are READY for sub-17:30.
  * This is the session Kipchoge does. Respect it.

BAILOUT: If HR drifts above 188 OR pace slows past 85sec on 2 consecutive reps, STOP.

Track shoes.`, distancePlanned: 8000, totalTimePlanned: 0.65, tssPlanned: 100, structure: STRUCTURES.mainTrack20x400m },
      { date: '2026-06-16', title: 'TRACK CD', workoutType: 3, description: `COOL-DOWN (10-12min)
━━━━━━━━━━━━━━━━━━━━���━━━
  * 2km easy jog 5:30+/km
  * 3min walk + stretch`, distancePlanned: 2000, totalTimePlanned: 0.2, structure: STRUCTURES.keyCooldown },
      { date: '2026-06-17', title: 'Easy 7km + strides', workoutType: 3, description: `Easy run 7km + 4x100m strides\nPace: 5:00-5:10/km | HR <150`, distancePlanned: 7000, totalTimePlanned: 0.65, structure: STRUCTURES.easyRunStrides7km },
      { date: '2026-06-18', title: 'Fartlek 13km (pyramid)', workoutType: 3, description: `FARTLEK -- 13km pyramid (race rhythm)
━━━━━━━━━━━━━━━━━━━━━━━━
  * 3km warm-up jog
  * Pyramid: 1-2-3-4-3-2-1 min hard with equal rest
  * Hard = 3:30/km (5K pace)
  * Easy = 4:30/km (recovery)
  * 2km cool-down jog
  * Total: ~13km
  * Pyramid builds then fades -- teaches pacing and gear changes.
  * The 4min hard rep is the peak. Everything after is managing fatigue.`, distancePlanned: 13000, totalTimePlanned: 1.0, structure: STRUCTURES.fartlekPyramid },
      { date: '2026-06-19', title: 'OFF', workoutType: 100, description: `REST DAY`, totalTimePlanned: 0 },
      { date: '2026-06-20', title: 'Long run 22km steady', workoutType: 3, description: `LONG RUN -- 22km STEADY (NO FAST FINISH)
━━━━━━━━━━━━━━━━━━━━━━━━
  * Pace: 4:30/km (Z2) | HR: <160
  * RPE 4/10 -- honest aerobic work
  * No fast finish this week. Honest volume after 20x400m.

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 22km | ~1h39`, distancePlanned: 22000, totalTimePlanned: 1.65, tssPlanned: 115, structure: STRUCTURES.longRun22kmSteady },
      { date: '2026-06-21', title: 'Gym', workoutType: 9, description: `Gym 45min -- Strength + explosive
━━━━━━━━━━━━━━━━━━━━━━━━
  * Front squats 3x5
  * Hip thrusts 3x8
  * Box jumps 3x5
  * Plank 3x45sec
  * Dead bug 3x10/side`, totalTimePlanned: 0.75 },
      { date: '2026-06-21', title: 'Easy bike 45min', workoutType: 2, description: `Easy bike 45min Z1-Z2\n150-200W | HR <150`, totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },

      // ============ WEEK 11 (Jun 22-28) — Race model week ============
      { date: '2026-06-22', title: 'Easy bike 60min Z2', workoutType: 2, description: `Easy bike 60min Z2\n168-227W | HR 146-156\nRace model week starts.`, totalTimePlanned: 1.0, structure: STRUCTURES.easyBike60 },
      { date: '2026-06-23', title: 'TRACK WU', workoutType: 3, description: `WARM-UP (25-30min)
━━━━━━━━━━━━━━━━━━━━━━━━
  * 3km easy jog (HR <145)
  * Dynamic drills 5min
  * 5x 100m strides (90s walk back)
  * 2min settle`, distancePlanned: 3500, totalTimePlanned: 0.3, structure: STRUCTURES.keyWarmup },
      { date: '2026-06-23', title: 'TRACK MAIN: 6x800m + 6x200m', workoutType: 3, description: `MAIN SET -- 6x800m + 6x200m (RACE MODEL)
━━━━━━━━━━━━━━━━━━━━━━━━
SET 1: 6x 800m
  * Target pace: 3:25-3:30/km (107-110%) -- 2:44-2:48 per 800m
  * Recovery: 2min jog (400m)

SET 2: 6x 200m
  * Target pace: 3:05-3:10/km (120-127%) -- 37-38sec per 200m
  * Recovery: 60sec walk/jog (200m)

  * Total quality: 6km
  * Race model: 800s at just-above race pace, 200s for top speed.
  * The 200s should feel FAST and sharp. Neuromuscular priming.

BAILOUT: If HR drifts above 185 OR pace collapses, STOP.`, distancePlanned: 6000, totalTimePlanned: 0.47, tssPlanned: 80, structure: STRUCTURES.mainTrack6x800m6x200m },
      { date: '2026-06-23', title: 'TRACK CD', workoutType: 3, description: `COOL-DOWN (10-12min)
━━━━━━━━━━━━━━━━━━━━━━━━
  * 2km easy jog 5:30+/km
  * 3min walk + stretch`, distancePlanned: 2000, totalTimePlanned: 0.2, structure: STRUCTURES.keyCooldown },
      { date: '2026-06-24', title: 'Easy 7km + strides', workoutType: 3, description: `Easy run 7km + 4x100m strides\nPace: 5:00-5:10/km | HR <150`, distancePlanned: 7000, totalTimePlanned: 0.65, structure: STRUCTURES.easyRunStrides7km },
      { date: '2026-06-25', title: 'Fartlek 12km (5K rhythm)', workoutType: 3, description: `FARTLEK -- 12km 5K rhythm
━━━━━━━━━━━━━━━━━━━━━━━━
  * 3km warm-up jog
  * 10x (2min @ 3:30/km / 1min @ 4:30/km)
  * CONTINUOUS -- no stopping
  * 2km cool-down jog
  * Total: ~12km
  * Race-specific rhythm. 2min at race pace, 1min float.
  * The 1min recovery is enough to reset, not enough to fully recover.
  * This mimics the rhythm of the 5K race.`, distancePlanned: 12000, totalTimePlanned: 0.97, structure: STRUCTURES.fartlek5kRhythm },
      { date: '2026-06-26', title: 'Easy bike 45min', workoutType: 2, description: `Easy bike 45min Z1-Z2\n150-200W | HR <150\nPre-long-run spin.`, totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },
      { date: '2026-06-27', title: 'Long run 20km', workoutType: 3, description: `LONG RUN -- 20km WITH THRESHOLD FINISH
━━━━━━━━━━━━━━━━━━━━━━━━
SEGMENT 1 -- km 1-17 (EASY)
  * Pace: 4:30/km (Z2) | HR: <160

SEGMENT 2 -- km 18-20 (THRESHOLD FINISH)
  * Pace: 3:55/km (~95-100%) | HR: 165-175

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 20km | ~1h32
Last hard long run before race week. Threshold finish = race prep.`, distancePlanned: 20000, totalTimePlanned: 1.53, tssPlanned: 115, structure: STRUCTURES.longRun20kmThresholdFinish },
      { date: '2026-06-28', title: 'Gym', workoutType: 9, description: `Gym 40min -- Last strength session before race
━━━━━━━━━━━━━━━━━━━━━━━━
  * Front squats 3x5
  * Hip thrusts 3x8
  * Single-leg calf raises 3x12
  * Plank 3x45sec

Last gym before 5K TT. No DOMS allowed.`, totalTimePlanned: 0.67 },
      { date: '2026-06-28', title: 'Easy bike 45min', workoutType: 2, description: `Easy bike 45min Z1-Z2\n150-200W | HR <150`, totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },

      // ============ WEEK 12 (Jun 29 - Jul 5) — 5K RACE WEEK ============
      { date: '2026-06-29', title: 'Easy bike 45min', workoutType: 2, description: `Easy bike 45min Z1\n<167W | HR <145\nRace week. Less is more.`, totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },
      { date: '2026-06-30', title: 'TRACK WU', workoutType: 3, description: `WARM-UP (20-25min)
━━━━━━━━━━━━━━━━━━━━━━━━
  * 3km easy jog (HR <145)
  * Dynamic drills 5min
  * 5x 100m strides (90s walk back)
  * 2min settle

Race week opener. Sharp, not tired.`, distancePlanned: 3500, totalTimePlanned: 0.3, structure: STRUCTURES.keyWarmup },
      { date: '2026-06-30', title: 'TRACK MAIN: 4x400m + 4x200m (opener)', workoutType: 3, description: `MAIN SET -- 4x400m + 4x200m (RACE WEEK OPENER)
━━━━━━━━━━━━━━━━━━━━━━━━
SET 1: 4x 400m
  * Target pace: 3:15-3:20/km (112-118%) -- 78-80sec per 400m
  * Recovery: FULL (200m walk/jog, take your time)

SET 2: 4x 200m
  * Target pace: 3:00-3:05/km (120-127%) -- 36-38sec per 200m
  * Recovery: FULL (200m walk/jog)

  * Total quality: 2.4km. Sharp. Electric.
  * Full recovery between ALL reps. This is NOT a workout.
  * Purpose: neuromuscular priming for Saturday's race.
  * Leave the track feeling FAST, not tired.`, distancePlanned: 2400, totalTimePlanned: 0.25, tssPlanned: 35, structure: STRUCTURES.mainTrackOpener4x400m4x200m },
      { date: '2026-06-30', title: 'TRACK CD', workoutType: 3, description: `COOL-DOWN (10min)
━━━━━━━━━━━━━━━━━━━━━━━━
  * 2km easy jog 5:30+/km
  * Walk + stretch`, distancePlanned: 2000, totalTimePlanned: 0.17, structure: STRUCTURES.keyCooldown },
      { date: '2026-07-01', title: 'Easy 4km + strides', workoutType: 3, description: `Easy 4km + 4x80m strides\nVery short. Legs loose. 5:10-5:20/km.\nStrides at 90%, walk-back recovery.\nNothing more. Trust the training.`, distancePlanned: 4000, totalTimePlanned: 0.35, structure: STRUCTURES.easyRun4kmStrides },
      { date: '2026-07-02', title: 'Rest or 20min easy jog', workoutType: 100, description: `REST or 20min easy jog + 4x100m strides\nIf legs feel heavy: rest.\nIf legs feel good: 20min easy + strides.\nEither way, minimal stress.`, totalTimePlanned: 0.33 },
      { date: '2026-07-03', title: 'REST', workoutType: 100, description: `COMPLETE REST
━━━━━━━━━━━━━━━━━━━━━━━━
Sleep well. Hydrate. Eat well.
No running. No gym. Light walk OK.

Race plan for tomorrow:
  * Km 1: 3:28 -- controlled start
  * Km 2: 3:30 -- settle, rhythm
  * Km 3: 3:30 -- hold form
  * Km 4: 3:30 -- the crucible
  * Km 5: 3:28 -- EVERYTHING
  * = 17:26`, totalTimePlanned: 0 },
      { date: '2026-07-04', title: '5K TIME TRIAL -- sub-17:30', workoutType: 3, description: `5K TIME TRIAL -- TARGET SUB-17:30
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP (15min)
  * 2km easy jog
  * Dynamic drills (5min)
  * 3x100m at race pace

RACE -- 5km
  * Target: 17:26 (3:28/3:30/3:30/3:30/3:28)
  * Km 1: 3:28 -- CONTROLLED. Do NOT go out in 3:20.
  * Km 2-3: 3:30 -- settle, rhythm, breathe
  * Km 4: 3:30 -- the crucible. HOLD FORM.
  * Km 5: 3:28 or faster -- EVERYTHING LEFT

COOL-DOWN (10min)
  * Easy jog + walk

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~9km | TSS ~65
THIS IS THE GOAL. Trust the block. Execute the plan.`, distancePlanned: 5000, totalTimePlanned: 0.5, tssPlanned: 65, structure: STRUCTURES.tt5k },
      { date: '2026-07-05', title: 'Recovery bike 45min', workoutType: 2, description: `Easy recovery ride 45min Z1\n<167W | HR <145\n5K block complete. Spin out the TT legs. Block 4 starts tomorrow.`, totalTimePlanned: 0.75, structure: STRUCTURES.recoveryRide60 },
    ],
  },
  // ═══════════════ BLOCK 4: 10K Campaign (Jul 6 - Aug 1) ═══════════════
  {
    id: 'block-4-10k',
    number: 4,
    name: '10K Campaign',
    phase: 'speed',
    startDate: '2026-07-06',
    endDate: '2026-08-01',
    stimulus: 'Post-5K recovery (1 week), 10K-specific 2km reps (1 week), 10K dress rehearsal (1 week), taper + 10K TT (1 week).',
    goals: [
      'Recover from 5K TT then pivot to 10K pace (3:30-3:35/km)',
      '5x2km @ 3:30-3:35 -- THE 10K session',
      '3x2km + 6x400m dress rehearsal',
      '10K TT Aug 1: sub-36:00 (3:34x8 + 3:32 + 3:28 = 35:52)',
    ],
    successMetrics: [
      '5x2km @ 7:00-7:10 metronomic',
      '3x2km + 6x400m executed with controlled pacing',
      'Opener session feeling electric',
      '10K TT sub-36:00',
    ],
    weekPattern: 'Mon bike/OFF | Tue TRACK (3 entries: WU/MAIN/CD) | Wed easy+strides | Thu FARTLEK (1 entry) | Fri bike/OFF | Sat long run | Sun gym+bike',
    restrictions: [
      'Week 13 is post-5K recovery -- lighter everything',
      'Week 16 is race week -- Tue = opener, Thu = strides only, Sat = RACE',
      'No new training stimuli in race week',
      'No gym in race week',
    ],
    sessions: [
      // ============ WEEK 13 (Jul 6-12) — Post-5K recovery + 10K intro ============
      { date: '2026-07-06', title: 'OFF', workoutType: 100, description: `REST DAY\n\nPost-5K TT recovery. Full rest.`, totalTimePlanned: 0 },
      { date: '2026-07-07', title: 'TRACK WU', workoutType: 3, description: `WARM-UP (25-30min)
━━━━━━━━━━━━━━━━━━━━━━━━
  * 3km easy jog (HR <145)
  * Dynamic drills 5min
  * 5x 100m strides (90s walk back)
  * 2min settle

Post-race recovery week. Relaxed session.`, distancePlanned: 3500, totalTimePlanned: 0.3, structure: STRUCTURES.keyWarmup },
      { date: '2026-07-07', title: 'TRACK MAIN: 10x400m (relaxed)', workoutType: 3, description: `MAIN SET -- 10x 400m (RELAXED POST-RACE)
━━━━━━━━━━━━━━━━━━━━━━━━
  * Target pace: 3:36/km (102-104%) -- 84-86sec per 400m
  * HR target: 165-172 bpm (Z4) -- don't chase higher
  * Recovery: 90sec jog (200m)
  * Effort: 6.5/10 -- loose legs, finding rhythm again
  * Total quality: 4km
  * Post-race recovery. Run smooth and relaxed.
  * NOT a hard session. Shake out the TT legs.

BAILOUT: If legs feel heavy, cut to 6-8 reps. No ego.`, distancePlanned: 4000, totalTimePlanned: 0.35, tssPlanned: 50, structure: STRUCTURES.mainTrack10x400mRelaxed },
      { date: '2026-07-07', title: 'TRACK CD', workoutType: 3, description: `COOL-DOWN (10-12min)
━━━━━━━━━━━━━━━━━━━━━━━━
  * 2km easy jog 5:30+/km
  * 3min walk + stretch`, distancePlanned: 2000, totalTimePlanned: 0.2, structure: STRUCTURES.keyCooldown },
      { date: '2026-07-08', title: 'Easy 6km', workoutType: 3, description: `Easy run 6km\nPace: 5:00/km | HR <150\nPost-race recovery. Just movement.`, distancePlanned: 6000, totalTimePlanned: 0.5, structure: STRUCTURES.easyRun6km },
      { date: '2026-07-09', title: 'Fartlek 11km (easy)', workoutType: 3, description: `FARTLEK -- 11km easy (RECOVERY WEEK)
━━━━━━━━━━━━━━━━━━━━━━━━
  * 3km warm-up jog
  * 6x (2min moderate @ 3:45/km / 2min easy)
  * 2km cool-down jog
  * Total: ~11km
  * Recovery fartlek. Moderate, not hard.
  * Keep the pattern but reduce intensity.`, distancePlanned: 11000, totalTimePlanned: 0.88, structure: STRUCTURES.fartlek6x2minEasy },
      { date: '2026-07-10', title: 'Easy bike 60min', workoutType: 2, description: `Easy bike 60min Z2\n168-227W | HR 146-156`, totalTimePlanned: 1.0, structure: STRUCTURES.easyBike60 },
      { date: '2026-07-11', title: 'Long run 18km easy', workoutType: 3, description: `LONG RUN -- 18km EASY (RECOVERY)
━━━━━━━━━━━━━━━━━━━━━━━━
  * Pace: 4:40/km (Z2) | HR: <155
  * RPE 4/10 -- easy, aerobic, recovery
  * No fast finish. Pure volume.

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 18km | ~1h24`, distancePlanned: 18000, totalTimePlanned: 1.4, tssPlanned: 90, structure: STRUCTURES.longRun18kmEasy },
      { date: '2026-07-12', title: 'Gym', workoutType: 9, description: `Gym 40min -- Strength (light post-race)
━━━━━━━━━━━━━━━━━━━━━━━━
  * Bodyweight squats 3x10
  * Romanian deadlifts 3x8 (moderate)
  * Box jumps 3x5
  * Plank 3x45sec
  * Dead bug 3x8/side

Post-race recovery. Don't push.`, totalTimePlanned: 0.67 },
      { date: '2026-07-12', title: 'Easy bike 45min', workoutType: 2, description: `Easy bike 45min Z1-Z2\n150-200W | HR <150`, totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },

      // ============ WEEK 14 (Jul 13-19) — 10K-specific: 5x2km ============
      { date: '2026-07-13', title: 'Easy bike 60min Z2', workoutType: 2, description: `Easy bike 60min Z2\n168-227W | HR 146-156`, totalTimePlanned: 1.0, structure: STRUCTURES.easyBike60 },
      { date: '2026-07-14', title: 'TRACK WU', workoutType: 3, description: `WARM-UP (25-30min)
━━━━━━━━━━━━━━━━━━━━━━━━
  * 3km easy jog (HR <145)
  * Dynamic drills 5min
  * 5x 100m strides (90s walk back)
  * 2min settle

THE 10K session today. Be ready.`, distancePlanned: 3500, totalTimePlanned: 0.3, structure: STRUCTURES.keyWarmup },
      { date: '2026-07-14', title: 'TRACK MAIN: 5x2km @ 3:30-3:35', workoutType: 3, description: `MAIN SET -- 5x 2km (THE 10K SESSION)
━━━━━━━━━━━━━━━━━━━━━━━━
  * Target pace: 3:30-3:35/km (105-107%) -- 7:00-7:10 per 2km
  * HR target: 172-180 bpm (Z5a) by rep 3-5
  * Recovery: 2:30 jog (400m) between reps
  * Effort: 8/10 -- strong but sustainable for 10km
  * Total quality: 10km at 10K pace
  * THIS IS THE 10K SESSION. 5x2km = total race distance.
  * Metronomic pacing. Each rep within 5sec of target.
  * Negative split: rep 5 should be your fastest.

BAILOUT: If HR drifts above 182 OR pace slows by 3+ sec/km on 2 consecutive reps, STOP.

Track shoes/racing flats.`, distancePlanned: 10000, totalTimePlanned: 0.6, tssPlanned: 90, structure: STRUCTURES.mainTrack5x2km },
      { date: '2026-07-14', title: 'TRACK CD', workoutType: 3, description: `COOL-DOWN (10-12min)
━━━━━━━━━━━━━━━━━━���━━━━━
  * 2km easy jog 5:30+/km
  * 3min walk + stretch`, distancePlanned: 2000, totalTimePlanned: 0.2, structure: STRUCTURES.keyCooldown },
      { date: '2026-07-15', title: 'Easy 7km + strides', workoutType: 3, description: `Easy run 7km + 4x100m strides\nPace: 5:00-5:10/km | HR <150`, distancePlanned: 7000, totalTimePlanned: 0.65, structure: STRUCTURES.easyRunStrides7km },
      { date: '2026-07-16', title: 'Fartlek 13km (10K rhythm)', workoutType: 3, description: `FARTLEK -- 13km 10K rhythm
━━━━━━━━━━━━━━━━━━━━━━━━
  * 3km warm-up jog
  * 6x (3min @ 3:33/km / 2min @ 4:30/km)
  * 4x (1min @ 3:20/km / 1min easy)
  * 2km cool-down jog
  * Total: ~13km
  * Two-speed fartlek: 3min at 10K pace, 1min at 5K overspeed.
  * The 3min efforts build 10K-specific endurance.
  * The 1min fast bursts maintain top-end speed.`, distancePlanned: 13000, totalTimePlanned: 1.0, structure: STRUCTURES.fartlek10kRhythm },
      { date: '2026-07-17', title: 'OFF', workoutType: 100, description: `REST DAY`, totalTimePlanned: 0 },
      { date: '2026-07-18', title: 'Long run 22km', workoutType: 3, description: `LONG RUN -- 22km WITH RHYTHM FINISH
━━━━━━━━━━━━━━━━━━━━━━━━
SEGMENT 1 -- km 1-17 (EASY)
  * Pace: 4:30/km (Z2) | HR: <160

SEGMENT 2 -- km 18-22 (10K RHYTHM FINISH)
  * Pace: 4:00/km (~90-95%) | HR: 158-168

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 22km | ~1h42
5km of rhythm on tired legs. 10K race prep.`, distancePlanned: 22000, totalTimePlanned: 1.7, tssPlanned: 125, structure: STRUCTURES.longRun22kmRhythmFinish },
      { date: '2026-07-19', title: 'Gym', workoutType: 9, description: `Gym 45min -- Strength + explosive
━━━━━━━━━━━━━━━━━━━━━━━━
  * Front squats 3x5 (heavy)
  * Hip thrusts 3x8
  * Box jumps 3x5
  * Depth jumps 3x5
  * Plank 3x45sec
  * Copenhagen plank 3x20sec/side`, totalTimePlanned: 0.75 },
      { date: '2026-07-19', title: 'Easy bike 45min', workoutType: 2, description: `Easy bike 45min Z1-Z2\n150-200W | HR <150`, totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },

      // ============ WEEK 15 (Jul 20-26) — 10K dress rehearsal ============
      { date: '2026-07-20', title: 'Easy bike 60min Z2', workoutType: 2, description: `Easy bike 60min Z2\n168-227W | HR 146-156`, totalTimePlanned: 1.0, structure: STRUCTURES.easyBike60 },
      { date: '2026-07-21', title: 'TRACK WU', workoutType: 3, description: `WARM-UP (25-30min)
━━━━━━━━━━━━━━━━━━━━━━━━
  * 3km easy jog (HR <145)
  * Dynamic drills 5min
  * 5x 100m strides (90s walk back)
  * 2min settle

Dress rehearsal session.`, distancePlanned: 3500, totalTimePlanned: 0.3, structure: STRUCTURES.keyWarmup },
      { date: '2026-07-21', title: 'TRACK MAIN: 3x2km + 6x400m', workoutType: 3, description: `MAIN SET -- 3x2km + 6x400m (10K DRESS REHEARSAL)
━━━━━━━━━━━━━━━━━━━━━━━━
SET 1: 3x 2km
  * Target pace: 3:29-3:31/km (106-108%) -- 6:58-7:02 per 2km
  * Recovery: 2:30 jog (400m)

SET 2: 6x 400m
  * Target pace: 3:15-3:20/km (112-118%) -- 78-80sec per 400m
  * Recovery: 90sec jog (200m)

  * Total quality: 8.4km
  * 2km reps at 10K pace, then 400s at 5K overspeed.
  * The 400s on tired legs simulate the last km of the 10K.

BAILOUT: If HR drifts above 185 OR pace collapses, STOP.`, distancePlanned: 8400, totalTimePlanned: 0.55, tssPlanned: 85, structure: STRUCTURES.mainTrack3x2km6x400m },
      { date: '2026-07-21', title: 'TRACK CD', workoutType: 3, description: `COOL-DOWN (10-12min)
━━━━━━━━━━━━━━━━━━━��━━━━
  * 2km easy jog 5:30+/km
  * 3min walk + stretch`, distancePlanned: 2000, totalTimePlanned: 0.2, structure: STRUCTURES.keyCooldown },
      { date: '2026-07-22', title: 'Easy 5km', workoutType: 3, description: `Easy run 5km\nPace: 5:10/km | HR <150\nShort, easy. Legs recovering.`, distancePlanned: 5000, totalTimePlanned: 0.43, structure: STRUCTURES.easyRun5km },
      { date: '2026-07-23', title: 'Fartlek 11km (reduced)', workoutType: 3, description: `FARTLEK -- 11km reduced
━━━━━━━━━━━━━━━━━━━━━━━━
  * 3km warm-up jog
  * 4x (4min @ 3:36/km / 2min easy)
  * 2km cool-down jog
  * Total: ~11km
  * Reduced volume. 4 efforts at 10K pace.
  * Keep it honest but don't dig deep. Race is next week.`, distancePlanned: 11000, totalTimePlanned: 0.88, structure: STRUCTURES.fartlek4x4minReduced },
      { date: '2026-07-24', title: 'OFF', workoutType: 100, description: `REST DAY`, totalTimePlanned: 0 },
      { date: '2026-07-25', title: 'Long run 16km easy', workoutType: 3, description: `LONG RUN -- 16km EASY
━━━━━━━━━━━━━━━━━━━━━━━━
  * Pace: 4:35/km (Z2) | HR: <155
  * RPE 4/10 -- conversational
  * No fast finish. Legs fresh for race week.

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 16km | ~1h13`, distancePlanned: 16000, totalTimePlanned: 1.22, tssPlanned: 80, structure: STRUCTURES.longRun16kmEasyRecovery },
      { date: '2026-07-26', title: 'Gym (light)', workoutType: 9, description: `Gym 25min -- LIGHT maintenance
━━━━━━━━━━━━━━━━━━━━━━━━
  * Bodyweight squats 2x10
  * Glute bridges 2x12
  * Plank 2x40sec

Last gym before 10K TT. Very light.`, totalTimePlanned: 0.42 },
      { date: '2026-07-26', title: 'Easy bike 30min', workoutType: 2, description: `Easy bike 30min Z1\n<167W | HR <145\nShort post-gym spin. Race week starts tomorrow.`, totalTimePlanned: 0.5, structure: STRUCTURES.easyBike45 },

      // ============ WEEK 16 (Jul 27 - Aug 1) — 10K RACE WEEK ============
      { date: '2026-07-27', title: 'Easy bike 40min', workoutType: 2, description: `Easy bike 40min Z1\n<167W | HR <145\nRace week. Short and easy.`, totalTimePlanned: 0.67, structure: STRUCTURES.easyBike45 },
      { date: '2026-07-28', title: 'TRACK WU', workoutType: 3, description: `WARM-UP (20-25min)
━━━━━━━━━━━━━━━━━━━━━━━━
  * 3km easy jog (HR <145)
  * Dynamic drills 5min
  * 5x 100m strides (90s walk back)
  * 2min settle

Race week opener. Last hard session.`, distancePlanned: 3500, totalTimePlanned: 0.3, structure: STRUCTURES.keyWarmup },
      { date: '2026-07-28', title: 'TRACK MAIN: 3x1km + 4x200m (opener)', workoutType: 3, description: `MAIN SET -- 3x1km + 4x200m (10K RACE WEEK OPENER)
━━━━━━━━━━━━━━━━━━━━━━━━
SET 1: 3x 1km
  * Target pace: 3:26-3:28/km (108-110%)
  * Recovery: FULL (400m jog, take your time)

SET 2: 4x 200m
  * Target pace: 3:00-3:05/km (120-127%) -- 37sec per 200m
  * Recovery: FULL (200m walk/jog)

  * Total quality: 3.8km. Sharp. Electric.
  * Full recovery between ALL reps. Not a workout -- a primer.
  * Leave the track feeling FAST, not tired.
  * Last hard session before 10K TT.`, distancePlanned: 3800, totalTimePlanned: 0.28, tssPlanned: 40, structure: STRUCTURES.mainTrackOpener3x1km4x200m },
      { date: '2026-07-28', title: 'TRACK CD', workoutType: 3, description: `COOL-DOWN (10min)
━━━━━━━━━━━━━━━━━━━━━━━━
  * 2km easy jog 5:30+/km
  * Walk + stretch`, distancePlanned: 2000, totalTimePlanned: 0.17, structure: STRUCTURES.keyCooldown },
      { date: '2026-07-29', title: 'Easy 4km', workoutType: 3, description: `Easy run 4km\nPace: 5:10-5:20/km | HR <150\nJust movement. Nothing more.`, distancePlanned: 4000, totalTimePlanned: 0.35, structure: STRUCTURES.easyRun4km },
      { date: '2026-07-30', title: 'Easy 20min jog + strides', workoutType: 3, description: `20min easy jog + 4x100m strides
Pace: 5:10-5:20/km | HR <150
Leg turnover. Nothing more.
Strides at 90%, walk-back recovery.`, distancePlanned: 4000, totalTimePlanned: 0.4, structure: STRUCTURES.easyRun4kmStrides },
      { date: '2026-07-31', title: 'REST', workoutType: 100, description: `COMPLETE REST
━━━━━━━━━━━━━━━━━━━━━━━━
Sleep early. Hydrate. Eat well.
No running. No gym. Light walk OK.

Race plan for tomorrow:
  * Km 1-2: 3:34 -- CONTROLLED. Resist adrenaline.
  * Km 3-8: 3:34 -- the engine room. METRONOMIC.
  * Km 9: 3:32 -- push, you can see the finish
  * Km 10: 3:28 -- EVERYTHING LEFT
  * = 35:52`, totalTimePlanned: 0 },
      { date: '2026-08-01', title: '10K TIME TRIAL -- sub-36:00', workoutType: 3, description: `10K TIME TRIAL -- TARGET SUB-36:00
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP (15min)
  * 2km easy jog
  * Dynamic drills (5min)
  * 3x100m at 10K race pace

RACE -- 10km
  * Target: 35:52 (3:34x8 + 3:32 + 3:28)
  * Km 1-2: 3:34 -- CONTROLLED. Resist adrenaline.
  * Km 3-8: 3:34 -- the engine room. METRONOMIC.
  * Km 9: 3:32 -- push, you can see the finish
  * Km 10: 3:28 or faster -- EVERYTHING LEFT

COOL-DOWN (10min)
  * Easy jog + walk

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~14km | TSS ~85
THE SEASON FINALE. Sub-36. Make it count.
Even splits or negative split. NEVER positive.`, distancePlanned: 10000, totalTimePlanned: 0.6, tssPlanned: 85, structure: STRUCTURES.tt10k },
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
