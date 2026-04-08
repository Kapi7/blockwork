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

  // Easy 9km + 6x100m strides finisher (distance-based body, time-based strides)
  easyRunStrides9km: runStructure([
    distStep('Warm up',   1000, 65, 75, 'warmUp'),
    distStep('Easy main', 7000, 72, 80, 'active'),
    {
      type: 'repetition',
      length: { value: 6, unit: 'repetition' },
      steps: [
        { type: 'step', name: 'Stride 100m', length: { value: 100, unit: 'meter' }, targets: [{ minValue: 115, maxValue: 130 }], intensityClass: 'active', openDuration: false },
        { type: 'step', name: 'Walk back',   length: { value: 60,  unit: 'second' }, targets: [{ minValue: 45,  maxValue: 60 }],  intensityClass: 'rest',   openDuration: false },
      ],
    },
    distStep('Cool down', 400, 60, 70, 'coolDown'),
  ]),

  // Easy 6km + 4x100m strides (pre-long flush)
  easyRunStrides6km: runStructure([
    distStep('Warm up',   1000, 65, 75, 'warmUp'),
    distStep('Easy main', 4000, 72, 80, 'active'),
    {
      type: 'repetition',
      length: { value: 4, unit: 'repetition' },
      steps: [
        { type: 'step', name: 'Stride 100m', length: { value: 100, unit: 'meter' }, targets: [{ minValue: 115, maxValue: 130 }], intensityClass: 'active', openDuration: false },
        { type: 'step', name: 'Walk back',   length: { value: 60,  unit: 'second' }, targets: [{ minValue: 45,  maxValue: 60 }],  intensityClass: 'rest',   openDuration: false },
      ],
    },
    distStep('Cool down', 400, 60, 70, 'coolDown'),
  ]),

  // Easy 7km + 6x100m strides (Block 0 peak, end-of-recovery)
  easyRunStrides7km: runStructure([
    distStep('Warm up',   1000, 65, 75, 'warmUp'),
    distStep('Easy main', 5000, 72, 80, 'active'),
    {
      type: 'repetition',
      length: { value: 6, unit: 'repetition' },
      steps: [
        { type: 'step', name: 'Stride 100m', length: { value: 100, unit: 'meter' }, targets: [{ minValue: 115, maxValue: 130 }], intensityClass: 'active', openDuration: false },
        { type: 'step', name: 'Walk back',   length: { value: 60,  unit: 'second' }, targets: [{ minValue: 45,  maxValue: 60 }],  intensityClass: 'rest',   openDuration: false },
      ],
    },
    distStep('Cool down', 400, 60, 70, 'coolDown'),
  ]),

  // 6x 200m uphill (distance-based) — 3:30-3:45/km (100-107% LTP), walk-back rest
  hillRepeats6x200: runStructure([
    singleStep('Warm up + drills', 900, 65, 75, 'warmUp'),   // 15min WU
    {
      type: 'repetition',
      length: { value: 6, unit: 'repetition' },
      steps: [
        { type: 'step', name: 'Uphill HARD', length: { value: 200, unit: 'meter' }, targets: [{ minValue: 100, maxValue: 108 }], intensityClass: 'active', openDuration: false },
        { type: 'step', name: 'Walk down',   length: { value: 90,  unit: 'second' }, targets: [{ minValue: 50, maxValue: 60 }],   intensityClass: 'rest',   openDuration: false },
      ],
    },
    singleStep('Cool down + 4× 100m strides', 720, 70, 80, 'coolDown'),
  ]),

  // Fartlek 8x (90s hard / 90s easy) — time-based by design (find-the-gears session)
  fartlek8x90: runStructure([
    singleStep('Warm up', 720, 65, 75, 'warmUp'),
    repeatSet(8, 90, 90, 100, 90, 65, 75),
    singleStep('Cool down', 720, 65, 75, 'coolDown'),
  ]),

  // 6x 400m (DISTANCE) @ 3:30-3:35/km (Z5b 5K pace), 200m jog recovery
  track6x400: runStructure([
    singleStep('Warm up + drills', 1080, 65, 75, 'warmUp'),
    repeatSetDist(6, 400, 105, 110, 200, 55, 65),
    singleStep('Cool down', 600, 65, 75, 'coolDown'),
  ]),

  // 3x 1.5km (DISTANCE) tempo @ 4:15/km (88% threshold), 400m jog recovery
  tempo3x1500: runStructure([
    singleStep('Warm up', 720, 65, 75, 'warmUp'),
    repeatSetDist(3, 1500, 86, 92, 400, 55, 65),
    singleStep('Cool down', 600, 65, 75, 'coolDown'),
  ]),

  // Progressive long run 14km — DISTANCE segments
  longRun14kmProgressive: runStructure([
    distStep('Segment 1 — patience',  10000, 70, 76, 'active'),
    distStep('Segment 2 — shift',     2000,  78, 83, 'active'),
    distStep('Segment 3 — push',      2000,  83, 88, 'active'),
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

  // Key lite — 10x 10sec hill sprints + 2km tempo finish
  hillSprintsTempo: runStructure([
    singleStep('Warm up + drills', 900, 65, 75, 'warmUp'),
    repeatSet(10, 10, 120, 140, 80, 50, 60),  // 10 × (10s ALL-OUT / 80s walk-back)
    singleStep('Tempo 2km', 540, 86, 92, 'active'),  // ~9min tempo
    singleStep('Cool down', 540, 65, 75, 'coolDown'),
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
    id: 'bridge-1',
    number: 1,
    name: 'Bridge — Bike Intensity',
    phase: 'recovery' as const,
    startDate: '2026-04-14',
    endDate: '2026-04-20',
    stimulus: 'Transition from recovery to base. Running stays easy. Bike introduces 90s on/off to wake up the engine. Gym maintains.',
    goals: [
      '3 easy runs (6-8km) to maintain pattern',
      'Bike 90s on/off for cardiovascular stimulus without running load',
      'Gym session to maintain strength baseline',
    ],
    successMetrics: [
      'Legs fresh for Block 2 hill repeats',
      'Bike on/off feels fun, not buried',
      'No niggles carrying forward',
    ],
    weekPattern: 'Mon easy run | Tue bike on/off | Wed gym | Thu easy run + strides | Fri endurance ride | Sat easy run | Sun long ride w/ Z3 surges',
    restrictions: [
      'NO hard running — runs are Z1 only + strides',
      'Bike intensity is 90s on/off, NOT sustained threshold',
      'If anything from Block 0 still lingers, cut the on/off reps',
    ],
    sessions: [
      { date: '2026-04-14', title: 'Easy run', workoutType: 3, description: 'Easy run 6km @ 5:15-5:25/km\nZ1 only. Continuation of Block 0 pattern.\nSmooth, relaxed, enjoying running.', distancePlanned: 6000, totalTimePlanned: 0.53, structure: STRUCTURES.easyRun6km },
      { date: '2026-04-15', title: 'Bike 90s on/off', workoutType: 2, description: `BIKE — 90s ON/OFF (wake-up session)
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (10min)
  • Progressive Z1-Z2 | 90rpm

MAIN SET  —  8× (90s ON / 90s OFF)
  • ON: 85-95% FTP (255-285W) — strong but controlled
  • OFF: 50-60% FTP (150-180W) — easy spin, legs recover
  • Total work: 24min (12min ON, 12min OFF)
  • RPE on reps: 7/10 — NOT maximal. Save that for Block 2.

COOL-DOWN  (10min)
  • Easy Z1 spin

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 44min  |  TSS ~50
This is the only intensity all week. Fun, not a test.`, totalTimePlanned: 0.73, tssPlanned: 50, structure: STRUCTURES.bikeOnOff90 },
      { date: '2026-04-16', title: 'Gym — Strength', workoutType: 9, description: `STRENGTH  (45min)

• Back squats 3x10
• Walking lunges 3x8/leg
• Single-leg RDL 3x8/leg
• Glute bridges 3x12
• Plank 3x45sec
• Copenhagen plank 3x20sec/side

Moderate load. Build from Block 0's bodyweight base.
Add barbell if form is solid.`, totalTimePlanned: 0.75 },
      { date: '2026-04-17', title: 'Easy run + strides', workoutType: 3, description: 'Easy run 7km @ 5:10/km\n+ 6×100m strides (build to 90%, walk back recovery)\nStrides maintain turnover for Block 2 key sessions.', distancePlanned: 7000, totalTimePlanned: 0.63, structure: STRUCTURES.easyRunStrides7km },
      { date: '2026-04-18', title: 'Endurance ride', workoutType: 2, description: 'Endurance ride 90min Z2\nSteady effort, conversational pace.\nOutdoor or Zwift. Cadence 85-90rpm.\nNo surges — save that for Sunday.', totalTimePlanned: 1.5, structure: STRUCTURES.bikeEndurance90 },
      { date: '2026-04-19', title: 'Easy run', workoutType: 3, description: 'Easy run 8km @ 5:10-5:20/km\nZ1 only. Longest easy run yet — step up from Block 0\'s 7km.\nShould feel comfortable and controlled.', distancePlanned: 8000, totalTimePlanned: 0.7, structure: STRUCTURES.easyRun8km },
      { date: '2026-04-20', title: 'Long ride + Z3 surges', workoutType: 2, description: `LONG RIDE — Z2 BASE + Z3 SURGES  (2hrs)
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (10min)
  • Easy Z1 spin

MAIN  (1h40)
  • Z2 base (65-75% FTP) with 3× 5min Z3 surges (78-85% FTP)
  • Surges are feel-based — on a climb, into headwind, or just when it feels right
  • NOT structured intervals. Just open the throttle slightly 3 times.

COOL-DOWN  (10min)
  • Easy Z1

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 2hrs  |  TSS ~100
Last session before Block 2 starts. Finish feeling strong.`, totalTimePlanned: 2.0, tssPlanned: 100, structure: STRUCTURES.longRide120Bridge },
    ],
  },
  {
    id: 'block-2-base',
    number: 2,
    name: 'Build the Engine',
    phase: 'base',
    startDate: '2026-04-21',
    endDate: '2026-05-10',
    stimulus: 'Rebuild aerobic base with structure. Hill work for power. Bike threshold for aerobic ceiling. Strength 2x/week.',
    goals: [
      'Build running to 45-50km/week',
      'Introduce hill repeats (6x200m uphill)',
      'Long run to 18km with negative split',
      'Bike threshold: 4x5min Z4 controlled',
      'Strength progressing load',
    ],
    successMetrics: [
      'Long run 18km, last 5km at 4:35-4:45/km (Z2)',
      'Hill power: 200m uphill in 42-45sec (3:30-3:45/km pace)',
      'Bike Z4: 4x5min without blowing up',
      'Tempo: 4:15-4:25/km (Z3 Tempo) (Z3 Tempo) feels smooth',
    ],
    weekPattern: 'Mon easy | Tue KEY1 (hills/track) | Wed YOGA + strength | Thu KEY2 (tempo) | Fri easy run pre-long | Sat long run | Sun long ride',
    restrictions: [
      'No 5K pace intervals yet (save for speed block)',
      'Long run must include negative split finish',
      'Week 3 is absorb — back off slightly',
    ],
    sessions: [
      // ============ WEEK 1 (Apr 13-19) Mon-Sun — Build introduction ============
      { date: '2026-05-07', title: 'Easy bike — bridge from Block 0', workoutType: 2, description: `EASY BIKE — base aerobic bridge
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (10min)
  • Progressive Z1 | 140→180W | 90rpm

MAIN  (45min)
  • Steady Z2 | 195-225W (65-75% of 300W FTP)
  • HR Z1-Z2 146-156 | Cadence 85-90rpm
  • RPE 3-4/10 — full conversation pace

COOL-DOWN  (5min)
  • Easy spin Z1 | <165W | 95rpm

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 60min  |  TSS ~45
FIRST DAY OF BASE BLOCK.
Running starts tomorrow with KEY 1 hills — protect the legs today.`, totalTimePlanned: 1.0, tssPlanned: 45, structure: STRUCTURES.easyBike60 },
      { date: '2026-05-08', title: 'KEY 1 — Hill repeats', workoutType: 3, description: `KEY 1 — HILL REPEATS (power)
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (2.5km, ~15min)
  • 2km easy jog 5:10/km (Z1) | HR <156 (Z2 top)
  • Dynamic drills: leg swings, high knees, A-skips, B-skips (5min)
  • 3x 80m accelerations (build to 5K pace)

MAIN SET  —  6x 200m UPHILL
  • Grade: 6-8%
  • Target: 42-45sec per rep  (≈ 3:30-3:45/km pace)
  • Effort: 9/10 — DRIVE knees, pump arms, tall posture
  • HR: Z4-Z5 on rep, recover to Z2 before next
  • Recovery: easy jog DOWN the hill (~90sec), full breathing restored

COOL-DOWN  (2.5km)
  • 2km easy 5:20/km (Z1 Recovery)
  • 4x 100m FLAT strides (build, not sprint)

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~10km  |  TSS ~65
PURPOSE: neuromuscular power + form under load.
Hills are the foundation that 5K speed sits on.`, distancePlanned: 10000, totalTimePlanned: 0.92, tssPlanned: 65, structure: STRUCTURES.hillRepeats6x200 },
      { date: '2026-05-09', title: 'AM Yoga / Mobility', workoutType: 100, description: 'Yoga / mobility 40min\n- Sun salutations\n- Hip openers, runner\'s lunge sequence\n- Hamstring PNF stretching\n- Foam roll quads, calves, glutes, IT band\n\nRecovery-focused flow between key sessions.', totalTimePlanned: 0.67 },
      { date: '2026-05-09', title: 'PM Strength', workoutType: 9, description: 'Strength 45min\n\n- Back squats 3x8\n- Walking lunges 3x10/leg\n- Single-leg RDL 3x8/leg\n- Box jumps 3x5\n- Plank 3x45sec\n- Copenhagen plank 3x20sec/side\n\nStrength AFTER track day = optimal. Moderate load, good form over heavy weight.', totalTimePlanned: 0.75 },
      { date: '2026-05-10', title: 'KEY 2 — Fartlek', workoutType: 3, description: `KEY 2 — FARTLEK  (find the gears)
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (2km)
  • Easy jog 5:10/km (Z1) | HR <156 (Z2 top)
  • 4x 80m strides (build to tempo)

MAIN SET  —  8x (90s HARD / 90s EASY)
  • HARD: 4:00-4:10/km (Z3 upper, just under threshold 3:58)
     HR Z5a 175-180 (at LTHR)  |  RPE 8/10
  • EASY: 5:15-5:30/km recovery jog
     HR drop to Z2, ~155bpm  |  RPE 4/10
  • Run by FEEL, not watch — road terrain permitting
  • Total work: 12min | Total set: 24min

COOL-DOWN  (2km)
  • Easy 5:20/km (Z1 Recovery) + 2min walk

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~10km  |  TSS ~75
PURPOSE: teach the body to switch gears without blowing up.`, distancePlanned: 10000, totalTimePlanned: 0.95, tssPlanned: 75, structure: STRUCTURES.fartlek8x90 },
      { date: '2026-05-11', title: 'Easy bike / yoga pre-long', workoutType: 2, description: `EASY BIKE PRE-LONG  (60min)
━━━━━━━━━━━━━━━━━━━━━━━━
MAIN  (60min)
  • Easy Z1 | 150-180W (Z1 Recovery, 50-60% of 300W FTP)
  • HR Z1 <145 | Cadence 90-95rpm
  • Flat route only, zero surges
  • RPE 2/10 — flushing, not training

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 60min  |  TSS ~30
Pre-long run flush. Bike > run today — protect the legs.
Yoga 40min is an equal substitute if you prefer.`, totalTimePlanned: 1.0, tssPlanned: 30, structure: STRUCTURES.easyBike60 },
      { date: '2026-05-04', title: 'Long run — negative split', workoutType: 3, description: `LONG RUN — NEGATIVE SPLIT  (14km)
━━━━━━━━━━━━━━━━━━━━━━━━
SEGMENT 1  —  km 1-10  (PATIENCE)
  • Pace: 5:00-5:05/km (Z1 Recovery/low Z2)
  • HR: Z2 146-156
  • RPE 4/10 — feel held back
  • If km 1-3 feel hard → you went too fast

SEGMENT 2  —  km 11-12  (SHIFT)
  • Pace: 4:45-4:50/km
  • HR: Z3 157-165 (Tempo)
  • RPE 6/10

SEGMENT 3  —  km 13-14  (CONTROLLED PUSH)
  • Pace: 4:35-4:40/km (Z2 top)
  • HR: Z3/Z4 upper 165-174
  • RPE 7/10 — finish STRONG, not dead

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 14km ~70min  |  TSS ~90
Last km should be your fastest.
If Seg 3 feels desperate, Seg 1 was too hot.`, distancePlanned: 14000, totalTimePlanned: 1.17, tssPlanned: 90, structure: STRUCTURES.longRun14kmProgressive },
      { date: '2026-05-05', title: 'Long ride — aerobic builder', workoutType: 2, description: `LONG RIDE — Z2 AEROBIC (2.5hrs)
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (15min)
  • Progressive Z1→Z2 | 165→225W (Z1→Z2) | 85-90rpm

MAIN  (2hrs 5min)
  • Steady Z2 | 195-225W (Z2 65-75% of 300W FTP) | HR Z1-Z2 130-156
  • Cadence 85-95rpm
  • Natural Z3 bursts on climbs OK (245-265W (Z3), <2min)
  • RPE 3-5/10 — full-sentence chat

COOL-DOWN  (10min)
  • Easy spin Z1 | <165W (Z1) | 95rpm

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 2.5hrs  |  TSS ~150
Bike = aerobic volume with ZERO impact on legs.
Hydrate: 750ml/hr + electrolytes.`, totalTimePlanned: 2.5, tssPlanned: 150, structure: STRUCTURES.longRide150 },

      // ============ WEEK 2 (Apr 20-26) Mon-Sun — Build intensity ============
      { date: '2026-05-06', title: 'Easy run + strides', workoutType: 3, description: `EASY + STRIDES
━━━━━━━━━━━━━━━━━━━━━━━━
MAIN  (8km)
  • Easy 5:00-5:10/km (Z1) (Z1) | HR Z1-Z2 <156 (stay in Z1/Z2) | RPE 3-4/10

FINISHER — 6x 100m STRIDES
  • Build to 90% over 60m, hold 30m, decel 10m
  • Pace feel: ~3:20/km for the fast portion
  • Recovery: full walk-back (60-90sec)
  • Goal: sharp, relaxed, NOT sprinting

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 9km ~48min  |  TSS ~50
Strides prime the nervous system for tomorrow's track.`, distancePlanned: 9000, totalTimePlanned: 0.79, tssPlanned: 50, structure: STRUCTURES.easyRunStrides9km },
      { date: '2026-05-07', title: 'KEY 1 — Track 6x400m', workoutType: 3, description: `KEY 1 — TRACK SPEED ENDURANCE
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (2.5km, ~15min)
  • 2km easy 5:10/km (Z1) | HR <156 (Z2 top)
  • Drills: A-skips, B-skips, butt kicks, high knees (5min)
  • 3x 80m accelerations (tempo → 5K pace → cruise)

MAIN SET  —  6x 400m
  • Target: 84-86 sec per rep  (3:30-3:35/km (Z5b — 5K pace))
  • HR: Z5a-Z5b 178-185 on last 100m
  • RPE 8.5/10 — fast but NOT desperate
  • Recovery: 200m jog, ~90sec, keep moving
  • Form cues: relaxed shoulders, quick feet, tall chest

COOL-DOWN  (2km)
  • Easy 5:20/km (Z1 Recovery) + 2min walk + gentle stretch

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~10km  |  TSS ~80
5K PACE TERRITORY.
Targets: 84s=fast end | 86s=control end.
Negative split the set (6th = fastest).`, distancePlanned: 10000, totalTimePlanned: 0.95, tssPlanned: 80, structure: STRUCTURES.track6x400 },
      { date: '2026-05-08', title: 'AM Yoga / Mobility', workoutType: 100, description: 'Yoga / mobility 40min\nRecovery-focused flow between key sessions.\nFocus: hips, hamstrings, calves.', totalTimePlanned: 0.67 },
      { date: '2026-05-08', title: 'PM Strength', workoutType: 9, description: 'Strength 45min — progress the load\n\n- Front squats 3x6\n- Bulgarian split squats 3x8/leg\n- Hip thrusts 3x10\n- Box jumps 3x5 (higher box)\n- Core circuit: dead bugs, pallof press, side plank\n- Calf raises 3x15 (weighted, slow eccentric)\n\nHeavier than last week. Form first.', totalTimePlanned: 0.75 },
      { date: '2026-05-09', title: 'KEY 2 — Tempo 3x1.5km', workoutType: 3, description: `KEY 2 — TEMPO CRUISE
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (2.5km)
  • 2km easy 5:10/km (Z1)
  • 4x 100m strides

MAIN SET  —  3x 1.5km
  • Target: 4:15-4:25/km (Z3 Tempo) (Z3 Tempo)  (threshold)
  • HR: Z4-Z5a 170-180 steady (just under LTHR 180)
  • RPE 7.5/10 — comfortably hard, controlled breathing
  • Recovery: 90sec easy jog (~5:40/km)
  • Goal: METRONOMIC pacing — each rep within 3sec of target

COOL-DOWN  (2km)
  • Easy 5:20/km (Z1 Recovery) + walk

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~11km  |  TSS ~85
First real tempo of the block.
If HR drifts >185 (Z5b) mid-rep → ease back.`, distancePlanned: 11000, totalTimePlanned: 0.95, tssPlanned: 85, structure: STRUCTURES.tempo3x1500 },
      { date: '2026-05-10', title: 'Easy bike recovery', workoutType: 2, description: `RECOVERY RIDE  (60min)
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (5min)
  • Spin-up Z1 | <165W (Z1) | 90rpm

MAIN  (50min)
  • Easy Z1 | 150-180W Z1 (50-60% of 300W FTP)
  • HR <145 (Z1) | Cadence 90-95rpm
  • RPE 2/10 — flushing, not training

COOL-DOWN  (5min)
  • Soft pedal | <150W (Z1)

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 60min  |  TSS ~35
Protect the legs for tomorrow's long run.
Bike > run today. No exceptions.`, totalTimePlanned: 1.0, tssPlanned: 35, structure: STRUCTURES.recoveryRide60 },
      { date: '2026-05-11', title: 'Long run — progressive', workoutType: 3, description: `LONG RUN — PROGRESSIVE  (16km)
━━━━━━━━━━━━━━━━━━━━━━━━
SEGMENT 1  —  km 1-11  (HOLD BACK)
  • Pace: 5:00-5:05/km (Z1 Recovery/low Z2)
  • HR: Z2 146-156
  • RPE 4/10 — should feel EASY

SEGMENT 2  —  km 12-14  (SHIFT)
  • Pace: 4:45/km (Z2)
  • HR: Z3 157-165
  • RPE 6/10

SEGMENT 3  —  km 15-16  (CONTROLLED SURGE)
  • Pace: 4:30-4:35/km (Z2-Z3 boundary)
  • HR: Z3/Z4 upper 165-174
  • RPE 7.5/10 — strong, not max

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 16km ~82min  |  TSS ~110
Last 5km teaches the body to run fast when TIRED.
Fueling: 30g carbs at km 9 if available.`, distancePlanned: 16000, totalTimePlanned: 1.35, tssPlanned: 110, structure: STRUCTURES.longRun16kmProgressive },
      { date: '2026-05-04', title: 'Long ride + hills', workoutType: 2, description: `LONG RIDE + HILLS  (2h45)
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (15min)
  • Progressive Z1→Z2 | 165→225W (Z1→Z2) | 90rpm

MAIN  —  Endurance + Climbs
  • Base: Z2 | 210-240W (Z2-Z3 70-80% of 300W FTP) | 85-90rpm
  • CLIMBS (3-4 natural or Zwift):
     Seated: Z3 | 245-265W Z3 | 80rpm
     Standing surges: 30sec @ Z4 | 290W+ Z4 | every 2min
  • HR: 130-160bpm base, 165-175 on climbs
  • RPE 5-7/10 on climbs

COOL-DOWN  (10min)
  • Easy spin Z1 | 95rpm

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 2h45  |  TSS ~170
Hills on the bike = free strength work for running.
Stand on EVERY climb for at least 30sec.`, totalTimePlanned: 2.75, tssPlanned: 170, structure: STRUCTURES.longRide165Hills },

      // ============ WEEK 3 (Apr 27 - May 3) Mon-Sun — Absorb + test ============
      { date: '2026-05-05', title: 'Easy bike Z2', workoutType: 2, description: 'Easy recovery ride 60-75min Z1-Z2\n\nFlat, easy, conversation pace.\nAbsorb week — back off running, let the body absorb 2 weeks of work.', totalTimePlanned: 1.25, structure: STRUCTURES.easyBike60 },
      { date: '2026-05-06', title: 'KEY lite — Hill sprints + tempo', workoutType: 3, description: `KEY LITE — HILL SPRINTS + TEMPO
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (2km)
  • Easy 5:10/km (Z1) + drills (5min)
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
  • HR: Z4 166-174
  • RPE 7/10 — flow state, not straining

COOL-DOWN  (2km)
  • Easy jog + walk

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~10km  |  TSS ~60
Absorb-week key. Sharp nervous system, contained TSS.`, distancePlanned: 10000, totalTimePlanned: 0.88, tssPlanned: 60, structure: STRUCTURES.hillSprintsTempo },
      { date: '2026-05-07', title: 'AM Yoga deep stretch', workoutType: 100, description: 'Yoga 40min — deep stretch (absorb week)\n- Long hold pigeon pose 3min/side\n- Deep squat hold 2min\n- Hamstring PNF stretching\n- IT band foam roll\n- Hip 90/90 rotations', totalTimePlanned: 0.67 },
      { date: '2026-05-07', title: 'PM Strength (lighter)', workoutType: 9, description: 'Strength 40min — absorb week, lighter loads\n\n- Deadlift 3x5\n- Hip thrusts 3x10\n- Single-leg calf raises 3x12\n- Core: plank variations, pallof press\n\nMaintain, don\'t overload. Body needs to absorb.', totalTimePlanned: 0.67 },
      { date: '2026-05-08', title: 'Zwift race', workoutType: 2, description: `ZWIFT RACE — B/C category
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (15min)
  • Progressive Z1→Z3 | 165→260W (Z1→Z3) | include 3x 30sec openers @ Z5 (330W+ (Z5))

RACE  (20-30min)
  • Pick any B or C cat event
  • Effort: RACE IT — sustained Z4-Z5
  • Power: 90-110% FTP = 270-330W (Z4-Z5)
  • HR: Z3-Z5a 157-180
  • RPE 8-9/10

COOL-DOWN  (10min)
  • Easy Z1 | <165W Z1 | 95rpm

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~55min  |  TSS ~60
Absorb-week intensity goes on the BIKE.
Running stays easy — impact drops, aerobic stays up.`, totalTimePlanned: 0.92, tssPlanned: 60, structure: STRUCTURES.zwiftRace },
      { date: '2026-05-09', title: 'Easy run + strides', workoutType: 3, description: `EASY PRE-LONG
━━━━━━━━━━━━━━━━━━━━━━━━
MAIN  (6km)
  • Easy 5:10-5:20/km (Z1 Recovery) | HR Z1-Z2 <156 (stay in Z1/Z2) | RPE 3/10

FINISHER — 4x 100m strides
  • Build to 90%, relaxed, walk back

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 6km ~32min  |  TSS ~30
Tomorrow = THE block test. Protect the tank.`, distancePlanned: 6000, totalTimePlanned: 0.52, tssPlanned: 30, structure: STRUCTURES.easyRunStrides6km },
      { date: '2026-05-10', title: 'Long run — THE BLOCK TEST', workoutType: 3, description: `LONG RUN — THE BLOCK TEST  (18km)
━━━━━━━━━━━━━━━━━━━━━━━━
SEGMENT 1  —  km 1-13  (PATIENCE)
  • Pace: 5:00/km (low Z2) exact
  • HR: Z2 146-156
  • RPE 4/10 — FEEL HELD BACK

SEGMENT 2  —  km 14-15  (SHIFT)
  • Pace: 4:40/km (Z2 top)
  • HR: Z3, 160-168bpm
  • RPE 6/10

SEGMENT 3  —  km 16-17  (PUSH)
  • Pace: 4:25/km (Z3 Tempo)
  • HR: Z3-Z4, 168-175bpm
  • RPE 8/10

SEGMENT 4  —  km 18  (FAST)
  • Pace: 4:15/km
  • HR: Z5a 175-180 (at LTHR)
  • RPE 9/10 — controlled maximum

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 18km ~90min  |  TSS ~125
THE BLOCK 1 EXAM.
Finish strong → GREEN LIGHT for Block 2 (speed).
Last km MUST be your fastest.
Fuel: 30g carbs at km 9 + 30g at km 14.`, distancePlanned: 18000, totalTimePlanned: 1.5, tssPlanned: 125, structure: STRUCTURES.longRun18kmTest },
      { date: '2026-05-11', title: 'Easy recovery ride', workoutType: 2, description: `RECOVERY RIDE  (75min)
━━━━━━━━━━━━━━━━━━━━━━━━
MAIN
  • Easy Z1 | 150-180W Z1 (50-60% of 300W FTP)
  • HR Z1 <145 | Cadence 90-95rpm
  • Flat route, zero surges
  • RPE 2/10

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 75min  |  TSS ~40
Base block DONE.
How did the 18km feel?
Block review → Speed block (Hunt the 5K) starts tomorrow.`, totalTimePlanned: 1.25, tssPlanned: 40, structure: STRUCTURES.recoveryRide60 },
    ],
  },
  {
    id: 'block-3-speed1',
    number: 3,
    name: 'Hunt the 5K',
    phase: 'speed',
    startDate: '2026-05-12',
    endDate: '2026-06-01',
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
    id: 'block-4-speed2',
    number: 4,
    name: 'Sharpen the Blade',
    phase: 'speed',
    startDate: '2026-06-02',
    endDate: '2026-06-22',
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
