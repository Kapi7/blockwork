/**
 * Itay's DEFINITIVE 19-week training plan — Sang track + Thursday bike/fartlek.
 * The source of truth George coaches from.
 *
 * Five sequential blocks leading to 5K TT Jul 25, then 10K TT Aug 22:
 *   0: Reset & Reload              (Mar 23 – Apr 13)
 *   1: Rebuild + Speed Introduction (Apr 14 – May 10) — base phase, first track sessions
 *   2: Develop Speed                (May 11 – Jun 7)  — speed phase, 1km reps + 16x400m
 *   3: Race-Specific Sharpening     (Jun 8  – Jul 5)  — speed → race model + assessment
 *   4: Race + 10K Campaign          (Jul 6  – Aug 23) — 5K TT Jul 25, 10K TT Aug 22
 *
 * Weekly pattern (blocks 1-4, no exceptions):
 *   Mon: Easy bike 60-90min Z2
 *   Tue AM: TRACK session (3 TP entries: WU / MAIN / CD)
 *   Tue PM: Gym (strength + plyos)
 *   Wed: Easy run 7km + strides, max 40min
 *   Thu: BIKE INTENSITY (wk1-4) then alternating FARTLEK / BIKE from wk5
 *   Fri: Yoga 40min + easy bike 45min (2 entries)
 *   Sat: LONG RUN
 *   Sun: LONG RIDE 2-2.5hrs Z2
 *
 * Recovery weeks: Tue track = shorter, Thu = easy bike (no fartlek), Sat long = shorter.
 * Race weeks: Tue = opener, Thu = yoga only, Sat = RACE.
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
    visualizationDistanceUnit: 'kilometer',
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
    visualizationDistanceUnit: 'kilometer',
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

  // ═══════════════ COMPLEMENTARY THURSDAY FARTLEK STRUCTURES ═══════════════

  // Short sprint fartlek — neuromuscular (8×30sec)
  fartlekSprint8x30: runStructure([
    distStep('Warm up jog', 3000, 65, 75, 'warmUp'),
    repeatSet(8, 30, 115, 120, 90, 70, 80),
    distStep('Cool down', 2000, 65, 75, 'coolDown'),
  ]),

  // Short sprint fartlek — neuromuscular (10×30sec)
  fartlekSprint10x30: runStructure([
    distStep('Warm up jog', 3000, 65, 75, 'warmUp'),
    repeatSet(10, 30, 115, 120, 90, 70, 80),
    distStep('Cool down', 2000, 65, 75, 'coolDown'),
  ]),

  // Very short sprint fartlek — pure speed (8×20sec)
  fartlekSprint8x20: runStructure([
    distStep('Warm up jog', 3000, 65, 75, 'warmUp'),
    repeatSet(8, 20, 120, 130, 120, 70, 80),
    distStep('Cool down', 2000, 65, 75, 'coolDown'),
  ]),

  // Tempo fartlek — aerobic threshold (2×5min)
  fartlekTempo2x5min: runStructure([
    distStep('Warm up jog', 3000, 65, 75, 'warmUp'),
    singleStep('Tempo 1', 300, 95, 98, 'active'),
    singleStep('Recovery', 180, 70, 80, 'rest'),
    singleStep('Tempo 2', 300, 95, 98, 'active'),
    distStep('Cool down', 2000, 65, 75, 'coolDown'),
  ]),

  // Tempo fartlek — aerobic threshold (3×4min)
  fartlekTempo3x4min: runStructure([
    distStep('Warm up jog', 3000, 65, 75, 'warmUp'),
    repeatSet(3, 240, 95, 98, 120, 70, 80),
    distStep('Cool down', 2000, 65, 75, 'coolDown'),
  ]),

  // 5K race-specific fartlek (6×90sec @ 5K pace)
  fartlek5kSpecific6x90: runStructure([
    distStep('Warm up jog', 3000, 65, 75, 'warmUp'),
    repeatSet(6, 90, 106, 108, 90, 70, 80),
    distStep('Cool down', 2000, 65, 75, 'coolDown'),
  ]),

  // Fast sprint fartlek (10×30sec at higher speed)
  fartlekSprint10x30fast: runStructure([
    distStep('Warm up jog', 3000, 65, 75, 'warmUp'),
    repeatSet(10, 30, 118, 125, 90, 70, 80),
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

  // ═══════════════ DEFINITIVE PLAN: ADDITIONAL STRUCTURES ═══════════════

  // Easy bike 40min (race week short spin)
  easyBike40: bikeStructure([
    singleStep('Warm up', 240, 45, 55, 'warmUp'),
    singleStep('Z1-Z2 steady', 1800, 55, 68, 'active'),
    singleStep('Cool down', 360, 45, 55, 'coolDown'),
  ]),

  // Long ride 2hrs Z2
  longRide120: bikeStructure([
    singleStep('Warm up', 600, 50, 65, 'warmUp'),
    singleStep('Z2 endurance', 6300, 65, 75, 'active'),
    singleStep('Cool down', 300, 50, 60, 'coolDown'),
  ]),

  // Long ride 2.5hrs Z2 + 3x5min Z3 surges
  longRide150Z3: bikeStructure([
    singleStep('Warm up', 900, 50, 65, 'warmUp'),
    singleStep('Z2 base', 3600, 65, 75, 'active'),
    repeatSet(3, 300, 78, 85, 300, 60, 70),
    singleStep('Z2 cruise out', 1800, 65, 75, 'active'),
    singleStep('Cool down', 600, 50, 60, 'coolDown'),
  ]),

  // ─────── Track MAIN sets for definitive plan ───────

  // Week 6: 6x800m @ 2:52 (3:35/km = 104%) + 4x400m @ 82sec (3:25/km = 110%)
  mainTrack6x800m4x400m: runStructure([
    repeatSetDist(6, 800, 103, 106, 400, 55, 65),
    repeatSetDist(4, 400, 108, 112, 200, 50, 60),
  ]),

  // Week 9: 4x1200m @ 4:12 (3:30/km = 107%) + 4x400m @ 80sec (3:20/km = 112%)
  mainTrack4x1200m4x400mSharp: runStructure([
    repeatSetDist(4, 1200, 106, 108, 400, 55, 65),
    repeatSetDist(4, 400, 110, 114, 200, 50, 60),
  ]),

  // Week 11: 6x800m @ 2:44 (3:25/km = 110%) + 6x200m @ 37sec (3:05/km = 122%)
  mainTrack6x800mFast6x200m: runStructure([
    repeatSetDist(6, 800, 108, 112, 400, 55, 65),
    repeatSetDist(6, 200, 120, 125, 200, 45, 55),
  ]),

  // Week 12: 3x1km @ 3:28-3:30 ASSESSMENT (106-108%)
  mainTrack3x1kmAssess: runStructure([
    repeatSetDist(3, 1000, 106, 108, 400, 55, 65),
  ]),

  // Week 14: 3km continuous @ 3:30/km (107%) -- race model
  mainTrack3kmContinuous: runStructure([
    distStep('3km at 5K pace', 3000, 106, 108, 'active'),
  ]),

  // Week 15 opener: 4x400m @ 78sec (3:15/km = 115%) + 4x200m @ 37sec (3:05/km = 122%)
  mainTrackOpener5k: runStructure([
    repeatSetDist(4, 400, 114, 118, 200, 60, 70),
    repeatSetDist(4, 200, 120, 127, 200, 55, 65),
  ]),

  // Week 18 opener: 3x1km @ 3:26 (109%) + 4x200m @ 37sec (122%)
  mainTrackOpener10k: runStructure([
    repeatSetDist(3, 1000, 108, 110, 400, 55, 65),
    repeatSetDist(4, 200, 120, 127, 200, 55, 65),
  ]),

  // ─────── Long run structures ───────

  // 14km easy (no fast finish)
  longRun14kmEasy: runStructure([
    distStep('Easy', 14000, 72, 80, 'active'),
  ]),

  // 16km easy (recovery)
  longRun16kmEasyFlat: runStructure([
    distStep('Easy', 16000, 72, 80, 'active'),
  ]),

  // 18km easy (no fast finish)
  longRun18kmEasyFlat: runStructure([
    distStep('Easy', 18000, 72, 80, 'active'),
  ]),

  // 20km with 3km fast finish @ 4:10/km (88-93%)
  longRun20kmFastFinish3: runStructure([
    distStep('Easy', 17000, 72, 80, 'active'),
    distStep('Fast finish', 3000, 88, 93, 'active'),
  ]),

  // 22km with last 4km @ 4:05/km (90-95%)
  longRun22kmFastFinish4: runStructure([
    distStep('Easy', 18000, 72, 80, 'active'),
    distStep('Fast finish', 4000, 90, 95, 'active'),
  ]),

  // 22km with inserts (3x2km @ sub-threshold within)
  longRun22kmInserts: runStructure([
    distStep('Easy warm', 6000, 72, 80, 'active'),
    distStep('Insert 1: 2km tempo', 2000, 90, 95, 'active'),
    distStep('Easy', 4000, 72, 80, 'active'),
    distStep('Insert 2: 2km tempo', 2000, 90, 95, 'active'),
    distStep('Easy', 4000, 72, 80, 'active'),
    distStep('Insert 3: 2km strong', 2000, 92, 97, 'active'),
  ]),

  // 24km with last 4km @ 4:00/km (94-97%)
  longRun24kmPeak: runStructure([
    distStep('Easy', 20000, 72, 80, 'active'),
    distStep('Strong finish', 4000, 93, 97, 'active'),
  ]),

  // 20km with last 4km @ 4:05/km
  longRun20kmFastFinish4_05: runStructure([
    distStep('Easy', 16000, 72, 80, 'active'),
    distStep('Fast finish', 4000, 90, 95, 'active'),
  ]),

  // 20km with last 5km @ 4:00/km
  longRun20km10kFinish: runStructure([
    distStep('Easy', 15000, 72, 80, 'active'),
    distStep('Strong finish', 5000, 93, 97, 'active'),
  ]),

  // Easy 5km + strides (short with strides)
  easyRun5kmStrides: runStructure([
    distStep('Easy', 4000, 72, 80, 'active'),
    singleStep('Walk 2min transition', 120, 30, 45, 'rest'),
    {
      type: 'repetition',
      length: { value: 4, unit: 'repetition' },
      steps: [
        { type: 'step', name: 'Stride 100m', length: { value: 100, unit: 'meter' }, targets: [{ minValue: 115, maxValue: 130 }], intensityClass: 'active', openDuration: false },
        { type: 'step', name: 'Walk back', length: { value: 60, unit: 'second' }, targets: [{ minValue: 45, maxValue: 60 }], intensityClass: 'rest', openDuration: false },
      ],
    },
    distStep('Cool down', 300, 60, 70, 'coolDown'),
  ]),

  // ═══════════════ SPEED-FIRST BUILD: NEW STRUCTURES ═══════════════

  // Week 1: strides + 6x200m (gentle intro to short speed)
  mainStrides6x200m: runStructure([
    repeatSetDist(6, 200, 98, 105, 200, 55, 65),
  ]),

  // Week 3: 8x400m at 86-88sec (faster 400s)
  mainTrack8x400m86: runStructure([
    repeatSetDist(8, 400, 102, 104, 200, 50, 60),
  ]),

  // Recovery week strides (keep legs quick, no fatigue)
  mainRecoveryStrides: runStructure([
    repeatSetDist(4, 200, 105, 112, 200, 50, 60),
  ]),

  // ═══════════════ DATA-DRIVEN PLAN: NEW STRUCTURES ═══════════════

  // ─────── Sub-threshold MAIN sets (cruise intervals — athlete's comfort zone) ───────
  mainSubThreshold3x2km: runStructure([
    repeatSetDist(3, 2000, 95, 98, 400, 55, 65),
  ]),

  // ─────── Recovery / transition MAIN sets ───────
  mainRecovery2x1km: runStructure([
    repeatSetDist(2, 1000, 96, 100, 400, 55, 65),
  ]),

  // ─────── Cruise interval MAIN sets (100-104% threshold) ───────
  mainCruise6x1km: runStructure([
    repeatSetDist(6, 1000, 100, 102, 400, 55, 65),
  ]),
  mainCruise5x1km104: runStructure([
    repeatSetDist(5, 1000, 102, 104, 400, 55, 65),
  ]),
  mainCruise4x1500m: runStructure([
    repeatSetDist(4, 1500, 100, 102, 400, 55, 65),
  ]),
  mainCruise4x1km: runStructure([
    repeatSetDist(4, 1000, 100, 102, 400, 55, 65),
  ]),

  // ─────── Track MAIN sets (5K pace zone) ───────
  mainTrack6x800mCruise: runStructure([
    repeatSetDist(6, 800, 102, 104, 400, 55, 65),
  ]),
  mainTrack6x1km5kPace: runStructure([
    repeatSetDist(6, 1000, 105, 107, 400, 55, 65),
  ]),

  // ─────── 12x400m at 5K pace (first 400m reps — week 10) ───────
  mainReps12x400m5kPace: runStructure([
    repeatSetDist(12, 400, 105, 107, 200, 50, 60),
  ]),

  // ─────── Long run structures (data-driven rebuild from 12km) ───────
  longRun12kmEasy: runStructure([
    distStep('Easy', 12000, 72, 80, 'active'),
  ]),
  longRun18kmFastFinish: runStructure([
    distStep('Easy', 15000, 72, 80, 'active'),
    distStep('Fast finish', 3000, 88, 93, 'active'),
  ]),
  longRun20kmFastFinish5: runStructure([
    distStep('Easy', 15000, 72, 80, 'active'),
    distStep('Strong finish', 5000, 93, 97, 'active'),
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
  // ═══════════════ BLOCK 1: Rebuild + Speed Introduction (Apr 14 - May 10) ═══════════════
  {
    id: 'block-1-rebuild',
    number: 1,
    name: 'Rebuild + Speed Introduction',
    phase: 'base',
    startDate: '2026-04-14',
    endDate: '2026-05-10',
    stimulus: 'Speed-first build: 200m → 400m progression. Strides+6x200m intro, then 10x400m@88-90, 8x400m@86-88, recovery strides. Thursday COMPLEMENTS Tuesday: tempo fartlek after short speed, fartlek after easy Tue, bike on recovery. Long runs rebuild from 12km. Gym on Tue PM after track.',
    goals: [
      'Sub-threshold cruise intervals: 4x1km → 5x1km → 3x2km at 3:50-3:55/km',
      'Thursday complements Tuesday: fartlek when Tue light (wk1,3), tempo fartlek when Tue short speed (wk2), bike on recovery (wk4)',
      'Long runs 12→14→16→12km (recovery) — rebuilding from 9km post-marathon',
      'Bike Mon/Fri/Sun fills aerobic volume without impact',
      'Gym Tue PM for strength + explosive power',
    ],
    successMetrics: [
      '3x2km @ 3:50-3:55 smooth with HR <175 on last rep',
      'Long run 16km completed at Z2 HR <150',
      'All easy runs HR <150 at 5:00-5:10/km',
      'Fartlek sessions completed continuously (no stopping)',
    ],
    weekPattern: 'Mon easy bike | Tue AM TRACK (WU/MAIN/CD) + PM Gym | Wed easy 7km+strides | Thu FARTLEK or BIKE (alternating) | Fri yoga+bike | Sat long run | Sun long ride',
    restrictions: [
      'Week 4 is recovery — lighter track, Thu = easy bike Z2, shorter long run',
      'Track sessions ALWAYS split into 3 TP entries (WU/MAIN/CD)',
      'Thursday complements Tue: wk1 fartlek (Tue light), wk2 tempo fartlek (Tue short speed), wk3 fartlek (Tue moderate), wk4 bike (recovery)',
      'Fartlek = continuous run, NO stopping between reps',
      'Thursday principle: different energy system to Tuesday — sprints after threshold, tempo after speed',
      'HR cap on long run easy portion: 150 (conservative rebuild)',
    ],
    sessions: [
      // ============ WEEK 1 (Apr 14-19, partial — no Monday) ============
      { date: '2026-04-14', title: 'TRACK WU', workoutType: 3, description: `WARM-UP (25-30min)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 3km easy jog 5:30-6:00/km (HR <145)\n  * Dynamic drills 5min: leg swings, A-skips, B-skips, high knees, butt kicks, carioca\n  * 2min walk break\n  * 5x 100m progressive strides @ 3:30-4:00/km (90s walk back)\n  * 2min settle before main set\n\nRoad shoes. Easy jog to the track.`, distancePlanned: 3500, totalTimePlanned: 0.45, structure: STRUCTURES.keyWarmup },
      { date: '2026-04-14', title: 'TRACK MAIN: Strides + 6x200m', workoutType: 3, description: `MAIN SET -- Strides + 6x 200m (SPEED INTRODUCTION)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 6x 200m @ 3:34-3:50/km (98-105%) -- 40-47sec per 200m\n  * Recovery: 200m walk/jog (~55-65sec)\n  * Effort: 6/10 -- smooth, learning the speed\n  * Total quality: 1.2km\n\n  Week 1: just introduce SHORT speed. Easy pace.\n  This is NOT your comfort zone of long sub-threshold reps.\n  We're building speed from the bottom up: 200m → 400m → 800m → 1km.\n  Run RELAXED. Fast feet, not hard effort.\n  Think: "quick turnover" not "hold on."\n\nBAILOUT: If anything feels forced, jog the rest.\n\nTrack shoes/racing flats.`, distancePlanned: 1200, totalTimePlanned: 0.2, tssPlanned: 25, structure: STRUCTURES.mainStrides6x200m },
      { date: '2026-04-14', title: 'TRACK CD', workoutType: 3, description: `COOL-DOWN (10-12min)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 2km easy jog 5:30+/km\n  * 3min walk + stretch: hamstrings, calves, hips\n\nBack in road shoes.`, distancePlanned: 2000, totalTimePlanned: 0.2, structure: STRUCTURES.keyCooldown },
      { date: '2026-04-14', title: 'PM Gym', workoutType: 9, description: `Gym 45min -- Strength (light intro)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Back squats 3x8 (light, learn movement)\n  * Romanian deadlifts 3x8\n  * Box jumps 3x5\n  * Single-leg calf raises 3x12\n  * Plank 3x30sec\n  * Copenhagen plank 3x15sec/side\n  * Dead bug 3x8/side\n\nFirst gym of the block. Light loads, learn the movements.`, totalTimePlanned: 0.75 },
      { date: '2026-04-15', title: 'Easy 7km + strides', workoutType: 3, description: `Easy run 7km + 4x100m strides\nPace: 5:00-5:10/km | HR <150 | Max 40min\nStrides: 4x100m @ 3:30-3:45/km with walk-back recovery.\nKeeps leg turnover fresh between track and long run.`, distancePlanned: 7000, totalTimePlanned: 0.65, structure: STRUCTURES.easyRunStrides7km },
      { date: '2026-04-16', title: 'Fartlek 10km (8x1min)', workoutType: 3, description: `FARTLEK -- 10km continuous (8x1min hard)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 3km warm-up @ 5:00/km (HR <150)\n  * 8× (1min hard @ 3:38-3:47/km [99-103%] / 2min easy @ 5:00/km)\n    — Hard = sub-threshold effort, feels like "strong but manageable"\n    — HR target: 165-175 on hard portions\n    — Easy = full recovery jog\n  * 2km cool-down @ 5:10/km\n\n━━━━━━━━━━━━━━━━━━━━━━━━\nTOTAL: ~10km | ~50min\nFirst fartlek! CONTINUOUS — do not stop between reps.\nShort surges to introduce the format. Stay in control.\n\nBAILOUT: If HR >178 or legs feel heavy after 4 reps, jog home.`, distancePlanned: 10000, totalTimePlanned: 0.83, structure: STRUCTURES.fartlek8x1min },
      { date: '2026-04-17', title: 'Yoga 40min', workoutType: 100, description: `Yoga / Mobility 40min\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Sun salutations 5min\n  * Hip openers: pigeon, lizard, frog 10min\n  * Hamstring sequence: forward folds, pyramid 8min\n  * Runner lunges + quad stretch 7min\n  * Foam roll: quads, calves, glutes, IT band 10min\n\nActive recovery. Focus on hip mobility and hamstring length.`, totalTimePlanned: 0.67 },
      { date: '2026-04-17', title: 'Easy bike 45min', workoutType: 2, description: `Easy bike 45min Z1-Z2\n150-200W | HR <150 | Cadence 85-90rpm\nGentle spin after yoga. Pre-long-run day.`, totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },
      { date: '2026-04-18', title: 'Long run 12km easy', workoutType: 3, description: `LONG RUN -- 12km EASY\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Pace: 4:50-5:00/km (Z2)\n  * HR: <150 -- HARD CAP\n  * RPE 4/10 -- fully conversational\n  * No fast finish. Pure easy.\n\n━━━━━━━━━━━━━━━━━━━━━━━━\nTOTAL: 12km | ~58min\nFirst long run back. Your longest since marathon (Mar 22) is only 9km.\nConservative start. Build from here.`, distancePlanned: 12000, totalTimePlanned: 0.97, tssPlanned: 55, structure: STRUCTURES.longRun12kmEasy },
      { date: '2026-04-19', title: 'Long ride 90min Z2', workoutType: 2, description: `Long ride 90min Z2\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 168-227W | HR 146-156 | Cadence 85-90rpm\n  * Steady aerobic endurance. No surges.\n  * Outdoor preferred. Enjoy the ride.\n\nBuilding the aerobic base without impact.`, totalTimePlanned: 1.5, structure: STRUCTURES.bikeEndurance90 },

      // ============ WEEK 2 (Apr 20-26) ============
      { date: '2026-04-20', title: 'Easy bike 60min Z2', workoutType: 2, description: `Easy bike 60min Z2\n168-227W | HR 146-156 | Cadence 85-90rpm\nSteady aerobic spin. Start the week easy.`, totalTimePlanned: 1.0, structure: STRUCTURES.easyBike60 },
      { date: '2026-04-21', title: 'TRACK WU', workoutType: 3, description: `WARM-UP (25-30min)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 3km easy jog (HR <145)\n  * Dynamic drills 5min\n  * 5x 100m strides (90s walk back)\n  * 2min settle`, distancePlanned: 3500, totalTimePlanned: 0.45, structure: STRUCTURES.keyWarmup },
      { date: '2026-04-21', title: 'TRACK MAIN: 10x400m @ 88-90sec', workoutType: 3, description: `MAIN SET -- 10x 400m (EXTEND TO 400m)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Target pace: 3:43-3:47/km (99-101%) -- 89-91sec per 400m\n  * HR target: 164-172 bpm (Z4) by rep 5-10\n  * Recovery: 200m jog (~50-60sec)\n  * Effort: 7/10 -- moderate pace, learning 400m rhythm\n  * Total quality: 4km at pace\n\n  Week 2: extend speed from 200m to 400m.\n  Still MODERATE pace — not racing these.\n  10 reps to build volume at the distance.\n  Find the gear. Smooth, efficient turnover.\n\nBAILOUT: If HR >176 OR pace >92sec on 2 consecutive reps, STOP.`, distancePlanned: 4000, totalTimePlanned: 0.35, tssPlanned: 50, structure: STRUCTURES.mainTrack10x400mIntro },
      { date: '2026-04-21', title: 'TRACK CD', workoutType: 3, description: `COOL-DOWN (10-12min)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 2km easy jog 5:30+/km\n  * 3min walk + stretch`, distancePlanned: 2000, totalTimePlanned: 0.2, structure: STRUCTURES.keyCooldown },
      { date: '2026-04-21', title: 'PM Gym', workoutType: 9, description: `Gym 45min -- Strength + explosive\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Back squats 3x6 (add 2.5kg vs week 1)\n  * Romanian deadlifts 3x8\n  * Bounding 3x6\n  * Box jumps 3x5\n  * Plank 3x40sec\n  * Side plank 3x25sec/side\n  * Dead bug 3x10/side`, totalTimePlanned: 0.75 },
      { date: '2026-04-22', title: 'Easy 7km + strides', workoutType: 3, description: `Easy run 7km + 4x100m strides\nPace: 5:00-5:10/km | HR <150 | Max 40min`, distancePlanned: 7000, totalTimePlanned: 0.65, structure: STRUCTURES.easyRunStrides7km },
      { date: '2026-04-23', title: 'Fartlek 10km tempo (2x5min)', workoutType: 3, description: `FARTLEK — 10km (2×5min tempo)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 3km warm-up @ 5:00/km\n  * 2× (5min @ 3:48-3:55/km sub-threshold / 3min easy jog)\n    — Sub-threshold effort. Should feel "comfortably hard."\n    — HR: 162-170\n  * 2km cool-down\n\nCOMPLEMENTS TUESDAY: Tue was short 10×400m speed. Today is longer sustained effort — different format.\nCONTINUOUS — do not stop.`, distancePlanned: 10000, totalTimePlanned: 0.83, structure: STRUCTURES.fartlekTempo2x5min },
      { date: '2026-04-24', title: 'Yoga 40min', workoutType: 100, description: `Yoga / Mobility 40min\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Sun salutations 5min\n  * Hip openers: pigeon, lizard, half split 10min\n  * Hamstring + calf stretches 8min\n  * Thoracic spine rotation 7min\n  * Foam roll 10min\n\nFocus on opening hips after yesterday's bike.`, totalTimePlanned: 0.67 },
      { date: '2026-04-24', title: 'Easy bike 45min', workoutType: 2, description: `Easy bike 45min Z1-Z2\n150-200W | HR <150\nGentle spin after yoga.`, totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },
      { date: '2026-04-25', title: 'Long run 14km easy', workoutType: 3, description: `LONG RUN -- 14km EASY\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Pace: 4:50/km (Z2)\n  * HR: <150 -- HARD CAP\n  * RPE 4/10 -- conversational\n  * No fast finish. Pure easy.\n\n━━━━━━━━━━━━━━━━━━━━━━━━\nTOTAL: 14km | ~1h08\n+2km from last week. Same easy effort. Building distance back.`, distancePlanned: 14000, totalTimePlanned: 1.13, tssPlanned: 65, structure: STRUCTURES.longRun14kmEasy },
      { date: '2026-04-26', title: 'Long ride 2hrs Z2', workoutType: 2, description: `Long ride 2hrs Z2\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 168-227W | HR 146-156 | Cadence 85-90rpm\n  * Steady aerobic endurance\n  * Optional: include 3x5min Z2-high surges if feeling good\n\nBuilding towards 2.5hr rides by block end.`, totalTimePlanned: 2.0, structure: STRUCTURES.longRide120 },

      // ============ WEEK 3 (Apr 27 - May 3) ============
      { date: '2026-04-27', title: 'Easy bike 60min Z2', workoutType: 2, description: `Easy bike 60min Z2\n168-227W | HR 146-156\nSteady spin to start the week.`, totalTimePlanned: 1.0, structure: STRUCTURES.easyBike60 },
      { date: '2026-04-28', title: 'TRACK WU', workoutType: 3, description: `WARM-UP (25-30min)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 3km easy jog (HR <145)\n  * Dynamic drills 5min\n  * 5x 100m strides (90s walk back)\n  * 2min settle`, distancePlanned: 3500, totalTimePlanned: 0.45, structure: STRUCTURES.keyWarmup },
      { date: '2026-04-28', title: 'TRACK MAIN: 8x400m @ 86-88sec', workoutType: 3, description: `MAIN SET -- 8x 400m (FASTER 400s)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Target pace: 3:36-3:41/km (102-104%) -- 86-88sec per 400m\n  * HR target: 168-176 bpm (Z4-Z5a) by rep 5-8\n  * Recovery: 200m jog (~50-60sec)\n  * Effort: 7.5/10 -- faster than last week, fewer reps\n  * Total quality: 3.2km at pace\n\n  Week 3: FASTER 400s but fewer reps (8 vs 10).\n  Recovery week coming next — push a bit here.\n  Your body is learning to run fast before running long.\n  Smooth, quick feet. Don't muscle it.\n\nBAILOUT: If HR >178 OR pace >90sec on 2 consecutive reps, STOP.`, distancePlanned: 3200, totalTimePlanned: 0.3, tssPlanned: 45, structure: STRUCTURES.mainTrack8x400m86 },
      { date: '2026-04-28', title: 'TRACK CD', workoutType: 3, description: `COOL-DOWN (10-12min)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 2km easy jog 5:30+/km\n  * 3min walk + stretch`, distancePlanned: 2000, totalTimePlanned: 0.2, structure: STRUCTURES.keyCooldown },
      { date: '2026-04-28', title: 'PM Gym', workoutType: 9, description: `Gym 45min -- Strength + explosive\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Back squats 3x5 (heavier)\n  * Romanian deadlifts 3x8\n  * Box jumps 3x5\n  * Depth jumps 3x3 (intro)\n  * Plank 3x45sec\n  * Pallof press 3x10/side`, totalTimePlanned: 0.75 },
      { date: '2026-04-29', title: 'Easy 7km + strides', workoutType: 3, description: `Easy run 7km + 4x100m strides\nPace: 5:00-5:10/km | HR <150 | Max 40min`, distancePlanned: 7000, totalTimePlanned: 0.65, structure: STRUCTURES.easyRunStrides7km },
      { date: '2026-04-30', title: 'Fartlek 11km (6x2min)', workoutType: 3, description: `FARTLEK -- 11km continuous (6x2min hard)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 3km warm-up @ 5:00/km (HR <150)\n  * 6× (2min hard @ 3:38-3:47/km [99-103%] / 2min easy @ 5:00/km)\n    — Hard = sub-threshold effort, honest but controlled\n    — HR target: 168-176 on hard portions\n    — Easy = recovery jog, NOT walking\n  * 2km cool-down @ 5:10/km\n\n━━━━━━━━━━━━━━━━━━━━━━━━\nTOTAL: ~11km | ~52min\nLonger surges than Week 1. CONTINUOUS — do not stop.\n\nBAILOUT: If HR >180 or pace collapses for 2 consecutive reps, jog home.`, distancePlanned: 11000, totalTimePlanned: 0.87, structure: STRUCTURES.fartlek6x2min },
      { date: '2026-05-01', title: 'Yoga 40min', workoutType: 100, description: `Yoga / Mobility 40min\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Sun salutations 5min\n  * Hip openers 10min\n  * Hamstrings + calves 10min\n  * Foam roll quads, IT band, glutes 10min\n  * Savasana 5min`, totalTimePlanned: 0.67 },
      { date: '2026-05-01', title: 'Easy bike 45min', workoutType: 2, description: `Easy bike 45min Z1-Z2\n150-200W | HR <150\nGentle spin after yoga.`, totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },
      { date: '2026-05-02', title: 'Long run 16km easy', workoutType: 3, description: `LONG RUN -- 16km EASY\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Pace: 4:45/km (Z2)\n  * HR: <150 -- HARD CAP\n  * RPE 4/10 -- conversational\n  * No fast finish. Pure Z2. Building distance.\n\n━━━━━━━━━━━━━━━━━━━━━━━━\nTOTAL: 16km | ~1h12\n+2km from last week. Patience.`, distancePlanned: 16000, totalTimePlanned: 1.2, tssPlanned: 75, structure: STRUCTURES.longRun16kmEasyFlat },
      { date: '2026-05-03', title: 'Long ride 2hrs Z2', workoutType: 2, description: `Long ride 2hrs Z2\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 168-227W | HR 146-156\n  * Steady aerobic endurance\n  * Good road or Zwift endurance ride`, totalTimePlanned: 2.0, structure: STRUCTURES.longRide120 },

      // ============ WEEK 4 (May 4-10) — RECOVERY ============
      { date: '2026-05-04', title: 'Easy bike 45min', workoutType: 2, description: `Easy bike 45min Z1\n<167W | HR <145\nRecovery week. Easy spin. Let the body absorb 3 weeks of work.`, totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },
      { date: '2026-05-05', title: 'TRACK WU', workoutType: 3, description: `WARM-UP (25-30min)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 3km easy jog (HR <145)\n  * Dynamic drills 5min\n  * 5x 100m strides (90s walk back)\n  * 2min settle\n\nRecovery week -- lighter session today.`, distancePlanned: 3500, totalTimePlanned: 0.45, structure: STRUCTURES.keyWarmup },
      { date: '2026-05-05', title: 'TRACK MAIN: Strides + 4x200m (recovery)', workoutType: 3, description: `MAIN SET -- Strides + 4x 200m (RECOVERY WEEK)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 4x 200m @ 3:21-3:34/km (105-112%) -- fast but relaxed\n  * Recovery: 200m walk/jog (~50-60sec)\n  * Effort: 5/10 -- just keeping legs quick\n  * Total quality: 0.8km\n\n  RECOVERY WEEK: just keep legs quick. No fatigue.\n  Short, sharp, done. Walk off the track feeling electric.\n  Do NOT extend or add reps. Less is more this week.\n\nBAILOUT: If anything feels heavy, skip and just do 4x100m strides.`, distancePlanned: 800, totalTimePlanned: 0.15, tssPlanned: 20, structure: STRUCTURES.mainRecoveryStrides },
      { date: '2026-05-05', title: 'TRACK CD', workoutType: 3, description: `COOL-DOWN (10-12min)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 2km easy jog 5:30+/km\n  * 3min walk + stretch`, distancePlanned: 2000, totalTimePlanned: 0.2, structure: STRUCTURES.keyCooldown },
      { date: '2026-05-05', title: 'PM Gym (light)', workoutType: 9, description: `Gym 30min -- LIGHT maintenance\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Bodyweight squats 2x10\n  * Glute bridges 2x12\n  * Plank 2x40sec\n  * Dead bug 2x8/side\n\nVery light. Recovery week. No DOMS.`, totalTimePlanned: 0.5 },
      { date: '2026-05-06', title: 'Easy 5km', workoutType: 3, description: `Easy run 5km\nPace: 5:10-5:20/km | HR <150\nShort recovery run. No strides.`, distancePlanned: 5000, totalTimePlanned: 0.43, structure: STRUCTURES.easyRun5km },
      { date: '2026-05-07', title: 'Zwift race or bike on/off', workoutType: 2, description: `Zwift race OR bike on/off (RECOVERY WEEK — keep sharp)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  Option A: Zwift B/C category race (55min: 15 WU, 25 race @ 90-110% FTP [270-330W], 15 CD)\n  Option B: 90sec on/off x8 (85-95% FTP [255-285W] on / 50-60% [150-180W] off)\n\n  RECOVERY WEEK: bike keeps intensity alive without running stress.\n  Tue was easy strides — legs are fresh. Ride HARD on the bike.\n  This replaces running intensity during recovery weeks.`, totalTimePlanned: 0.92, structure: STRUCTURES.zwiftRace },
      { date: '2026-05-08', title: 'Yoga 40min', workoutType: 100, description: `Yoga / Mobility 40min\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Gentle flow + deep stretching\n  * Hip openers, hamstrings, foam rolling\n  * Recovery week: prioritize rest.`, totalTimePlanned: 0.67 },
      { date: '2026-05-08', title: 'Easy bike 45min', workoutType: 2, description: `Easy bike 45min Z1-Z2\n150-200W | HR <150`, totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },
      { date: '2026-05-09', title: 'Long run 12km easy (recovery)', workoutType: 3, description: `LONG RUN -- 12km EASY (RECOVERY)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Pace: 4:55/km (Z2)\n  * HR: <150 -- HARD CAP\n  * No fast finish. Pure easy. Step back.\n\n━━━━━━━━━━━━━━━━━━━━━━━━\nTOTAL: 12km | ~58min\nRecovery long run. If HR >150, walk.`, distancePlanned: 12000, totalTimePlanned: 0.97, tssPlanned: 55, structure: STRUCTURES.longRun12kmEasy },
      { date: '2026-05-10', title: 'Long ride 90min Z2', workoutType: 2, description: `Long ride 90min Z2\n168-227W | HR 146-156\nRecovery week ride. Steady, no surges.\nBlock 1 ends today. Block 2 starts tomorrow.`, totalTimePlanned: 1.5, structure: STRUCTURES.bikeEndurance90 },
    ],
  },
  // ═══════════════ BLOCK 2: Develop Speed (May 11 - Jun 7) ═══════════════
  {
    id: 'block-2-develop',
    number: 2,
    name: 'Develop Speed',
    phase: 'speed',
    startDate: '2026-05-11',
    endDate: '2026-06-07',
    stimulus: 'Extend speed to longer reps. 12x400m@84-86, 6x800m cruise, 5x1km@3:36-3:40, recovery 6x400m+4x200m. Thursday COMPLEMENTS Tuesday: sprint fartlek after short speed, neuromuscular sprints after threshold, tempo fartlek after 1km reps, bike on recovery. Long runs reach 20km with fast finish.',
    goals: [
      '6x1km @ 3:40-3:44 (100-102%) -- transition to threshold pace',
      '5x1km @ 3:36-3:40 (102-104%) -- near 10K race pace',
      '4x1.5km @ 3:40-3:44 -- longer cruise reps (his strong suit)',
      '6x800m cruise @ 3:36-3:40 -- FIRST 800m reps (recovery week)',
      'Long runs: 18km → 18km+FF → 20km → 14km (recovery)',
      'Bike on/off, fartlek 8x3min, over-under as second intensity',
    ],
    successMetrics: [
      '5x1km @ 3:36-3:40 with HR <180 on last rep',
      '4x1.5km cruise all within 3:40-3:44 window',
      '6x800m cruise completed (first ever 800m reps)',
      'Long run 20km completed at Z2 HR <160',
    ],
    weekPattern: 'Mon easy bike | Tue AM TRACK (WU/MAIN/CD) + PM Gym | Wed easy 7km+strides | Thu BIKE or FARTLEK (alternating) | Fri yoga+bike | Sat long run | Sun long ride',
    restrictions: [
      'Week 8 is recovery — first 800m reps at cruise pace, easy bike Thu, shorter long run',
      'Thursday complements Tue: wk5 sprint fartlek (Tue short speed), wk6 sprint fartlek (Tue threshold), wk7 tempo fartlek (Tue 1km), wk8 bike (recovery)',
      'Fartlek = continuous run, NO stopping between reps',
      'Thursday principle: different energy system to Tuesday — sprints after threshold, tempo after speed',
    ],
    sessions: [
      // ============ WEEK 5 (May 11-17) — 1km reps begin ============
      { date: '2026-05-11', title: 'Easy bike 60min Z2', workoutType: 2, description: `Easy bike 60min Z2\n168-227W | HR 146-156\nFirst day of Block 2.`, totalTimePlanned: 1.0, structure: STRUCTURES.easyBike60 },
      { date: '2026-05-12', title: 'TRACK WU', workoutType: 3, description: `WARM-UP (25-30min)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 3km easy jog (HR <145)\n  * Dynamic drills 5min\n  * 5x 100m strides (90s walk back)\n  * 2min settle`, distancePlanned: 3500, totalTimePlanned: 0.45, structure: STRUCTURES.keyWarmup },
      { date: '2026-05-12', title: 'TRACK MAIN: 12x400m @ 84-86sec', workoutType: 3, description: `MAIN SET -- 12x 400m (VOLUME UP AT 5K PACE ZONE)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Target pace: 3:36-3:41/km (102-104%) -- 86-88sec per 400m\n  * HR target: 170-178 bpm (Z4-Z5a) by rep 6-12\n  * Recovery: 200m jog (~50-60sec)\n  * Effort: 7.5/10\n  * Total quality: 4.8km at pace\n\n  VOLUME UP at 5K pace zone. 12 reps.\n  You've done 10x400m and 8x400m — now extend the set.\n  First 4 = rhythm. Middle 4 = hold. Last 4 = finish strong.\n  Metronomic: all reps within 84-86sec window.\n\nBAILOUT: If HR >180 OR pace >88sec on 2 consecutive reps, STOP.`, distancePlanned: 4800, totalTimePlanned: 0.4, tssPlanned: 60, structure: STRUCTURES.mainTrack12x400m },
      { date: '2026-05-12', title: 'TRACK CD', workoutType: 3, description: `COOL-DOWN (10-12min)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 2km easy jog 5:30+/km\n  * 3min walk + stretch`, distancePlanned: 2000, totalTimePlanned: 0.2, structure: STRUCTURES.keyCooldown },
      { date: '2026-05-12', title: 'PM Gym', workoutType: 9, description: `Gym 45min -- Strength + explosive\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Back squats 3x5 (heavy)\n  * Romanian deadlifts 3x8\n  * Bounding 3x6\n  * Box jumps 3x5\n  * Plank 3x45sec\n  * Copenhagen plank 3x20sec/side`, totalTimePlanned: 0.75 },
      { date: '2026-05-13', title: 'Easy 7km + strides', workoutType: 3, description: `Easy run 7km + 4x100m strides\nPace: 5:00-5:10/km | HR <150 | Max 40min`, distancePlanned: 7000, totalTimePlanned: 0.65, structure: STRUCTURES.easyRunStrides7km },
      { date: '2026-05-14', title: 'Fartlek 10km sprint (8x30sec)', workoutType: 3, description: `FARTLEK — 10km (8×30sec sprint)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 3km warm-up @ 5:00/km\n  * 8× (30sec HARD @ 3:15-3:25/km / 90sec easy jog)\n    — SPRINT effort. Fast turnover. Like 200m strides but inside a continuous run.\n    — HR: spikes to 175+ briefly, drops between\n  * 2km cool-down\n\nCOMPLEMENTS TUESDAY: Tue was 12×400m short speed. Today is SHORT SPRINT fartlek — neuromuscular speed, not endurance. Different energy system.\nCONTINUOUS — do not stop.`, distancePlanned: 10000, totalTimePlanned: 0.83, structure: STRUCTURES.fartlekSprint8x30 },
      { date: '2026-05-15', title: 'Yoga 40min', workoutType: 100, description: `Yoga / Mobility 40min\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Hip openers, hamstrings, foam rolling\n  * Focus on hip mobility post-bike intensity.`, totalTimePlanned: 0.67 },
      { date: '2026-05-15', title: 'Easy bike 45min', workoutType: 2, description: `Easy bike 45min Z1-Z2\n150-200W | HR <150`, totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },
      { date: '2026-05-16', title: 'Long run 18km easy', workoutType: 3, description: `LONG RUN -- 18km EASY\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Pace: 4:45/km (Z2)\n  * HR: <155 -- HARD CAP\n  * No fast finish. Pure easy.\n\n━━━━━━━━━━━━━━━━━━━━━━━━\nTOTAL: 18km | ~1h21\nBuilding distance. 12→14→16→18.`, distancePlanned: 18000, totalTimePlanned: 1.35, tssPlanned: 85, structure: STRUCTURES.longRun18kmEasy },
      { date: '2026-05-17', title: 'Long ride 2hrs Z2', workoutType: 2, description: `Long ride 2hrs Z2\n168-227W | HR 146-156\nSteady aerobic endurance.`, totalTimePlanned: 2.0, structure: STRUCTURES.longRide120 },

      // ============ WEEK 6 (May 18-24) ============
      { date: '2026-05-18', title: 'Easy bike 60min Z2', workoutType: 2, description: `Easy bike 60min Z2\n168-227W | HR 146-156`, totalTimePlanned: 1.0, structure: STRUCTURES.easyBike60 },
      { date: '2026-05-19', title: 'TRACK WU', workoutType: 3, description: `WARM-UP (25-30min)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 3km easy jog (HR <145)\n  * Dynamic drills 5min\n  * 5x 100m strides (90s walk back)\n  * 2min settle`, distancePlanned: 3500, totalTimePlanned: 0.45, structure: STRUCTURES.keyWarmup },
      { date: '2026-05-19', title: 'TRACK MAIN: 6x800m @ 2:52-2:56', workoutType: 3, description: `MAIN SET -- 6x 800m CRUISE (EXTEND SPEED TO 800m)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Target pace: 3:36-3:41/km (102-104%) -- 2:53-2:57 per 800m\n  * HR target: 170-178 bpm (Z4-Z5a) by rep 4-6\n  * Recovery: 400m jog (~90sec)\n  * Effort: 7.5/10\n  * Total quality: 4.8km at pace\n\n  EXTEND speed from 400m to 800m. Same effort as your 400s.\n  You've built the speed foundation — now hold it longer.\n  First structured 800m track reps. Learn the rhythm.\n  Smooth, efficient running. Don't force the pace.\n\nBAILOUT: If HR >180 OR pace collapses on 2 consecutive reps, STOP.`, distancePlanned: 4800, totalTimePlanned: 0.38, tssPlanned: 60, structure: STRUCTURES.mainTrack6x800mCruise },
      { date: '2026-05-19', title: 'TRACK CD', workoutType: 3, description: `COOL-DOWN (10-12min)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 2km easy jog 5:30+/km\n  * 3min walk + stretch`, distancePlanned: 2000, totalTimePlanned: 0.2, structure: STRUCTURES.keyCooldown },
      { date: '2026-05-19', title: 'PM Gym', workoutType: 9, description: `Gym 45min -- Strength + explosive\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Front squats 3x5\n  * Hip thrusts 3x8\n  * Depth jumps 3x5\n  * Box jumps 3x5\n  * Plank 3x45sec\n  * Pallof press 3x10/side`, totalTimePlanned: 0.75 },
      { date: '2026-05-20', title: 'Easy 7km + strides', workoutType: 3, description: `Easy run 7km + 4x100m strides\nPace: 5:00-5:10/km | HR <150`, distancePlanned: 7000, totalTimePlanned: 0.65, structure: STRUCTURES.easyRunStrides7km },
      { date: '2026-05-21', title: 'Fartlek 10km sprint (10x30sec)', workoutType: 3, description: `FARTLEK — 10km (10×30sec sprint)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 3km warm-up @ 5:00/km\n  * 10× (30sec HARD @ 3:15-3:25/km / 90sec easy jog)\n    — SPRINT effort. Fast turnover. Neuromuscular speed work.\n    — HR: spikes to 175+ briefly, drops between\n  * 2km cool-down\n\nCOMPLEMENTS TUESDAY: Tue was 6×800m threshold cruise. Today is pure neuromuscular sprints — DIFFERENT energy system.\nCONTINUOUS — do not stop.`, distancePlanned: 10000, totalTimePlanned: 0.83, structure: STRUCTURES.fartlekSprint10x30 },
      { date: '2026-05-22', title: 'Yoga 40min', workoutType: 100, description: `Yoga / Mobility 40min\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Hip openers, hamstrings, foam rolling\n  * Extra attention to quads after over-under.`, totalTimePlanned: 0.67 },
      { date: '2026-05-22', title: 'Easy bike 45min', workoutType: 2, description: `Easy bike 45min Z1-Z2\n150-200W | HR <150`, totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },
      { date: '2026-05-23', title: 'Long run 18km + fast finish', workoutType: 3, description: `LONG RUN -- 18km WITH 3km FAST FINISH\n━━━━━━━━━━━━━━━━━━━━━━━━\nSEGMENT 1 -- km 1-15 (EASY)\n  * Pace: 4:45/km (Z2) | HR: <155\n\nSEGMENT 2 -- km 16-18 (FAST FINISH)\n  * Pace: 4:02-4:16/km (~88-93%) | HR: 155-165\n\n━━━━━━━━━━━━━━━━━━━━━━━━\nTOTAL: 18km | ~1h24\nFirst fast finish! Last 3km push. Shift gears, don't grind.`, distancePlanned: 18000, totalTimePlanned: 1.4, tssPlanned: 95, structure: STRUCTURES.longRun18kmFastFinish },
      { date: '2026-05-24', title: 'Long ride 2.5hrs Z2', workoutType: 2, description: `Long ride 2.5hrs Z2\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 168-227W | HR 146-156\n  * Longest ride of the block so far.\n  * Steady aerobic endurance. Fuel well.`, totalTimePlanned: 2.5, structure: STRUCTURES.longRide150 },

      // ============ WEEK 7 (May 25-31) — 16x400m at 5K pace zone ============
      { date: '2026-05-25', title: 'Easy bike 60min Z2', workoutType: 2, description: `Easy bike 60min Z2\n168-227W | HR 146-156`, totalTimePlanned: 1.0, structure: STRUCTURES.easyBike60 },
      { date: '2026-05-26', title: 'TRACK WU', workoutType: 3, description: `WARM-UP (25-30min)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 3km easy jog (HR <145)\n  * Dynamic drills 5min\n  * 5x 100m strides (90s walk back)\n  * 2min settle`, distancePlanned: 3500, totalTimePlanned: 0.45, structure: STRUCTURES.keyWarmup },
      { date: '2026-05-26', title: 'TRACK MAIN: 5x1km @ 3:36-3:40', workoutType: 3, description: `MAIN SET -- 5x 1km (EXTEND TO 1km)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Target pace: 3:36-3:41/km (102-104%) -- near 10K pace\n  * HR target: 170-178 bpm (Z4-Z5a) by rep 3-5\n  * Recovery: 400m jog (~90sec)\n  * Effort: 8/10\n  * Total quality: 5km at pace\n\n  EXTEND speed to 1km. Same effort as your 800m reps.\n  You've built 200m → 400m → 800m. Now hold it for 1km.\n  Your Oct data: 6x1km at 3:34-3:37. This is the doorstep.\n  Smooth, efficient running. Negative split the set.\n\nBAILOUT: If HR >180 OR pace collapses on 2 consecutive reps, STOP.`, distancePlanned: 5000, totalTimePlanned: 0.38, tssPlanned: 65, structure: STRUCTURES.mainCruise5x1km104 },
      { date: '2026-05-26', title: 'TRACK CD', workoutType: 3, description: `COOL-DOWN (10-12min)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 2km easy jog 5:30+/km\n  * 3min walk + stretch`, distancePlanned: 2000, totalTimePlanned: 0.2, structure: STRUCTURES.keyCooldown },
      { date: '2026-05-26', title: 'PM Gym (heavy + plyo)', workoutType: 9, description: `Gym 50min -- Heavy strength + plyometrics\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Front squats 4x4 (heaviest of block)\n  * Hip thrusts 3x8\n  * Depth jumps 3x5\n  * Broad jumps 3x5\n  * Plank 3x50sec\n  * Dead bug 3x12/side\n\nPeak gym session of Block 2.`, totalTimePlanned: 0.83 },
      { date: '2026-05-27', title: 'Easy 7km + strides', workoutType: 3, description: `Easy run 7km + 4x100m strides\nPace: 5:00-5:10/km | HR <150`, distancePlanned: 7000, totalTimePlanned: 0.65, structure: STRUCTURES.easyRunStrides7km },
      { date: '2026-05-28', title: 'Fartlek 11km tempo (3x4min)', workoutType: 3, description: `FARTLEK — 11km (3×4min tempo)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 3km warm-up @ 5:00/km\n  * 3× (4min @ 3:48-3:55/km sub-threshold / 2min easy jog)\n    — Sub-threshold effort. Should feel "comfortably hard."\n    — HR: 162-170\n  * 2km cool-down\n\nCOMPLEMENTS TUESDAY: Tue was 5×1km at race-pace threshold. Today is sub-threshold tempo — DIFFERENT pace zone.\nCONTINUOUS — do not stop.`, distancePlanned: 11000, totalTimePlanned: 0.92, structure: STRUCTURES.fartlekTempo3x4min },
      { date: '2026-05-29', title: 'Yoga 40min', workoutType: 100, description: `Yoga / Mobility 40min\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Hip openers, hamstrings, foam rolling\n  * Recovery prep before peak long run.`, totalTimePlanned: 0.67 },
      { date: '2026-05-29', title: 'Easy bike 45min', workoutType: 2, description: `Easy bike 45min Z1-Z2\n150-200W | HR <150`, totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },
      { date: '2026-05-30', title: 'Long run 20km easy', workoutType: 3, description: `LONG RUN -- 20km EASY\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Pace: 4:40/km (Z2)\n  * HR: <160 -- HARD CAP\n  * No fast finish. Pure easy.\n\n━━━━━━━━━━━━━━━━━━━━━━━━\nTOTAL: 20km | ~1h33\nFirst 20km since marathon! Respect the distance. No heroics.`, distancePlanned: 20000, totalTimePlanned: 1.55, tssPlanned: 100, structure: STRUCTURES.longRun20kmEasy },
      { date: '2026-05-31', title: 'Long ride 2.5hrs Z2 + Z3 surges', workoutType: 2, description: `Long ride 2.5hrs Z2 + 3x5min Z3\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Main: Z2 endurance 168-227W\n  * Include 3x 5min Z3 surges (228-255W) spread throughout\n  * Builds aerobic power on long ride\n  * Total: ~2.5hrs`, totalTimePlanned: 2.5, structure: STRUCTURES.longRide150Z3 },

      // ============ WEEK 8 (Jun 1-7) — Recovery ============
      { date: '2026-06-01', title: 'Easy bike 45min', workoutType: 2, description: `Easy bike 45min Z1\n<167W | HR <145\nRecovery week.`, totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },
      { date: '2026-06-02', title: 'TRACK WU', workoutType: 3, description: `WARM-UP (25-30min)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 3km easy jog (HR <145)\n  * Dynamic drills 5min\n  * 5x 100m strides (90s walk back)\n  * 2min settle\n\nRecovery -- sharp and short.`, distancePlanned: 3500, totalTimePlanned: 0.45, structure: STRUCTURES.keyWarmup },
      { date: '2026-06-02', title: 'TRACK MAIN: 6x400m + 4x200m (recovery)', workoutType: 3, description: `MAIN SET -- 6x 400m + 4x 200m (RECOVERY — sharp but short)\n━━━━━━━━━━━━━━━━━━━━━━━━\nSET 1: 6x 400m @ 3:26-3:30/km (107-109%) -- 82-84sec per 400m\n  * Recovery: 200m jog (~50sec)\n\nSET 2: 4x 200m @ 3:08-3:16/km (115-120%) -- 37-39sec per 200m\n  * Recovery: 200m walk/jog (~45-55sec)\n\n  * Total quality: 3.2km\n  * Recovery week: sharp but SHORT. Keep the speed stimulus alive.\n  * Don't grind — leave feeling electric, not tired.\n\nBAILOUT: If heavy, cut to 4x400m + 2x200m.`, distancePlanned: 3200, totalTimePlanned: 0.3, tssPlanned: 40, structure: STRUCTURES.mainTrack6x400m6x200m },
      { date: '2026-06-02', title: 'TRACK CD', workoutType: 3, description: `COOL-DOWN (10-12min)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 2km easy jog 5:30+/km\n  * 3min walk + stretch`, distancePlanned: 2000, totalTimePlanned: 0.2, structure: STRUCTURES.keyCooldown },
      { date: '2026-06-02', title: 'PM Gym (lighter)', workoutType: 9, description: `Gym 30min -- Light maintenance\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Bodyweight squats 2x10\n  * Glute bridges 2x12\n  * Plank 2x40sec\n  * Dead bug 2x8/side\n\nRecovery week. Light only.`, totalTimePlanned: 0.5 },
      { date: '2026-06-03', title: 'Easy 5km', workoutType: 3, description: `Easy run 5km\nPace: 5:15/km | HR <150\nVery easy. Recovery week.`, distancePlanned: 5000, totalTimePlanned: 0.43, structure: STRUCTURES.easyRun5km },
      { date: '2026-06-04', title: 'Bike on/off or Zwift race', workoutType: 2, description: `Bike on/off 90s x8 OR Zwift race (RECOVERY — bike intensity)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  Option A: 8x (90sec ON @ 85-95% FTP [255-285W] / 90sec OFF @ 50-60% [150-180W])\n  Option B: Zwift B/C race (55min: 15 WU, 25 race @ 90-110% FTP, 15 CD)\n\n  RECOVERY WEEK: bike keeps intensity alive.\n  Tue was short/sharp recovery track → Thu ride HARD on the bike.\n  No running stress. All intensity on two wheels.`, totalTimePlanned: 0.92, structure: STRUCTURES.bikeOnOff90 },
      { date: '2026-06-05', title: 'Yoga 40min', workoutType: 100, description: `Yoga / Mobility 40min\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Gentle flow. Deep stretching.\n  * Recovery week: no bike today.`, totalTimePlanned: 0.67 },
      { date: '2026-06-06', title: 'Long run 14km easy (recovery)', workoutType: 3, description: `LONG RUN -- 14km EASY (RECOVERY)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Pace: 4:55/km (Z2) | HR: <150\n  * No fast finish. Pure easy.\n\n━━━━━━━━━━━━━━━━━━━━━━━━\nTOTAL: 14km | ~1h08\nRecovery week. Step back.`, distancePlanned: 14000, totalTimePlanned: 1.13, tssPlanned: 65, structure: STRUCTURES.longRun14kmEasy },
      { date: '2026-06-07', title: 'Long ride 90min Z2', workoutType: 2, description: `Long ride 90min Z2\n168-227W | HR 146-156\nRecovery week ride. Block 2 ends.`, totalTimePlanned: 1.5, structure: STRUCTURES.bikeEndurance90 },
    ],
  },
  // ═══════════════ BLOCK 3: Race-Specific Sharpening (Jun 8 - Jul 5) ═══════════════
  {
    id: 'block-3-sharpen',
    number: 3,
    name: 'Race-Specific Sharpening',
    phase: 'speed',
    startDate: '2026-06-08',
    endDate: '2026-07-05',
    stimulus: 'Race-specific sharpening. 6x1km@3:32-3:36 faster reps, 16x400m@82-84 overspeed volume, 6x1km at GOAL 5K pace (key assessment), 3x1km assessment. Thursday COMPLEMENTS Tuesday: sprint fartlek after 1km cruise, bike when Tue VERY hard (16x400/PEAK), neuromuscular speed after KEY assessment. Long runs peak at 22km with fast finish.',
    goals: [
      '5x1km @ 3:32-3:36 (103-105%) -- pushing toward 5K pace',
      '12x400m @ 84-86sec -- FIRST 400m reps! (athlete now ready, week 10)',
      '6x1km @ 3:30-3:34 (105-107%) -- at GOAL 5K pace (the key assessment)',
      '3x1km @ 3:28-3:30 assessment (race readiness check)',
      'Long run peak: 22km with 4km fast finish',
    ],
    successMetrics: [
      '12x400m all within 84-86sec on first attempt',
      '6x1km @ 3:30-3:34 controlled — this confirms sub-17:30 is ON',
      '3x1km assessment feeling smooth at 3:28-3:30',
      'Long run 22km completed with strong fast finish',
    ],
    weekPattern: 'Mon easy bike | Tue AM TRACK (WU/MAIN/CD) + PM Gym | Wed easy 7km+strides | Thu FARTLEK or BIKE (alternating) | Fri yoga+bike | Sat long run | Sun long ride',
    restrictions: [
      'Week 12 is recovery/assessment -- lighter everything, bike on Thu',
      'Thursday complements Tue: wk9 sprint fartlek (Tue 1km cruise), wk10 bike (Tue VERY hard 16x400), wk11 sprint 8x20sec (Tue KEY assessment), wk12 bike (recovery)',
      'Fartlek = continuous run, NO stopping between reps',
      'Thursday principle: different energy system to Tuesday — sprints after threshold, bike after PEAK sessions',
    ],
    sessions: [
      // ============ WEEK 9 (Jun 8-14) — 4x1200m + 4x400m ============
      { date: '2026-06-08', title: 'Easy bike 60min Z2', workoutType: 2, description: `Easy bike 60min Z2\n168-227W | HR 146-156\nFirst day of Block 3.`, totalTimePlanned: 1.0, structure: STRUCTURES.easyBike60 },
      { date: '2026-06-09', title: 'TRACK WU', workoutType: 3, description: `WARM-UP (25-30min)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 3km easy jog (HR <145)\n  * Dynamic drills 5min\n  * 5x 100m strides (90s walk back)\n  * 2min settle`, distancePlanned: 3500, totalTimePlanned: 0.45, structure: STRUCTURES.keyWarmup },
      { date: '2026-06-09', title: 'TRACK MAIN: 6x1km @ 3:32-3:36', workoutType: 3, description: `MAIN SET -- 6x 1km (FASTER 1km REPS)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Target pace: 3:34-3:38/km (103-105%) -- approaching 5K pace\n  * HR target: 172-180 bpm (Z5a) by rep 4-6\n  * Recovery: 400m jog (~90sec)\n  * Effort: 8/10\n  * Total quality: 6km at pace\n\n  FASTER 1km reps. Approaching 5K pace.\n  Your fastest 1km: 3:34 at HR 172. We're targeting 3:34-3:38.\n  6 reps (up from 5 last week) — building both pace AND volume.\n  Metronomic: all reps within the window.\n\nBAILOUT: If HR >182 OR pace collapses on 2 consecutive reps, STOP.`, distancePlanned: 6000, totalTimePlanned: 0.45, tssPlanned: 75, structure: STRUCTURES.mainTrack6x1km },
      { date: '2026-06-09', title: 'TRACK CD', workoutType: 3, description: `COOL-DOWN (10-12min)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 2km easy jog 5:30+/km\n  * 3min walk + stretch`, distancePlanned: 2000, totalTimePlanned: 0.2, structure: STRUCTURES.keyCooldown },
      { date: '2026-06-09', title: 'PM Gym', workoutType: 9, description: `Gym 45min -- Strength + explosive\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Front squats 3x5\n  * Hip thrusts 3x8\n  * Depth jumps 3x5\n  * Box jumps 3x5\n  * Plank 3x45sec\n  * Pallof press 3x10/side`, totalTimePlanned: 0.75 },
      { date: '2026-06-10', title: 'Easy 7km + strides', workoutType: 3, description: `Easy run 7km + 4x100m strides\nPace: 5:00-5:10/km | HR <150`, distancePlanned: 7000, totalTimePlanned: 0.65, structure: STRUCTURES.easyRunStrides7km },
      { date: '2026-06-11', title: 'Fartlek 10km sprint (10x30sec)', workoutType: 3, description: `FARTLEK — 10km (10×30sec sprint)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 3km warm-up @ 5:00/km\n  * 10× (30sec HARD @ 3:10-3:20/km / 90sec easy jog)\n    — SPRINT effort. Faster than Block 1 sprints. Pure neuromuscular.\n    — HR: spikes to 178+ briefly, drops between\n  * 2km cool-down\n\nCOMPLEMENTS TUESDAY: Tue was 6×1km threshold cruise. Today is neuromuscular sprint — DIFFERENT energy system.\nCONTINUOUS — do not stop.`, distancePlanned: 10000, totalTimePlanned: 0.83, structure: STRUCTURES.fartlekSprint10x30fast },
      { date: '2026-06-12', title: 'Yoga 40min', workoutType: 100, description: `Yoga / Mobility 40min\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Hip openers, hamstrings, foam rolling`, totalTimePlanned: 0.67 },
      { date: '2026-06-12', title: 'Easy bike 45min', workoutType: 2, description: `Easy bike 45min Z1-Z2\n150-200W | HR <150`, totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },
      { date: '2026-06-13', title: 'Long run 20km + fast finish', workoutType: 3, description: `LONG RUN -- 20km WITH 3km FAST FINISH\n━━━━━━━━━━━━━━━━━━━━━━━━\nSEGMENT 1 -- km 1-17 (EASY)\n  * Pace: 4:40/km (Z2) | HR: <160\n\nSEGMENT 2 -- km 18-20 (FAST FINISH)\n  * Pace: 4:02-4:16/km (~88-93%) | HR: 158-168\n\n━━━━━━━━━━━━━━━━━━━━━━━━\nTOTAL: 20km | ~1h33\nSub-threshold finish on tired legs.`, distancePlanned: 20000, totalTimePlanned: 1.55, tssPlanned: 110, structure: STRUCTURES.longRun20kmFastFinish },
      { date: '2026-06-14', title: 'Long ride 2.5hrs Z2', workoutType: 2, description: `Long ride 2.5hrs Z2\n168-227W | HR 146-156\nSteady endurance. No surges (save legs for track Tue).`, totalTimePlanned: 2.5, structure: STRUCTURES.longRide150 },

      // ============ WEEK 10 (Jun 15-21) — 20x400m KIPCHOGE SESSION ============
      { date: '2026-06-15', title: 'Easy bike 60min Z2', workoutType: 2, description: `Easy bike 60min Z2\n168-227W | HR 146-156`, totalTimePlanned: 1.0, structure: STRUCTURES.easyBike60 },
      { date: '2026-06-16', title: 'TRACK WU', workoutType: 3, description: `WARM-UP (25-30min)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 3km easy jog (HR <145)\n  * Dynamic drills 5min\n  * 5x 100m strides (90s walk back)\n  * 2min settle\n\nTHE session today. Be ready.`, distancePlanned: 3500, totalTimePlanned: 0.45, structure: STRUCTURES.keyWarmup },
      { date: '2026-06-16', title: 'TRACK MAIN: 16x400m @ 84-86sec', workoutType: 3, description: `MAIN SET -- 16x 400m (HIGH-VOLUME OVERSPEED)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Target pace: 3:30-3:34/km (105-107%) -- 84-86sec per 400m\n  * HR target: 178-185 bpm (Z5a-Z5b) by rep 8-16\n  * Recovery: 200m jog (~45-55sec) -- shorter rest\n  * Effort: 8.5/10\n  * Total quality: 6.4km at overspeed\n\n  HIGH-VOLUME 400s at overspeed. 16 reps.\n  You've done 12x400m at 84-86sec — now faster AND more.\n  First 4 = rhythm. Middle 8 = hold. Last 4 = character.\n  Metronomic: all within 84-86sec window.\n\nBAILOUT: If HR >186 OR pace >88sec on 2 consecutive reps, STOP.`, distancePlanned: 6400, totalTimePlanned: 0.5, tssPlanned: 80, structure: STRUCTURES.mainTrack16x400m },
      { date: '2026-06-16', title: 'TRACK CD', workoutType: 3, description: `COOL-DOWN (10-12min)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 2km easy jog 5:30+/km\n  * 3min walk + stretch`, distancePlanned: 2000, totalTimePlanned: 0.2, structure: STRUCTURES.keyCooldown },
      { date: '2026-06-16', title: 'PM Gym', workoutType: 9, description: `Gym 45min -- Strength + explosive\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Front squats 3x5\n  * Hip thrusts 3x8\n  * Box jumps 3x5\n  * Plank 3x45sec\n  * Dead bug 3x10/side`, totalTimePlanned: 0.75 },
      { date: '2026-06-17', title: 'Easy 7km + strides', workoutType: 3, description: `Easy run 7km + 4x100m strides\nPace: 5:00-5:10/km | HR <150`, distancePlanned: 7000, totalTimePlanned: 0.65, structure: STRUCTURES.easyRunStrides7km },
      { date: '2026-06-18', title: 'Bike cadence drills 60min', workoutType: 2, description: `Bike cadence drills -- 60min (Tue VERY hard 16x400 → Thu easy bike)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 10min warm-up @ 50-65% FTP (150-195W)\n  * 4x (3min high-cadence 100+ rpm @ 60-70% FTP [180-210W] / 5min Z2 spin)\n  * 10min Z2 steady @ 60-70% FTP\n  * 6min cool-down\n  * Total: ~60min\n\n  Tue was VERY HARD 16x400m → Thu MUST be easy.\n  Cadence drills: neuromuscular work, zero stress.\n  High RPM teaches smooth pedal stroke without load.\n  Legs recover while staying active.`, totalTimePlanned: 1.0, structure: STRUCTURES.bikeCadenceDrills },
      { date: '2026-06-19', title: 'Yoga 40min', workoutType: 100, description: `Yoga / Mobility 40min\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Hip openers, hamstrings, foam rolling`, totalTimePlanned: 0.67 },
      { date: '2026-06-19', title: 'Easy bike 45min', workoutType: 2, description: `Easy bike 45min Z1-Z2\n150-200W | HR <150`, totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },
      { date: '2026-06-20', title: 'Long run 22km steady', workoutType: 3, description: `LONG RUN -- 22km STEADY (NO FAST FINISH)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Pace: 4:30/km (Z2) | HR: <160\n  * No fast finish this week. Honest volume after 20x400m.\n\n━━━━━━━━━━━━━━━━━━━━━━━━\nTOTAL: 22km | ~1h39`, distancePlanned: 22000, totalTimePlanned: 1.65, tssPlanned: 115, structure: STRUCTURES.longRun22kmSteady },
      { date: '2026-06-21', title: 'Long ride 2.5hrs Z2', workoutType: 2, description: `Long ride 2.5hrs Z2\n168-227W | HR 146-156\nSteady endurance.`, totalTimePlanned: 2.5, structure: STRUCTURES.longRide150 },

      // ============ WEEK 11 (Jun 22-28) — Peak + 24km ============
      { date: '2026-06-22', title: 'Easy bike 60min Z2', workoutType: 2, description: `Easy bike 60min Z2\n168-227W | HR 146-156`, totalTimePlanned: 1.0, structure: STRUCTURES.easyBike60 },
      { date: '2026-06-23', title: 'TRACK WU', workoutType: 3, description: `WARM-UP (25-30min)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 3km easy jog (HR <145)\n  * Dynamic drills 5min\n  * 5x 100m strides (90s walk back)\n  * 2min settle`, distancePlanned: 3500, totalTimePlanned: 0.45, structure: STRUCTURES.keyWarmup },
      { date: '2026-06-23', title: 'TRACK MAIN: 6x1km @ 3:30-3:34', workoutType: 3, description: `MAIN SET -- 6x 1km AT GOAL 5K PACE (KEY ASSESSMENT)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Target pace: 3:30-3:34/km (105-107%) -- GOAL 5K PACE\n  * HR target: 175-182 bpm (Z5a-Z5b) by rep 4-6\n  * Recovery: 400m jog (~90sec)\n  * Effort: 8.5/10\n  * Total quality: 6km at 5K pace\n\n  THE KEY ASSESSMENT: 6x1km at your 5K goal pace.\n  If you can hold 3:30-3:34 for 6 reps, sub-17:30 is ON.\n  Your fastest 1km: 3:34 at HR 172 (Oct). Now you need\n  6 of them in a row.\n  Metronomic. Every rep within 2 seconds.\n\nBAILOUT: If HR >184 OR pace >3:36 on 2 consecutive reps, STOP.`, distancePlanned: 6000, totalTimePlanned: 0.45, tssPlanned: 80, structure: STRUCTURES.mainTrack6x1km5kPace },
      { date: '2026-06-23', title: 'TRACK CD', workoutType: 3, description: `COOL-DOWN (10-12min)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 2km easy jog 5:30+/km\n  * 3min walk + stretch`, distancePlanned: 2000, totalTimePlanned: 0.2, structure: STRUCTURES.keyCooldown },
      { date: '2026-06-23', title: 'PM Gym', workoutType: 9, description: `Gym 45min -- Strength + explosive\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Front squats 3x5\n  * Hip thrusts 3x8\n  * Depth jumps 3x5\n  * Box jumps 3x5\n  * Plank 3x45sec\n  * Pallof press 3x10/side`, totalTimePlanned: 0.75 },
      { date: '2026-06-24', title: 'Easy 7km + strides', workoutType: 3, description: `Easy run 7km + 4x100m strides\nPace: 5:00-5:10/km | HR <150`, distancePlanned: 7000, totalTimePlanned: 0.65, structure: STRUCTURES.easyRunStrides7km },
      { date: '2026-06-25', title: 'Fartlek 10km sprint (8x20sec)', workoutType: 3, description: `FARTLEK — 10km (8×20sec FAST sprint)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 3km warm-up @ 5:00/km\n  * 8× (20sec FAST @ 3:00-3:10/km / 2min easy jog)\n    — PURE SPEED. Very short, very fast. Like flying 100m strides inside a continuous run.\n    — HR: brief spikes to 175+, full recovery between\n  * 2km cool-down\n\nCOMPLEMENTS TUESDAY: Tue was KEY 6×1km 5K pace assessment. Today is pure neuromuscular speed (not threshold) — DIFFERENT system. Very short reps protect legs after KEY session.\nCONTINUOUS — do not stop.`, distancePlanned: 10000, totalTimePlanned: 0.83, structure: STRUCTURES.fartlekSprint8x20 },
      { date: '2026-06-26', title: 'Yoga 40min', workoutType: 100, description: `Yoga / Mobility 40min\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Hip openers, hamstrings, foam rolling`, totalTimePlanned: 0.67 },
      { date: '2026-06-26', title: 'Easy bike 45min', workoutType: 2, description: `Easy bike 45min Z1-Z2\n150-200W | HR <150`, totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },
      { date: '2026-06-27', title: 'Long run 22km + fast finish', workoutType: 3, description: `LONG RUN -- 22km WITH 4km FAST FINISH (PEAK)\n━━━━━━━━━━━━━━━━━━━━━━━━\nSEGMENT 1 -- km 1-18 (EASY)\n  * Pace: 4:35/km (Z2) | HR: <160\n\nSEGMENT 2 -- km 19-22 (FAST FINISH)\n  * Pace: 3:57-4:10/km (~90-95%) | HR: 160-170\n\n━━━━━━━━━━━━━━━━━━━━━━━━\nTOTAL: 22km | ~1h47\nPEAK long run with quality. Last 4km strong.`, distancePlanned: 22000, totalTimePlanned: 1.78, tssPlanned: 125, structure: STRUCTURES.longRun22kmFastFinish },
      { date: '2026-06-28', title: 'Long ride 2.5hrs Z2', workoutType: 2, description: `Long ride 2.5hrs Z2\n168-227W | HR 146-156\nSteady endurance.`, totalTimePlanned: 2.5, structure: STRUCTURES.longRide150 },

      // ============ WEEK 12 (Jun 29 - Jul 5) — Recovery + Assessment ============
      { date: '2026-06-29', title: 'Easy bike 45min', workoutType: 2, description: `Easy bike 45min Z1\n<167W | HR <145\nRecovery week.`, totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },
      { date: '2026-06-30', title: 'TRACK WU', workoutType: 3, description: `WARM-UP (25-30min)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 3km easy jog (HR <145)\n  * Dynamic drills 5min\n  * 5x 100m strides (90s walk back)\n  * 2min settle\n\nASSESSMENT: if controlled at 3:28-3:30, race in 3 weeks.`, distancePlanned: 3500, totalTimePlanned: 0.45, structure: STRUCTURES.keyWarmup },
      { date: '2026-06-30', title: 'TRACK MAIN: 3x1km @ 3:28-3:30 (assessment)', workoutType: 3, description: `MAIN SET -- 3x 1km @ 3:28-3:30 (ASSESSMENT)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Target pace: 3:28-3:32/km (106-108%)\n  * Recovery: 2:30 jog (400m) -- FULL recovery\n  * Effort: 7.5/10 -- controlled, not maximal\n  * Total quality: 3km\n  * ASSESSMENT: if this feels smooth and controlled, you are READY to race in 3 weeks.\n  * Do NOT chase faster. Race pace is the target. Save it for race day.\n\nIF STRUGGLING: reassess 5K target. This should feel manageable.`, distancePlanned: 3000, totalTimePlanned: 0.25, tssPlanned: 40, structure: STRUCTURES.mainTrack3x1kmAssess },
      { date: '2026-06-30', title: 'TRACK CD', workoutType: 3, description: `COOL-DOWN (10-12min)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 2km easy jog 5:30+/km\n  * 3min walk + stretch`, distancePlanned: 2000, totalTimePlanned: 0.2, structure: STRUCTURES.keyCooldown },
      { date: '2026-06-30', title: 'PM Gym (lighter)', workoutType: 9, description: `Gym 30min -- Light maintenance\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Bodyweight squats 2x10\n  * Glute bridges 2x12\n  * Plank 2x40sec\n\nRecovery/assessment week. Light only.`, totalTimePlanned: 0.5 },
      { date: '2026-07-01', title: 'Easy 5km', workoutType: 3, description: `Easy run 5km\nPace: 5:15/km | HR <150\nRecovery week. Short and easy.`, distancePlanned: 5000, totalTimePlanned: 0.43, structure: STRUCTURES.easyRun5km },
      { date: '2026-07-02', title: 'Zwift race / bike on-off', workoutType: 2, description: `Zwift race OR bike on/off 90s x8\n━━━━━━━━━━━━━━━━━━━━━━━━\n  Recovery week — keep sharp on the bike.\n  Option A: Zwift race (55min: 15 WU, 25 race @ 90-110% FTP, 15 CD)\n  Option B: 90sec on/off x8 (85-95% FTP on / 50-60% off)\n\n  Keep intensity alive without running legs.\n  Recovery for running, stimulus on bike.`, totalTimePlanned: 0.92, structure: STRUCTURES.bikeOnOff90 },
      { date: '2026-07-03', title: 'Yoga 40min', workoutType: 100, description: `Yoga / Mobility 40min\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Gentle flow. Recovery.`, totalTimePlanned: 0.67 },
      { date: '2026-07-04', title: 'Long run 16km easy (recovery)', workoutType: 3, description: `LONG RUN -- 16km EASY (RECOVERY)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Pace: 4:55/km (Z2) | HR: <150\n  * No fast finish. Pure easy.\n\n━━━━━━━━━━━━━━━━━━━━━━━━\nTOTAL: 16km | ~1h17\nRecovery week. Save energy for Block 4.`, distancePlanned: 16000, totalTimePlanned: 1.28, tssPlanned: 75, structure: STRUCTURES.longRun16kmEasyRecovery },
      { date: '2026-07-05', title: 'Long ride 2hrs Z2', workoutType: 2, description: `Long ride 2hrs Z2\n168-227W | HR 146-156\nBlock 3 ends. Block 4 starts tomorrow.`, totalTimePlanned: 2.0, structure: STRUCTURES.longRide120 },
    ],
  },
  // ═══════════════ BLOCK 4: Race + 10K Campaign (Jul 6 - Aug 23) ═══════════════
  {
    id: 'block-4-race',
    number: 4,
    name: 'Race + 10K Campaign',
    phase: 'speed',
    startDate: '2026-07-06',
    endDate: '2026-08-23',
    stimulus: '20x400m Kipchoge session (peak), 3km continuous race sim, 5K TT opener, 5K RACE Jul 25, post-TT recovery cruise, 4x2km THE 10K session, 10K taper, 10K RACE Aug 22.',
    goals: [
      '16x400m @ 82-84sec -- 400m volume UP (adapted from wk 10)',
      '3km continuous @ 3:30/km (race simulation)',
      '5K TT Jul 25: sub-17:30',
      '4x2km @ 3:36-3:40 -- THE 10K session',
      '10K TT Aug 22: sub-36:00',
    ],
    successMetrics: [
      '16x400m all within 82-84sec window',
      '3km continuous at 3:30 feeling controlled',
      '5K TT sub-17:30 (3:28/3:30/3:30/3:30/3:28 = 17:26)',
      '4x2km metronomic at 3:36-3:40',
      '10K TT sub-36:00 (3:34x8 + 3:32 + 3:28 = 35:52)',
    ],
    weekPattern: 'Mon easy bike | Tue AM TRACK (WU/MAIN/CD) + PM Gym | Wed easy 7km+strides | Thu FARTLEK or BIKE (complementing Tue) | Fri yoga+bike | Sat long run/RACE | Sun long ride',
    restrictions: [
      'Week 15 is 5K RACE WEEK -- Tue = opener, Thu = yoga only, Sat = RACE',
      'Week 19 is 10K RACE WEEK -- Tue = opener, Thu = yoga only, Sat = RACE',
      'No new training stimuli in race weeks',
      'Race week gym = activation only (very light)',
      'Thursday complements Tue: wk13 bike (PEAK 20x400), wk14 5K-specific fartlek (approaching TT), wk17 10K rhythm fartlek (approaching TT)',
    ],
    sessions: [
      // ============ WEEK 13 (Jul 6-12) — Race model ============
      { date: '2026-07-06', title: 'Easy bike 60min Z2', workoutType: 2, description: `Easy bike 60min Z2\n168-227W | HR 146-156`, totalTimePlanned: 1.0, structure: STRUCTURES.easyBike60 },
      { date: '2026-07-07', title: 'TRACK WU', workoutType: 3, description: `WARM-UP (25-30min)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 3km easy jog (HR <145)\n  * Dynamic drills 5min\n  * 5x 100m strides (90s walk back)\n  * 2min settle`, distancePlanned: 3500, totalTimePlanned: 0.45, structure: STRUCTURES.keyWarmup },
      { date: '2026-07-07', title: 'TRACK MAIN: 20x400m @ 81-83sec', workoutType: 3, description: `MAIN SET -- 20x 400m (THE KIPCHOGE SESSION — PEAK)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Target pace: 3:21-3:26/km (109-112%) -- 81-83sec per 400m\n  * HR target: 180-186 bpm (Z5b) by rep 10-20\n  * Recovery: 200m jog (~40-50sec) -- short rest\n  * Effort: 9/10\n  * Total quality: 8km at overspeed\n\n  THE KIPCHOGE SESSION. 20x400m. PEAK of the season.\n  This is the hardest track session of the entire plan.\n  First 5 = settle in. Middle 10 = HOLD. Last 5 = character test.\n  Metronomic: all within 81-83sec. No fading.\n  If you can do this, sub-17:30 is a certainty.\n\nBAILOUT: If HR >188 OR pace >85sec on 2 consecutive reps, STOP.`, distancePlanned: 8000, totalTimePlanned: 0.6, tssPlanned: 95, structure: STRUCTURES.mainTrack20x400m },
      { date: '2026-07-07', title: 'TRACK CD', workoutType: 3, description: `COOL-DOWN (10-12min)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 2km easy jog 5:30+/km\n  * 3min walk + stretch`, distancePlanned: 2000, totalTimePlanned: 0.2, structure: STRUCTURES.keyCooldown },
      { date: '2026-07-07', title: 'PM Gym', workoutType: 9, description: `Gym 45min -- Strength + explosive\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Front squats 3x5\n  * Hip thrusts 3x8\n  * Box jumps 3x5\n  * Depth jumps 3x5\n  * Plank 3x45sec\n  * Dead bug 3x10/side`, totalTimePlanned: 0.75 },
      { date: '2026-07-08', title: 'Easy 7km + strides', workoutType: 3, description: `Easy run 7km + 4x100m strides\nPace: 5:00-5:10/km | HR <150`, distancePlanned: 7000, totalTimePlanned: 0.65, structure: STRUCTURES.easyRunStrides7km },
      { date: '2026-07-09', title: 'Bike cadence drills 60min', workoutType: 2, description: `Bike cadence drills 60min\n4×3min high-cadence (100+ rpm) at Z2 power (60-70% FTP).\nNeuromuscular activation without any stress.\nTuesday was 20×400m — THE peak session. Legs must recover.\nEasy spinning with fast feet. Nothing more.`, totalTimePlanned: 1.0, structure: STRUCTURES.bikeCadenceDrills },
      { date: '2026-07-10', title: 'Yoga 40min', workoutType: 100, description: `Yoga / Mobility 40min\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Hip openers, hamstrings, foam rolling`, totalTimePlanned: 0.67 },
      { date: '2026-07-10', title: 'Easy bike 45min', workoutType: 2, description: `Easy bike 45min Z1-Z2\n150-200W | HR <150`, totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },
      { date: '2026-07-11', title: 'Long run 20km + fast finish', workoutType: 3, description: `LONG RUN -- 20km WITH 4km FAST FINISH\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * km 1-16 easy @ 4:35/km | HR <160\n  * km 17-20 @ 4:05/km | HR 158-168\n\n━━━━━━━━━━━━━━━━━━━━━━━━\nTOTAL: 20km | ~1h35`, distancePlanned: 20000, totalTimePlanned: 1.58, tssPlanned: 115, structure: STRUCTURES.longRun20kmFastFinish4_05 },
      { date: '2026-07-12', title: 'Long ride 2hrs Z2', workoutType: 2, description: `Long ride 2hrs Z2\n168-227W | HR 146-156`, totalTimePlanned: 2.0, structure: STRUCTURES.longRide120 },

      // ============ WEEK 14 (Jul 13-19) — Race simulation ============
      { date: '2026-07-13', title: 'Easy bike 60min Z2', workoutType: 2, description: `Easy bike 60min Z2\n168-227W | HR 146-156`, totalTimePlanned: 1.0, structure: STRUCTURES.easyBike60 },
      { date: '2026-07-14', title: 'TRACK WU', workoutType: 3, description: `WARM-UP (25-30min)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 3km easy jog (HR <145)\n  * Dynamic drills 5min\n  * 5x 100m strides (90s walk back)\n  * 2min settle\n\nRACE MODEL today: 3km continuous at 5K pace.`, distancePlanned: 3500, totalTimePlanned: 0.45, structure: STRUCTURES.keyWarmup },
      { date: '2026-07-14', title: 'TRACK MAIN: 3km continuous @ 3:30', workoutType: 3, description: `MAIN SET -- 3km CONTINUOUS @ 3:30/km (RACE MODEL)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 3km non-stop at 5K race pace: 3:28-3:32/km (106-108%)\n  * Time target: 10:24-10:36\n  * HR: builds to 178-182 by end\n  * Total quality: 3km\n  * RACE SIMULATION: run this like the middle 3km of your 5K.\n  * Even pace. No surging. Feel the rhythm.\n  * If this feels controlled, you are READY to race.\n\nIF STRUGGLING: reassess race target.`, distancePlanned: 3000, totalTimePlanned: 0.18, tssPlanned: 45, structure: STRUCTURES.mainTrack3kmContinuous },
      { date: '2026-07-14', title: 'TRACK CD', workoutType: 3, description: `COOL-DOWN (10-12min)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 2km easy jog 5:30+/km\n  * 3min walk + stretch`, distancePlanned: 2000, totalTimePlanned: 0.2, structure: STRUCTURES.keyCooldown },
      { date: '2026-07-14', title: 'PM Gym (light)', workoutType: 9, description: `Gym 35min -- Light\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Squats 2x8 (moderate)\n  * Glute bridges 2x12\n  * Plank 2x45sec\n  * Dead bug 2x10/side\n\nRace week approaching. Don't accumulate fatigue.`, totalTimePlanned: 0.58 },
      { date: '2026-07-15', title: 'Easy 7km + strides', workoutType: 3, description: `Easy run 7km + 4x100m strides\nPace: 5:00-5:10/km | HR <150`, distancePlanned: 7000, totalTimePlanned: 0.65, structure: STRUCTURES.easyRunStrides7km },
      { date: '2026-07-16', title: 'Fartlek 10km 5K-specific (6x90sec)', workoutType: 3, description: `FARTLEK — 10km (6×90sec 5K race-specific)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 3km warm-up @ 5:00/km\n  * 6× (90sec @ 3:28-3:32/km 5K race pace / 90sec easy jog)\n    — Race-specific effort. Practice holding 5K pace in surges.\n    — HR: 170-178 on hard portions\n  * 2km cool-down\n\nCOMPLEMENTS TUESDAY: Approaching 5K TT — both Tue (3km continuous) and Thu target race paces. Race-specific sharpening.\nCONTINUOUS — do not stop.`, distancePlanned: 10000, totalTimePlanned: 0.83, structure: STRUCTURES.fartlek5kSpecific6x90 },
      { date: '2026-07-17', title: 'Yoga 40min', workoutType: 100, description: `Yoga / Mobility 40min\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Hip openers, hamstrings, foam rolling`, totalTimePlanned: 0.67 },
      { date: '2026-07-17', title: 'Easy bike 45min', workoutType: 2, description: `Easy bike 45min Z1-Z2\n150-200W | HR <150`, totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },
      { date: '2026-07-18', title: 'Long run 16km easy (pre-taper)', workoutType: 3, description: `LONG RUN -- 16km EASY (PRE-TAPER)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Pace: 4:45/km (Z2) | HR: <155\n  * No fast finish. Easy and controlled.\n\n━━━━━━━━━━━━━━━━━━━━━━━━\nTOTAL: 16km | ~1h13`, distancePlanned: 16000, totalTimePlanned: 1.22, tssPlanned: 75, structure: STRUCTURES.longRun16kmEasyFlat },
      { date: '2026-07-19', title: 'Long ride 90min Z2', workoutType: 2, description: `Long ride 90min Z2\n168-227W | HR 146-156\nShorter ride. Pre-taper.`, totalTimePlanned: 1.5, structure: STRUCTURES.bikeEndurance90 },

      // ============ WEEK 15 (Jul 20-26) — 5K RACE WEEK ============
      { date: '2026-07-20', title: 'Easy bike 45min', workoutType: 2, description: `Easy bike 45min Z1\n<167W | HR <145\nRace week. Less is more.`, totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },
      { date: '2026-07-21', title: 'TRACK WU', workoutType: 3, description: `WARM-UP (20-25min)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 3km easy jog (HR <145)\n  * Dynamic drills 5min\n  * 5x 100m strides (90s walk back)\n  * 2min settle\n\nRace week opener. Sharp, electric.`, distancePlanned: 3500, totalTimePlanned: 0.4, structure: STRUCTURES.keyWarmup },
      { date: '2026-07-21', title: 'TRACK MAIN: 4x400m + 4x200m (opener)', workoutType: 3, description: `MAIN SET -- 4x400m @ 78sec + 4x200m @ 37sec (5K OPENER)\n━━━━━━━━━━━━━━━━━━━━━━━━\nSET 1: 4x 400m @ 3:11-3:17/km (114-118%) -- 77-79sec\n  * Recovery: FULL (200m walk/jog)\n\nSET 2: 4x 200m @ 2:57-3:08/km (120-127%) -- 35-37sec\n  * Recovery: FULL (200m walk/jog)\n\n  * Total quality: 2.4km. Sharp. Electric.\n  * NOT a workout. Neuromuscular primer for Saturday.\n  * Leave feeling FAST, not tired.`, distancePlanned: 2400, totalTimePlanned: 0.22, tssPlanned: 30, structure: STRUCTURES.mainTrackOpener5k },
      { date: '2026-07-21', title: 'TRACK CD', workoutType: 3, description: `COOL-DOWN (10min)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 2km easy jog\n  * Walk + stretch`, distancePlanned: 2000, totalTimePlanned: 0.17, structure: STRUCTURES.keyCooldown },
      { date: '2026-07-21', title: 'PM Gym (activation only)', workoutType: 9, description: `Gym 20min -- ACTIVATION ONLY\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Bodyweight squats 2x8\n  * Glute bridges 2x10\n  * Plank 1x30sec\n  * 3x broad jump (prime explosiveness)\n\nZero fatigue. Just wake up the muscles.`, totalTimePlanned: 0.33 },
      { date: '2026-07-22', title: 'Easy 4km + strides', workoutType: 3, description: `Easy 4km + 4x100m strides\nVery short. Legs loose. 5:10-5:20/km.\nStrides at 90%, walk-back. Trust the training.`, distancePlanned: 4000, totalTimePlanned: 0.35, structure: STRUCTURES.easyRun4kmStrides },
      { date: '2026-07-23', title: 'Yoga only (race week)', workoutType: 100, description: `Yoga 30min (RACE WEEK -- no bike intensity)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Gentle flow only\n  * Hip openers, light stretching\n  * No foam rolling (avoid soreness)\n  * Rest. Trust the taper.`, totalTimePlanned: 0.5 },
      { date: '2026-07-24', title: 'REST', workoutType: 100, description: `COMPLETE REST\n━━━━━━━━━━━━━━━━━━━━━━━━\nSleep well. Hydrate. Eat well.\nNo running. No gym. Light walk OK.`, totalTimePlanned: 0 },
      { date: '2026-07-25', title: '5K TIME TRIAL -- sub-17:30', workoutType: 3, description: `5K TIME TRIAL -- TARGET SUB-17:30\n━━━━━━━━━━━━━━━━━━━━━━━━\nWARM-UP (15min)\n  * 2km easy jog + drills + 3x100m at pace\n\nRACE -- 5km\n  * Target: 17:26 (3:28/3:30/3:30/3:30/3:28)\n  * Km 1: 3:28 -- CONTROLLED\n  * Km 2-3: 3:30 -- settle, rhythm\n  * Km 4: 3:30 -- the crucible. HOLD FORM.\n  * Km 5: 3:28 -- EVERYTHING LEFT\n\nCOOL-DOWN (10min)\n  * Easy jog + walk\n\n━━━━━━━━━━━━━━━━━━━━━━━━\nTHIS IS THE GOAL. Trust the block. Execute the plan.`, distancePlanned: 5000, totalTimePlanned: 0.5, tssPlanned: 65, structure: STRUCTURES.tt5k },
      { date: '2026-07-26', title: 'Recovery ride 60min', workoutType: 2, description: `Recovery ride 60min Z1\n<167W | HR <145\nPost-TT recovery. Easy spin. Celebrate.`, totalTimePlanned: 1.0, structure: STRUCTURES.recoveryRide60 },

      // ============ WEEK 16 (Jul 27 - Aug 2) — Post-5K recovery + 10K pivot ============
      { date: '2026-07-27', title: 'REST', workoutType: 100, description: `REST DAY\nPost-5K TT recovery. Full rest.`, totalTimePlanned: 0 },
      { date: '2026-07-28', title: 'TRACK WU', workoutType: 3, description: `WARM-UP (25-30min)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 3km easy jog (HR <145)\n  * Dynamic drills 5min\n  * 5x 100m strides (90s walk back)\n  * 2min settle\n\nPost-TT. Relaxed session.`, distancePlanned: 3500, totalTimePlanned: 0.45, structure: STRUCTURES.keyWarmup },
      { date: '2026-07-28', title: 'TRACK MAIN: 4x1km relaxed cruise', workoutType: 3, description: `MAIN SET -- 4x 1km RELAXED CRUISE (POST-TT)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Target pace: 3:41-3:45/km (100-102%) -- easy cruise\n  * HR target: 165-172 bpm (Z4)\n  * Recovery: 400m jog (~90sec)\n  * Effort: 6.5/10 -- loose, smooth\n  * Total quality: 4km\n\n  Post-TT recovery. NOT hard. Shake out TT legs.\n  Cruise intervals at comfortable pace. Find rhythm again.\n\nBAILOUT: If heavy, cut to 2-3 reps.`, distancePlanned: 4000, totalTimePlanned: 0.3, tssPlanned: 45, structure: STRUCTURES.mainCruise4x1km },
      { date: '2026-07-28', title: 'TRACK CD', workoutType: 3, description: `COOL-DOWN (10-12min)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 2km easy jog 5:30+/km\n  * 3min walk + stretch`, distancePlanned: 2000, totalTimePlanned: 0.2, structure: STRUCTURES.keyCooldown },
      { date: '2026-07-28', title: 'PM Gym (light)', workoutType: 9, description: `Gym 30min -- Light post-TT\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Bodyweight squats 2x10\n  * Glute bridges 2x12\n  * Plank 2x40sec\n\nPost-race. Don't push.`, totalTimePlanned: 0.5 },
      { date: '2026-07-29', title: 'Easy 6km', workoutType: 3, description: `Easy run 6km\nPace: 5:00/km | HR <150\nPost-TT recovery.`, distancePlanned: 6000, totalTimePlanned: 0.5, structure: STRUCTURES.easyRun6km },
      { date: '2026-07-30', title: 'Zwift race', workoutType: 2, description: `Zwift race -- 55min\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 15min warm-up + openers @ 55-85% FTP (165-255W)\n  * 25min RACE @ 90-110% FTP (270-330W)\n  * 10min cool-down @ 45-60% FTP (135-180W)\n  * Total: ~55min\n\n  Keep intensity alive post-5K TT.\n  Race hard on the bike, save running legs for 10K block.`, totalTimePlanned: 0.92, structure: STRUCTURES.zwiftRace },
      { date: '2026-07-31', title: 'Yoga 40min', workoutType: 100, description: `Yoga / Mobility 40min\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Hip openers, hamstrings, foam rolling\n  * Post-race recovery.`, totalTimePlanned: 0.67 },
      { date: '2026-07-31', title: 'Easy bike 45min', workoutType: 2, description: `Easy bike 45min Z1-Z2\n150-200W | HR <150`, totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },
      { date: '2026-08-01', title: 'Long run 14km easy (post-TT)', workoutType: 3, description: `LONG RUN -- 14km EASY (POST-TT)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Pace: 4:55/km (Z2) | HR: <150\n  * No fast finish. Pure easy.\n\n━━━━━━━━━━━━━━━━━━━━━━━━\nTOTAL: 14km | ~1h08\nPost-5K TT recovery. Easy and controlled.`, distancePlanned: 14000, totalTimePlanned: 1.13, tssPlanned: 65, structure: STRUCTURES.longRun14kmEasy },
      { date: '2026-08-02', title: 'Long ride 90min Z2', workoutType: 2, description: `Long ride 90min Z2\n168-227W | HR 146-156\nRecovery ride.`, totalTimePlanned: 1.5, structure: STRUCTURES.bikeEndurance90 },

      // ============ WEEK 17 (Aug 3-9) — 10K specific ============
      { date: '2026-08-03', title: 'Easy bike 60min Z2', workoutType: 2, description: `Easy bike 60min Z2\n168-227W | HR 146-156`, totalTimePlanned: 1.0, structure: STRUCTURES.easyBike60 },
      { date: '2026-08-04', title: 'TRACK WU', workoutType: 3, description: `WARM-UP (25-30min)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 3km easy jog (HR <145)\n  * Dynamic drills 5min\n  * 5x 100m strides (90s walk back)\n  * 2min settle\n\nTHE 10K session today.`, distancePlanned: 3500, totalTimePlanned: 0.45, structure: STRUCTURES.keyWarmup },
      { date: '2026-08-04', title: 'TRACK MAIN: 4x2km @ 3:36-3:40', workoutType: 3, description: `MAIN SET -- 4x 2km (THE 10K SESSION)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Target pace: 3:34-3:41/km (102-105%) -- 10K pace zone\n  * HR target: 170-178 bpm (Z4-Z5a) by rep 3-4\n  * Recovery: 400m jog (~2min)\n  * Effort: 8/10\n  * Total quality: 8km at 10K pace\n\n  THE 10K SESSION. Your data shows 4x2km @ 3:49-3:53 in Oct.\n  After 17 weeks of structured work, 3:34-3:41 is the target.\n  METRONOMIC. Each rep within 5sec. Negative split: rep 4 fastest.\n\nBAILOUT: If HR >180 OR pace collapses, STOP.`, distancePlanned: 8000, totalTimePlanned: 0.5, tssPlanned: 80, structure: STRUCTURES.mainTempo4x2km },
      { date: '2026-08-04', title: 'TRACK CD', workoutType: 3, description: `COOL-DOWN (10-12min)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 2km easy jog 5:30+/km\n  * 3min walk + stretch`, distancePlanned: 2000, totalTimePlanned: 0.2, structure: STRUCTURES.keyCooldown },
      { date: '2026-08-04', title: 'PM Gym', workoutType: 9, description: `Gym 45min -- Strength + explosive\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Front squats 3x5\n  * Hip thrusts 3x8\n  * Box jumps 3x5\n  * Plank 3x45sec\n  * Dead bug 3x10/side`, totalTimePlanned: 0.75 },
      { date: '2026-08-05', title: 'Easy 7km + strides', workoutType: 3, description: `Easy run 7km + 4x100m strides\nPace: 5:00-5:10/km | HR <150`, distancePlanned: 7000, totalTimePlanned: 0.65, structure: STRUCTURES.easyRunStrides7km },
      { date: '2026-08-06', title: 'Fartlek 13km (10K rhythm)', workoutType: 3, description: `FARTLEK -- 13km continuous (10K rhythm)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 3km warm-up @ 5:00/km (HR <150)\n  * 6× (3min @ 3:32-3:38/km [103-106%] / 2min easy @ 5:00/km)\n    — 10K race pace, feels like "strong cruise"\n    — HR target: 172-178 on hard portions\n  * 4× (1min @ 3:16-3:26/km [109-115%] / 1min easy @ 5:00/km)\n    — Sharp overspeed kicks\n    — HR target: 178-184\n  * 2km cool-down @ 5:10/km\n\n━━━━━━━━━━━━━━━━━━━━━━━━\nTOTAL: ~13km | ~58min\n18min at 10K pace + 4min overspeed. THE 10K fartlek.\nContinuous running — do NOT stop between reps.\n\nBAILOUT: If HR >185 or pace collapses, drop the 1min kicks and jog home.`, distancePlanned: 13000, totalTimePlanned: 0.97, structure: STRUCTURES.fartlek10kRhythm },
      { date: '2026-08-07', title: 'Yoga 40min', workoutType: 100, description: `Yoga / Mobility 40min\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Hip openers, hamstrings, foam rolling`, totalTimePlanned: 0.67 },
      { date: '2026-08-07', title: 'Easy bike 45min', workoutType: 2, description: `Easy bike 45min Z1-Z2\n150-200W | HR <150`, totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },
      { date: '2026-08-08', title: 'Long run 20km + strong finish', workoutType: 3, description: `LONG RUN -- 20km WITH 5km STRONG FINISH\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * km 1-15 easy @ 4:35/km | HR <160\n  * km 16-20 @ 4:00/km | HR 160-170\n\n━━━━━━━━━━━━━━━━━━━━━━━━\nTOTAL: 20km | ~1h33\n5km of 10K rhythm on tired legs.`, distancePlanned: 20000, totalTimePlanned: 1.55, tssPlanned: 120, structure: STRUCTURES.longRun20km10kFinish },
      { date: '2026-08-09', title: 'Long ride 2hrs Z2', workoutType: 2, description: `Long ride 2hrs Z2\n168-227W | HR 146-156`, totalTimePlanned: 2.0, structure: STRUCTURES.longRide120 },

      // ============ WEEK 18 (Aug 10-16) — 10K taper ============
      { date: '2026-08-10', title: 'Easy bike 45min', workoutType: 2, description: `Easy bike 45min Z1\n<167W | HR <145\nTaper week begins.`, totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },
      { date: '2026-08-11', title: 'TRACK WU', workoutType: 3, description: `WARM-UP (25-30min)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 3km easy jog (HR <145)\n  * Dynamic drills 5min\n  * 5x 100m strides (90s walk back)\n  * 2min settle\n\nSharpener session.`, distancePlanned: 3500, totalTimePlanned: 0.45, structure: STRUCTURES.keyWarmup },
      { date: '2026-08-11', title: 'TRACK MAIN: 3x1km + 4x200m (sharpener)', workoutType: 3, description: `MAIN SET -- 3x1km @ 3:26-3:28 + 4x200m @ 37sec (SHARPENER)\n━━━━━━━━━━━━━━━━━━━━━━━━\nSET 1: 3x 1km @ 3:25-3:28/km (108-110%)\n  * Recovery: FULL (400m jog)\n\nSET 2: 4x 200m @ 35-37sec (120-127%)\n  * Recovery: FULL (200m walk/jog)\n\n  * Total quality: 3.8km. Sharp.\n  * Taper session. Leave fast, not tired.`, distancePlanned: 3800, totalTimePlanned: 0.3, tssPlanned: 40, structure: STRUCTURES.mainTrackOpener10k },
      { date: '2026-08-11', title: 'TRACK CD', workoutType: 3, description: `COOL-DOWN (10-12min)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 2km easy jog 5:30+/km\n  * 3min walk + stretch`, distancePlanned: 2000, totalTimePlanned: 0.2, structure: STRUCTURES.keyCooldown },
      { date: '2026-08-11', title: 'PM Gym (very light)', workoutType: 9, description: `Gym 20min -- Very light\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Bodyweight squats 2x8\n  * Glute bridges 2x10\n  * Plank 1x30sec\n\nTaper. Minimal.`, totalTimePlanned: 0.33 },
      { date: '2026-08-12', title: 'Easy 5km + strides', workoutType: 3, description: `Easy 5km + 4x100m strides\nPace: 5:10/km | HR <150\nShort and easy. Legs turning over.`, distancePlanned: 5000, totalTimePlanned: 0.45, structure: STRUCTURES.easyRun5kmStrides },
      { date: '2026-08-13', title: 'Easy bike 45min', workoutType: 2, description: `Easy bike 45min Z1 (TAPER -- no intensity)\n<167W | HR <145`, totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },
      { date: '2026-08-14', title: 'Yoga 40min', workoutType: 100, description: `Yoga / Mobility 40min\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Gentle flow. Taper week.\n  * Hip openers, light stretching.`, totalTimePlanned: 0.67 },
      { date: '2026-08-15', title: 'Long run 14km easy (taper)', workoutType: 3, description: `LONG RUN -- 14km EASY (TAPER)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Pace: 5:00/km (Z2) | HR: <150\n  * No fast finish. Pure easy. Taper.\n\n━━━━━━━━━━━━━━━━━━━━━━━━\nTOTAL: 14km | ~1h10\nTaper run. Trust the training.`, distancePlanned: 14000, totalTimePlanned: 1.17, tssPlanned: 65, structure: STRUCTURES.longRun14kmEasy },
      { date: '2026-08-16', title: 'Long ride 90min Z2', workoutType: 2, description: `Long ride 90min Z2\n168-227W | HR 146-156\nTaper ride.`, totalTimePlanned: 1.5, structure: STRUCTURES.bikeEndurance90 },

      // ============ WEEK 19 (Aug 17-23) — 10K RACE WEEK ============
      { date: '2026-08-17', title: 'Easy bike 40min', workoutType: 2, description: `Easy bike 40min Z1\n<167W | HR <145\nRace week. Short and easy.`, totalTimePlanned: 0.67, structure: STRUCTURES.easyBike40 },
      { date: '2026-08-18', title: 'TRACK WU', workoutType: 3, description: `WARM-UP (20-25min)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 3km easy jog (HR <145)\n  * Dynamic drills 5min\n  * 5x 100m strides (90s walk back)\n  * 2min settle\n\n10K race week opener.`, distancePlanned: 3500, totalTimePlanned: 0.4, structure: STRUCTURES.keyWarmup },
      { date: '2026-08-18', title: 'TRACK MAIN: 3x1km + 4x200m (opener)', workoutType: 3, description: `MAIN SET -- 3x1km @ 3:26 + 4x200m @ 37sec (10K OPENER)\n━━━━━━━━━━━━━━━━━━━━━━━━\nSET 1: 3x 1km @ 3:25-3:28/km (108-110%)\n  * Recovery: FULL (400m jog)\n\nSET 2: 4x 200m @ 35-37sec (120-127%)\n  * Recovery: FULL (200m walk/jog)\n\n  * Total quality: 3.8km. Sharp. Electric.\n  * NOT a workout -- a primer.\n  * Leave FAST, not tired.`, distancePlanned: 3800, totalTimePlanned: 0.3, tssPlanned: 40, structure: STRUCTURES.mainTrackOpener10k },
      { date: '2026-08-18', title: 'TRACK CD', workoutType: 3, description: `COOL-DOWN (10min)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * 2km easy jog\n  * Walk + stretch`, distancePlanned: 2000, totalTimePlanned: 0.17, structure: STRUCTURES.keyCooldown },
      { date: '2026-08-18', title: 'PM Gym (activation only)', workoutType: 9, description: `Gym 15min -- ACTIVATION ONLY\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Bodyweight squats 2x8\n  * Glute bridges 2x8\n  * 3x broad jump\n\nZero fatigue. Wake up muscles.`, totalTimePlanned: 0.25 },
      { date: '2026-08-19', title: 'Easy 4km', workoutType: 3, description: `Easy run 4km\nPace: 5:10-5:20/km | HR <150\nJust movement.`, distancePlanned: 4000, totalTimePlanned: 0.35, structure: STRUCTURES.easyRun4km },
      { date: '2026-08-20', title: 'Yoga only (race week)', workoutType: 100, description: `Yoga 30min (RACE WEEK -- no bike)\n━━━━━━━━━━━━━━━━━━━━━━━━\n  * Gentle flow only. Light stretching.\n  * Rest. Trust the taper.`, totalTimePlanned: 0.5 },
      { date: '2026-08-21', title: 'REST', workoutType: 100, description: `COMPLETE REST\n━━━━━━━━━━━━━━━━━━━━━━━━\nSleep early. Hydrate. Eat well.\n\nRace plan:\n  * Km 1-2: 3:34 -- CONTROLLED\n  * Km 3-8: 3:34 -- METRONOMIC\n  * Km 9: 3:32 -- push\n  * Km 10: 3:28 -- EVERYTHING\n  * = 35:52`, totalTimePlanned: 0 },
      { date: '2026-08-22', title: '10K TIME TRIAL -- sub-36:00', workoutType: 3, description: `10K TIME TRIAL -- TARGET SUB-36:00\n━━━━━━━━━━━━━━━━━━━━━━━━\nWARM-UP (15min)\n  * 2km easy jog + drills + 3x100m at 10K pace\n\nRACE -- 10km\n  * Target: 35:52 (3:34x8 + 3:32 + 3:28)\n  * Km 1-2: 3:34 -- CONTROLLED\n  * Km 3-8: 3:34 -- the engine room. METRONOMIC.\n  * Km 9: 3:32 -- push\n  * Km 10: 3:28 -- EVERYTHING LEFT\n\nCOOL-DOWN (10min)\n  * Easy jog + walk\n\n━━━━━━━━━━━━━━━━━━━━━━━━\nTHE SEASON FINALE. Sub-36. Make it count.\nEven splits or negative split. NEVER positive.`, distancePlanned: 10000, totalTimePlanned: 0.6, tssPlanned: 85, structure: STRUCTURES.tt10k },
      { date: '2026-08-23', title: 'Recovery ride 60min', workoutType: 2, description: `Recovery ride 60min Z1\n<167W | HR <145\nSeason complete. Celebrate.`, totalTimePlanned: 1.0, structure: STRUCTURES.recoveryRide60 },
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
