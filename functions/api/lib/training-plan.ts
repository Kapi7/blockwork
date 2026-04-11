/**
 * Itay's 15-week training plan — the source of truth George coaches from.
 *
 * Five sequential blocks leading to 5K TT Jul 5, then 10K TT Jul 26:
 *   0: Reset & Reload       (Mar 23 – Apr 13)
 *   1: Build the Engine      (Apr 14 – May 11) — base phase
 *   2: Hunt the 5K           (May 12 – Jun 8)  — speed phase
 *   3: Sharpen the Blade     (Jun 9  – Jul 6)  — speed/taper → 5K TT Jul 5
 *   4: 10K Campaign          (Jul 7  – Jul 26) — speed/taper → 10K TT Jul 26
 *
 * Weekly pattern (blocks 1-4): quality runs + bike for aerobic volume.
 *   Mon: Easy bike
 *   Tue: KEY run 1 (track/hills/speed)
 *   Wed: Gym / Yoga
 *   Thu: KEY run 2 (tempo/threshold/combo)
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
    singleStep('Warm up + drills', 900, 65, 75, 'warmUp'),
    repeatSet(10, 10, 120, 140, 80, 50, 60),  // 10 × (10s ALL-OUT / 80s walk-back)
    singleStep('Tempo 2km', 540, 86, 92, 'active'),  // ~9min tempo
    singleStep('Cool down', 540, 65, 75, 'coolDown'),
  ]),

  // ═══════════════ BLOCK 3: 5K SPEED ═══════════════
  // Run pace: 5K target 17:30 = 3:30/km = 107% of 3:45 threshold.
  // 400m at 3:20/km = 80sec per 400 = 112%. 800m at 3:25/km = 109%.

  // 5×1km @ 5K pace (3:28-3:32/km = 105-108%), 400m jog recovery
  track5x1km: runStructure([
    singleStep('Warm up + drills', 900, 65, 75, 'warmUp'),
    repeatSetDist(5, 1000, 105, 108, 400, 55, 65),
    singleStep('Cool down', 600, 65, 75, 'coolDown'),
  ]),

  // 6×800m @ faster than race pace (3:20-3:25/km = 109-112%), 400m jog
  track6x800m: runStructure([
    singleStep('Warm up + drills', 900, 65, 75, 'warmUp'),
    repeatSetDist(6, 800, 109, 112, 400, 55, 65),
    singleStep('Cool down', 600, 65, 75, 'coolDown'),
  ]),

  // Tempo 3km @ 3:55/km (96%) + 4×200m sharpeners @ 3:15/km (115%)
  tempoAndSharpeners: runStructure([
    singleStep('Warm up', 720, 65, 75, 'warmUp'),
    distStep('Tempo 3km', 3000, 94, 98, 'active'),
    singleStep('Recovery jog', 180, 55, 65, 'rest'),
    repeatSetDist(4, 200, 113, 118, 200, 50, 60),
    singleStep('Cool down', 600, 65, 75, 'coolDown'),
  ]),

  // 2km tempo @ 3:50/km (98%) + 6×400m @ 3:15-3:20/km (112-115%)
  tempoAnd400s: runStructure([
    singleStep('Warm up', 720, 65, 75, 'warmUp'),
    distStep('Tempo 2km', 2000, 96, 100, 'active'),
    singleStep('Recovery jog', 180, 55, 65, 'rest'),
    repeatSetDist(6, 400, 112, 115, 200, 50, 60),
    singleStep('Cool down', 600, 65, 75, 'coolDown'),
  ]),

  // 3×1km sharpener (taper week) @ 3:25-3:28/km (108-110%), 90s jog
  sharpener3x1km: runStructure([
    singleStep('Warm up + openers', 900, 65, 80, 'warmUp'),
    repeatSetDist(3, 1000, 108, 110, 400, 55, 65),
    singleStep('Cool down', 600, 65, 75, 'coolDown'),
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
    singleStep('Warm up + drills', 900, 65, 75, 'warmUp'),
    repeatSetDist(4, 400, 112, 118, 200, 50, 60),
    singleStep('Recovery jog', 180, 55, 65, 'rest'),
    repeatSetDist(4, 200, 115, 125, 200, 45, 55),
    singleStep('Cool down', 600, 65, 75, 'coolDown'),
  ]),

  // 3x2km tempo @ 10K pace
  tempo3x2km: runStructure([
    singleStep('Warm up', 720, 65, 75, 'warmUp'),
    repeatSetDist(3, 2000, 100, 104, 400, 55, 65),
    singleStep('Cool down', 600, 65, 75, 'coolDown'),
  ]),

  // 4x2km tempo @ 10K race pace
  tempo4x2km: runStructure([
    singleStep('Warm up', 720, 65, 75, 'warmUp'),
    repeatSetDist(4, 2000, 102, 105, 400, 55, 65),
    singleStep('Cool down', 600, 65, 75, 'coolDown'),
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
    singleStep('Warm up + drills', 900, 65, 75, 'warmUp'),
    repeatSetDist(4, 1000, 95, 98, 200, 55, 65),
    singleStep('Cool down', 600, 65, 75, 'coolDown'),
  ]),

  // 5×1km sub-threshold @ 96-99%, 60s jog
  subThreshold5x1km: runStructure([
    singleStep('Warm up + drills', 900, 65, 75, 'warmUp'),
    repeatSetDist(5, 1000, 96, 99, 200, 55, 65),
    singleStep('Cool down', 600, 65, 75, 'coolDown'),
  ]),

  // 6×1km sub-threshold @ 96-99%, 60s jog (Bakken classic)
  subThreshold6x1km: runStructure([
    singleStep('Warm up + drills', 900, 65, 75, 'warmUp'),
    repeatSetDist(6, 1000, 96, 99, 200, 55, 65),
    singleStep('Cool down', 600, 65, 75, 'coolDown'),
  ]),

  // 4×2km sub-threshold @ 95-98%, 90s jog
  subThreshold4x2km: runStructure([
    singleStep('Warm up + drills', 900, 65, 75, 'warmUp'),
    repeatSetDist(4, 2000, 95, 98, 400, 55, 65),
    singleStep('Cool down', 600, 65, 75, 'coolDown'),
  ]),

  // 3×3km sub-threshold @ 95-97%, 2min jog (long reps, deep in block)
  subThreshold3x3km: runStructure([
    singleStep('Warm up + drills', 900, 65, 75, 'warmUp'),
    repeatSetDist(3, 3000, 95, 97, 400, 55, 65),
    singleStep('Cool down', 600, 65, 75, 'coolDown'),
  ]),

  // ═══════════════ 5K PACE ON-RAMP (NEW TRAINING STIMULUS) ═══════════════
  // 5K goal pace = 3:29/km = ~107% of 3:45 threshold

  // 10×200m @ 3:25-3:30/km (107-110%), 200m jog — first introduction
  reps10x200m: runStructure([
    singleStep('Warm up + drills', 900, 65, 75, 'warmUp'),
    repeatSetDist(10, 200, 112, 118, 200, 50, 60),
    singleStep('Cool down', 600, 65, 75, 'coolDown'),
  ]),

  // 10×400m @ 3:28-3:32/km (105-108%), 200m jog
  reps10x400m: runStructure([
    singleStep('Warm up + drills', 900, 65, 75, 'warmUp'),
    repeatSetDist(10, 400, 110, 114, 200, 50, 60),
    singleStep('Cool down', 600, 65, 75, 'coolDown'),
  ]),

  // 8×600m @ 3:28-3:32/km (105-108%), 200m jog
  reps8x600m: runStructure([
    singleStep('Warm up + drills', 900, 65, 75, 'warmUp'),
    repeatSetDist(8, 600, 108, 112, 200, 55, 65),
    singleStep('Cool down', 600, 65, 75, 'coolDown'),
  ]),

  // 6×800m @ 3:28-3:32/km (105-108%), 300m jog — bridges into 1km reps
  reps6x800m: runStructure([
    singleStep('Warm up + drills', 900, 65, 75, 'warmUp'),
    repeatSetDist(6, 800, 105, 108, 300, 55, 65),
    singleStep('Cool down', 600, 65, 75, 'coolDown'),
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
    id: 'block-1-base',
    number: 1,
    name: 'Build the Engine',
    phase: 'base',
    startDate: '2026-04-13',
    endDate: '2026-05-10',
    stimulus: 'Aerobic base rebuild + Norwegian Singles sub-threshold introduction. NO 5K pace work yet. 4 runs/week, bike fills rest.',
    goals: [
      '4 runs/week: Tue KEY + Wed easy+strides + Fri shake + Sat long',
      'Introduce sub-threshold work (3:50-3:56/km) — NEVER at threshold',
      'Long run extends to 18km capped at Z3 (block test)',
      'Bike Mon/Thu/Sun provides aerobic volume without impact',
      'Strength progressing load week over week',
    ],
    successMetrics: [
      'Sub-threshold 5×1km @ 3:50-3:55/km, HR <174, feeling controlled',
      '16km long run with 4km sub-threshold finish executed cleanly',
      '18km block test at Z3 cap with no HR drift above 165',
      'All easy runs HR <150 at 5:00-5:15/km',
    ],
    weekPattern: 'Mon bike | Tue KEY run | Wed easy+strides | Thu gym+bike | Fri shake/rest | Sat long run | Sun bike',
    restrictions: [
      'NO 5K pace work (that starts Block 2)',
      'NO running at threshold — sub-threshold only (5-15s SLOWER than 3:45)',
      'Long runs capped at Z3 — any HR drift above 165 means WALK until it drops',
      '72hr minimum between Tue KEY and Sat long run',
      'Week 4 is recovery — Tue becomes easy, Sat is block test',
    ],
    sessions: [
      // ============ WEEK 1 (Apr 13-19) — Transition from recovery ============
      { date: '2026-04-13', title: 'Easy bike 60min Z2', workoutType: 2, description: `Easy bike 60min Z2
Steady aerobic spin. 168-227W (Z2), HR 146-156.
First bike of Block 1 — transition out of recovery.`, totalTimePlanned: 1.0, structure: STRUCTURES.easyBike60 },
      { date: '2026-04-14', title: 'Easy run 8km + strides', workoutType: 3, description: `Easy run 8km + 6×100m strides
Pace: 5:00-5:15/km (Z1-Z2) | HR <150
Not a KEY session — just building the running back.
Strides build to ~90% (smooth, not max). Walk-back rest.
Should feel easy. If legs feel heavy, cut to 6km.`, distancePlanned: 8000, totalTimePlanned: 0.7, structure: STRUCTURES.easyRun8km },
      { date: '2026-04-15', title: 'Easy run 8km', workoutType: 3, description: `Easy run 8km
Pace: 5:00-5:15/km (Z1-Z2) | HR <150
Aerobic volume day. Maintains frequency.`, distancePlanned: 8000, totalTimePlanned: 0.7, structure: STRUCTURES.easyRun8km },
      { date: '2026-04-16', title: 'Gym (light bodyweight + mobility)', workoutType: 9, description: `Gym 30min — LIGHT bodyweight + mobility

- Bodyweight squats 3x12
- Lunges 3x8/leg
- Glute bridges 3x15
- Single-leg RDL (bodyweight) 3x8/leg
- Plank 3x40sec
- Bird-dog 3x8/side
- Hip mobility flow 5min

Very light. Re-introducing gym after Block 0. No DOMS.`, totalTimePlanned: 0.5 },
      { date: '2026-04-17', title: 'Easy bike 60min', workoutType: 2, description: `Easy bike 60min Z2
168-227W (Z2) | HR 146-156 | Cadence 85-90rpm
Steady aerobic spin before Saturday's long run.`, totalTimePlanned: 1.0, structure: STRUCTURES.easyBike60 },
      { date: '2026-04-18', title: 'Long run 14km easy', workoutType: 3, description: `LONG RUN — 14km EASY
━━━━━━━━━━━━━━━━━━━━━━━━
MAIN  (14km)
  • Pace: 5:00-5:15/km (Z1-Z2)
  • HR: <150 (solid Z2)
  • RPE 4/10 — conversational throughout

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 14km ~73min  |  TSS ~75
First 14km long run of the block. Pure aerobic. No fast finish.
If HR drifts above 155, SLOW DOWN.`, distancePlanned: 14000, totalTimePlanned: 1.22, tssPlanned: 75, structure: STRUCTURES.easyRun14km },
      { date: '2026-04-19', title: 'Easy bike 75min Z2', workoutType: 2, description: `Endurance ride 75min Z2
168-227W | HR 146-156 | 85-90rpm
Aerobic volume, no impact. Recover tomorrow's legs.`, totalTimePlanned: 1.25, structure: STRUCTURES.bikeEndurance75 },

      // ============ WEEK 2 (Apr 20-26) — First KEY sub-threshold ============
      { date: '2026-04-20', title: 'Bike cadence drills', workoutType: 2, description: `Bike cadence drills 60min
Z2 base with 4×3min at 100+ rpm.
Neuromuscular activation for tomorrow's KEY run.
Keep power Z2 (168-227W), spin fast on the drills.`, totalTimePlanned: 1.0, structure: STRUCTURES.bikeCadenceDrills },
      { date: '2026-04-21', title: 'KEY — Sub-threshold 4×1km', workoutType: 3, description: `KEY — SUB-THRESHOLD 4×1km (Norwegian Singles intro)
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (15min)
  • 2km easy jog 5:10/km (Z1) | HR <156
  • Drills: leg swings, A-skips, B-skips (5min)
  • 3x 80m strides

MAIN SET  —  4×1km SUB-THRESHOLD
  • Target: 3:50-3:55/km (95-98% of 3:45 threshold)
  • This is SLOWER than threshold — 5-10s/km slower on purpose
  • HR: Z4 upper, 166-174. NEVER above 178.
  • RPE: 7/10 — "comfortably hard". Should be able to hold 2 more reps.
  • Recovery: 200m easy jog (~60s), keep moving
  • Form cues: relaxed shoulders, tall posture, quick turnover

COOL-DOWN  (10min)
  • Easy 5:20/km jog (Z1)

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~9km  |  TSS ~55
FIRST KEY of the block. The Norwegian rule: sub-threshold, not threshold.
If HR goes above 174 at any point, SLOW DOWN immediately.`, distancePlanned: 9000, totalTimePlanned: 0.75, tssPlanned: 55, structure: STRUCTURES.subThreshold4x1km },
      { date: '2026-04-22', title: 'Easy run 10km + strides', workoutType: 3, description: `Easy run 10km + 4×100m strides
Pace: 5:00-5:15/km (Z1-Z2) | HR <150
Maintains frequency between KEY and long run. Strides wake the legs up.`, distancePlanned: 10000, totalTimePlanned: 0.87, structure: STRUCTURES.easyRun10km },
      { date: '2026-04-23', title: 'Gym + easy bike 45min', workoutType: 9, description: `Gym 45min — Heavy legs + plyometric

- Back squats 3x5 (heavy, ~80% 1RM)
- Single-leg RDL 3x6/leg
- Bounding 3x6 (short, explosive)
- Box jumps 3x5
- Plank 3x45sec
- Copenhagen plank 3x20sec/side

Then: Easy bike 45min Z1-Z2 as active recovery after lifting.`, totalTimePlanned: 1.25 },
      { date: '2026-04-24', title: 'Easy run 7km shake', workoutType: 3, description: `Easy run 7km + 6×100m strides (shake-out)
Pace: 5:10-5:25/km (Z1) | HR <150
Pre-long-run flush. Strides stay smooth.`, distancePlanned: 7000, totalTimePlanned: 0.6, structure: STRUCTURES.easyRunStrides7km },
      { date: '2026-04-25', title: 'Long run 16km + 4km sub-T finish', workoutType: 3, description: `LONG RUN — 16km WITH 4km SUB-THRESHOLD FINISH
━━━━━━━━━━━━━━━━━━━━━━━━
SEGMENT 1  —  km 1-12 (EASY Z2)
  • Pace: 5:00-5:15/km (Z2)
  • HR: 146-156
  • RPE 4/10 — fully conversational

SEGMENT 2  —  km 13-16 (SUB-THRESHOLD INSERT)
  • Pace: 3:50-3:56/km (95-98% of 3:45 threshold)
  • HR: Z4 166-174 | NEVER above 178
  • RPE 7/10 — controlled, not grinding

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 16km  |  TSS ~100
Canova insert style — long run becomes the 2nd quality day.
The sub-T finish on tired aerobic legs IS the training stimulus.`, distancePlanned: 16000, totalTimePlanned: 1.38, tssPlanned: 100, structure: STRUCTURES.longRun16kmSubThreshold },
      { date: '2026-04-26', title: 'Easy bike 90min Z2', workoutType: 2, description: `Endurance ride 90min Z2
168-227W | HR 146-156 | 85-90rpm
Aerobic volume day. NOT a marathon long ride — controlled Z2 only.`, totalTimePlanned: 1.5, structure: STRUCTURES.bikeEndurance90 },

      // ============ WEEK 3 (Apr 27 - May 3) — Build the volume ============
      { date: '2026-04-27', title: 'Easy bike 60min Z2', workoutType: 2, description: `Easy bike 60min Z2
168-227W | HR 146-156 | Steady aerobic spin.
Recovery day before Tuesday's KEY.`, totalTimePlanned: 1.0, structure: STRUCTURES.easyBike60 },
      { date: '2026-04-28', title: 'KEY — Sub-threshold 5×1km', workoutType: 3, description: `KEY — SUB-THRESHOLD 5×1km
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (15min)
  • 2km easy jog 5:10/km (Z1) | HR <156
  • Drills 5min + 3x 80m strides

MAIN SET  —  5×1km SUB-THRESHOLD
  • Target: 3:50-3:55/km (96-99% of 3:45 threshold)
  • HR: Z4 166-174 — do NOT exceed 178
  • RPE: 7/10 — "could do 2 more reps"
  • Recovery: 200m easy jog (~60s)
  • Negative split the set — rep 5 should match rep 1

COOL-DOWN  (10min)
  • Easy 5:20/km jog (Z1)

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~10km  |  TSS ~65
One rep more than last week. Same pace, same control.`, distancePlanned: 10000, totalTimePlanned: 0.83, tssPlanned: 65, structure: STRUCTURES.subThreshold5x1km },
      { date: '2026-04-29', title: 'Easy run 10km', workoutType: 3, description: `Easy run 10km + 6×100m strides
Pace: 5:00-5:15/km (Z1-Z2) | HR <150
Frequency day, longer aerobic. Strides = smooth 90% effort, walk back.`, distancePlanned: 10000, totalTimePlanned: 0.87, structure: STRUCTURES.easyRun10km },
      { date: '2026-04-30', title: 'Gym + easy bike 45min', workoutType: 9, description: `Gym 45min — Progress the load

- Front squats 3x5 (add 2.5-5kg vs last week)
- Single-leg RDL 3x6/leg (heavier)
- Depth jumps 3x5 (plyometric)
- Box jumps 3x5
- Dead bug 3x10/side
- Side plank 3x30sec/side

Then: Easy bike 45min Z1-Z2 as active recovery.`, totalTimePlanned: 1.25 },
      { date: '2026-05-01', title: 'Easy run 7km shake', workoutType: 3, description: `Easy run 7km + 6×100m strides (shake-out)
Pace: 5:10-5:25/km (Z1) | HR <150
Pre-long-run flush. Strides stay smooth.`, distancePlanned: 7000, totalTimePlanned: 0.6, structure: STRUCTURES.easyRunStrides7km },
      { date: '2026-05-02', title: 'Long run 18km + 4km sub-T finish', workoutType: 3, description: `LONG RUN — 18km WITH 4km SUB-THRESHOLD FINISH
━━━━━━━━━━━━━━━━━━━━━━━━
SEGMENT 1  —  km 1-14 (EASY Z2)
  • Pace: 5:00-5:15/km (Z2)
  • HR: 146-156
  • RPE 4/10

SEGMENT 2  —  km 15-18 (SUB-THRESHOLD INSERT)
  • Pace: 3:50-3:56/km (95-98%)
  • HR: Z4 166-174 | cap at 178
  • RPE 7/10 — controlled hard

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 18km  |  TSS ~115
Biggest long run of the block. 4km sub-T insert on tired legs.
If HR creeps above 174 in the finish, BACK OFF — don't grind.`, distancePlanned: 18000, totalTimePlanned: 1.55, tssPlanned: 115, structure: STRUCTURES.longRun18kmSubThreshold },
      { date: '2026-05-03', title: 'Long ride 2hrs Z2', workoutType: 2, description: `Long ride 2hrs Z2
168-227W | HR 146-156 | 85-95rpm
Aerobic volume. Peak bike day of the block.
Natural Z3 surges on climbs OK, but <2min each.`, totalTimePlanned: 2.0, tssPlanned: 110, structure: STRUCTURES.longRide120Bridge },

      // ============ WEEK 4 (May 4-10) — Recovery + block test ============
      { date: '2026-05-04', title: 'Easy bike 45min Z1', workoutType: 2, description: `Easy bike 45min Z1
150-168W | HR <145 | Flat, easy, conversational.
Recovery week. Let the body absorb 3 weeks of work.`, totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },
      { date: '2026-05-05', title: 'Easy run 8km + strides', workoutType: 3, description: `Easy run 8km + 4×100m strides
Pace: 5:10-5:25/km (Z1) | HR <150
NOT a KEY session — recovery week. Smooth and relaxed.
Strides stay smooth, never max.`, distancePlanned: 8000, totalTimePlanned: 0.7, structure: STRUCTURES.easyRun8km },
      { date: '2026-05-06', title: 'Yoga 40min', workoutType: 100, description: `Yoga / mobility 40min
- Sun salutations 8min
- Hip openers 10min (pigeon, lizard, butterfly)
- Hamstring PNF 8min
- Foam roll quads/calves/glutes 10min
- Savasana 4min

Recovery week. Protect the tank before Saturday's block test.`, totalTimePlanned: 0.67 },
      { date: '2026-05-07', title: 'Gym LIGHTER + easy bike 45min', workoutType: 9, description: `Gym 30min — MAINTENANCE only

- Bodyweight squats 2x10
- Glute bridges 2x12
- Single-leg calf raises 2x12
- Plank 2x40sec
- Dead bug 2x8/side

Very light. No DOMS.

Then: Easy bike 45min Z1 (150-168W, HR <145).`, totalTimePlanned: 1.25 },
      { date: '2026-05-08', title: 'Easy bike 45min OR rest', workoutType: 2, description: `Easy bike 45min Z1 OR rest day
If legs feel good: easy spin 150-168W, HR <145.
If legs feel heavy: take it as a full rest day.
Block test tomorrow — protect the tank.`, totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },
      { date: '2026-05-09', title: 'BLOCK TEST — 18km capped', workoutType: 3, description: `BLOCK TEST — 18km CAPPED AT Z3
━━━━━━━━━━━━━━━━━━━━━━━━
PURPOSE: Pure aerobic discipline test.
NO Z5a. NO hero km. NO finish-line sprint.
This tests whether the base block built a sustainable aerobic engine.

SEGMENT 1  —  km 1-13 (EASY Z1-Z2)
  • Pace: 5:00-5:15/km
  • HR: <156 (solid Z2)
  • If HR drifts above 156, SLOW DOWN

SEGMENT 2  —  km 14-17 (Z3 TEMPO)
  • Pace: 4:15-4:30/km (85-92% of threshold)
  • HR: 157-165 — HARD CAP at 165
  • If HR goes above 165, WALK until it drops

SEGMENT 3  —  km 18 (COOL DOWN)
  • Pace: 5:00-5:15/km (easy)
  • Spin home

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 18km  |  TSS ~105
THE AEROBIC DISCIPLINE TEST. Can you hold Z3 without drift?
This is how the marathon went wrong — Z3 drifted to Z4 and blew up.
Pass criterion: HR stays under 165 for the tempo segment.`, distancePlanned: 18000, totalTimePlanned: 1.5, tssPlanned: 105, structure: STRUCTURES.longRun18kmCapped },
      { date: '2026-05-10', title: 'Recovery ride 60min Z1', workoutType: 2, description: `Easy recovery ride 60min Z1
<167W | HR <145 | Flat, zero surges.
Base block DONE. Block 2 (5K pace on-ramp) starts tomorrow.`, totalTimePlanned: 1.0, structure: STRUCTURES.recoveryRide60 },
    ],
  },
  // ═══════════════ BLOCK 2: 5K Pace On-Ramp (May 11 - Jun 7) ═══════════════
  {
    id: 'block-2-onramp',
    number: 2,
    name: '5K Pace On-Ramp',
    phase: 'speed',
    startDate: '2026-05-11',
    endDate: '2026-06-07',
    stimulus: 'GRADUAL introduction of 5K race pace (3:29/km) which he has NEVER trained. Progress 200m → 400m → 600m. Sub-threshold stays as secondary stimulus. Long runs get sub-threshold inserts.',
    goals: [
      'First-ever training at 5K goal pace (3:25-3:32/km)',
      'Progress rep length: 200m → 400m → 600m over 3 weeks',
      'Sub-threshold long run inserts keep the aerobic base alive',
      'Tuesday KEYs stay at 5K pace, Saturday long runs at sub-threshold',
    ],
    successMetrics: [
      '10×200m @ 3:25-3:30 feeling smooth (not desperate)',
      '10×400m @ 3:28-3:32 with HR recovering between reps',
      '8×600m @ 3:28-3:32 arriving at rep 8 still controlled',
      'No long run insert HR above 174',
    ],
    weekPattern: 'Mon bike | Tue KEY (5K pace reps) | Wed easy+strides | Thu gym+bike | Fri shake | Sat long run w/ sub-T insert | Sun bike',
    restrictions: [
      '5K pace reps introduce gradually — no more than 5km total at pace in any session',
      'Sub-threshold stays SUB — never push to threshold',
      '72hr between Tue KEY and Sat long run',
      'Week 8 is recovery — Tue becomes easy, no KEYs',
    ],
    sessions: [
      // ============ WEEK 5 (May 11-17) — First 5K pace (200m reps) ============
      { date: '2026-05-11', title: 'Easy bike 60min Z2', workoutType: 2, description: `Easy bike 60min Z2
168-227W | HR 146-156 | Cadence 85-90rpm
First day of Block 2. Steady aerobic.`, totalTimePlanned: 1.0, structure: STRUCTURES.easyBike60 },
      { date: '2026-05-12', title: 'KEY — 10×200m FAST (plays to your speed)', workoutType: 3, description: `KEY — 10×200m FAST
━━━━━━━━━━━━━━━━━━━━━━━━
Short reps FAST — plays to your speed strength.

WARM-UP  (15min)
  • 2km easy jog 5:10/km (Z1) | HR <156
  • Drills 5min (A-skips, B-skips, leg swings)
  • 4×80m accelerations building toward target

MAIN SET  —  10×200m
  • Target: 39-40sec per 200m — 3:15-3:22/km (FAST — plays to your speed)
  • Recovery: 200m easy jog (~60-75s)
  • HR: ride up to Z5a 175-180 on the reps
  • RPE 8/10 — fast but RELAXED face, tall posture
  • Form cues: quick feet, arms drive, breathe out hard

COOL-DOWN  (10min)
  • Easy 5:20/km jog (Z1)

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~8km  |  TSS ~50
Your historical shorter-rep speed is faster than 3:30/km — lean into it.
200m is short enough to land fast without grinding.`, distancePlanned: 8000, totalTimePlanned: 0.7, tssPlanned: 50, structure: STRUCTURES.reps10x200m },
      { date: '2026-05-13', title: 'Easy run 10km + strides', workoutType: 3, description: `Easy run 10km + 4×100m strides
Pace: 5:00-5:15/km (Z1-Z2) | HR <150
Frequency day. Strides stay smooth (~90% effort).`, distancePlanned: 10000, totalTimePlanned: 0.87, structure: STRUCTURES.easyRun10km },
      { date: '2026-05-14', title: 'Gym + easy bike 45min', workoutType: 9, description: `Gym 45min — Strength

- Back squats 3x5 (heavy, good form)
- Single-leg RDL 3x6/leg
- Box jumps 3x5
- Bounding 3x6
- Plank 3x45sec
- Copenhagen plank 3x20sec/side

Then: Easy bike 45min Z1-Z2 as active recovery.`, totalTimePlanned: 1.25 },
      { date: '2026-05-15', title: 'Easy run 7km shake', workoutType: 3, description: `Easy run 7km + 6×100m strides (shake-out)
Pace: 5:10-5:25/km (Z1) | HR <150
Pre-long-run flush.`, distancePlanned: 7000, totalTimePlanned: 0.6, structure: STRUCTURES.easyRunStrides7km },
      { date: '2026-05-16', title: 'Long run 16km + 4km sub-T finish', workoutType: 3, description: `LONG RUN — 16km WITH 4km SUB-THRESHOLD FINISH
━━━━━━━━━━━━━━━━━━━━━━━━
SEGMENT 1  —  km 1-12 (EASY Z2)
  • Pace: 5:00-5:15/km | HR 146-156

SEGMENT 2  —  km 13-16 (SUB-THRESHOLD)
  • Pace: 3:50-3:56/km (95-98%)
  • HR: Z4 166-174 | cap at 178
  • RPE 7/10

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 16km  |  TSS ~100
Long run as 2nd quality day (Canova insert).`, distancePlanned: 16000, totalTimePlanned: 1.38, tssPlanned: 100, structure: STRUCTURES.longRun16kmSubThreshold },
      { date: '2026-05-17', title: 'Long ride 2hrs Z2', workoutType: 2, description: `Long ride 2hrs Z2
168-227W | HR 146-156 | 85-90rpm
Aerobic volume. Steady, patient, fueled.`, totalTimePlanned: 2.0, tssPlanned: 120, structure: STRUCTURES.longRide150 },

      // ============ WEEK 6 (May 18-24) — 400m reps ============
      { date: '2026-05-18', title: 'Bike cadence drills', workoutType: 2, description: `Bike cadence drills 60min
Z2 base with 4×3min at 100+ rpm.
Neuromuscular activation for tomorrow's KEY.`, totalTimePlanned: 1.0, structure: STRUCTURES.bikeCadenceDrills },
      { date: '2026-05-19', title: 'KEY — 10×400m FAST (his strength)', workoutType: 3, description: `KEY — 10×400m FAST
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (15min)
  • 2km easy jog + drills + 3×80m strides

MAIN SET  —  10×400m
  • Target: 79-82sec per 400m — 3:18-3:25/km (faster than 5K pace — his strength)
  • Recovery: 200m easy jog (~75-90s)
  • HR: Z5a 175-180 on reps
  • RPE 8/10 — strong, controlled, not desperate
  • Negative split the set (last 3 should match first 3)

COOL-DOWN  (10min)
  • Easy 5:20/km jog (Z1)

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~10km  |  TSS ~65
Rep length doubles from last week. Speed is his weapon — use it.
Total pace work: 4km — the new upper limit.`, distancePlanned: 10000, totalTimePlanned: 0.83, tssPlanned: 65, structure: STRUCTURES.reps10x400m },
      { date: '2026-05-20', title: 'Easy run 10km + strides', workoutType: 3, description: `Easy run 10km + 4×100m strides
Pace: 5:00-5:15/km (Z1-Z2) | HR <150`, distancePlanned: 10000, totalTimePlanned: 0.87, structure: STRUCTURES.easyRun10km },
      { date: '2026-05-21', title: 'Gym + easy bike 45min', workoutType: 9, description: `Gym 45min — Progress the load

- Front squats 3x5
- Single-leg RDL 3x6/leg
- Depth jumps 3x5
- Box jumps 3x5
- Plank 3x45sec
- Dead bug 3x10/side

Then: Easy bike 45min Z1-Z2.`, totalTimePlanned: 1.25 },
      { date: '2026-05-22', title: 'Easy run 7km shake', workoutType: 3, description: `Easy run 7km + 6×100m strides (shake-out)
Pace: 5:10-5:25/km (Z1) | HR <150`, distancePlanned: 7000, totalTimePlanned: 0.6, structure: STRUCTURES.easyRunStrides7km },
      { date: '2026-05-23', title: 'Long run 18km + 4km sub-T finish', workoutType: 3, description: `LONG RUN — 18km WITH 4km SUB-THRESHOLD FINISH
━━━━━━━━━━━━━━━━━━━━━━━━
SEGMENT 1  —  km 1-14 (EASY Z2)
  • Pace: 5:00-5:15/km | HR 146-156

SEGMENT 2  —  km 15-18 (SUB-THRESHOLD)
  • Pace: 3:50-3:56/km (95-98%)
  • HR: Z4 166-174 | cap at 178
  • RPE 7/10

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 18km  |  TSS ~115
Canova long run. 4km of sub-T on tired legs.`, distancePlanned: 18000, totalTimePlanned: 1.55, tssPlanned: 115, structure: STRUCTURES.longRun18kmSubThreshold },
      { date: '2026-05-24', title: 'Bike sweet spot 75min', workoutType: 2, description: `Bike sweet spot 75min
2×15min @ 88-93% FTP (264-279W) with 5min recovery.
Sub-threshold FTP maintenance. Sustainable hard.`, totalTimePlanned: 1.25, structure: STRUCTURES.bikeSweetSpot },

      // ============ WEEK 7 (May 25-31) — 600m reps ============
      { date: '2026-05-25', title: 'Easy bike 60min Z2', workoutType: 2, description: `Easy bike 60min Z2
168-227W | HR 146-156 | Steady aerobic spin.`, totalTimePlanned: 1.0, structure: STRUCTURES.easyBike60 },
      { date: '2026-05-26', title: 'KEY — 8×600m overspeed', workoutType: 3, description: `KEY — 8×600m OVERSPEED
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (15min)
  • 2km easy jog + drills + 3×80m strides

MAIN SET  —  8×600m
  • Target: 2:01-2:05 per 600m — 3:22-3:28/km (faster than 5K pace)
  • Recovery: 200m easy jog (~85-100s)
  • HR: Z5a 175-180 on reps
  • RPE 8/10 — strong but you could do one more rep
  • Total pace work: 4.8km

COOL-DOWN  (10min)
  • Easy 5:20/km jog (Z1)

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~10km  |  TSS ~70
Bridges into 1km reps in Block 3. Overspeed session.`, distancePlanned: 10000, totalTimePlanned: 0.83, tssPlanned: 70, structure: STRUCTURES.reps8x600m },
      { date: '2026-05-27', title: 'Easy run 10km + strides', workoutType: 3, description: `Easy run 10km + 6×100m strides
Pace: 5:00-5:15/km (Z1-Z2) | HR <150
Longer easy day — building aerobic base.`, distancePlanned: 10000, totalTimePlanned: 0.87, structure: STRUCTURES.easyRun10km },
      { date: '2026-05-28', title: 'Gym + easy bike 45min', workoutType: 9, description: `Gym 45min — Maintain strength

- Front squats 3x5
- Hip thrusts 3x8
- Single-leg calf raises 3x12 (slow eccentric)
- Plank 3x45sec
- Pallof press 3x10/side

Then: Easy bike 45min Z1-Z2.`, totalTimePlanned: 1.25 },
      { date: '2026-05-29', title: 'Easy run 7km shake', workoutType: 3, description: `Easy run 7km + 6×100m strides (shake-out)
Pace: 5:10-5:25/km (Z1) | HR <150`, distancePlanned: 7000, totalTimePlanned: 0.6, structure: STRUCTURES.easyRunStrides7km },
      { date: '2026-05-30', title: 'Long run 16km + 4km sub-T finish', workoutType: 3, description: `LONG RUN — 16km WITH 4km SUB-THRESHOLD FINISH
━━━━━━━━━━━━━━━━━━━━━━━━
SEGMENT 1  —  km 1-12 (EASY Z2)
  • Pace: 5:00-5:15/km | HR 146-156

SEGMENT 2  —  km 13-16 (SUB-THRESHOLD)
  • Pace: 3:50-3:56/km (95-98%)
  • HR: Z4 166-174

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 16km  |  TSS ~100`, distancePlanned: 16000, totalTimePlanned: 1.38, tssPlanned: 100, structure: STRUCTURES.longRun16kmSubThreshold },
      { date: '2026-05-31', title: 'Long ride 2hrs Z2', workoutType: 2, description: `Long ride 2hrs Z2
168-227W | HR 146-156
Last big bike before recovery week.`, totalTimePlanned: 2.0, tssPlanned: 110, structure: STRUCTURES.longRide120Bridge },

      // ============ WEEK 8 (Jun 1-7) — Recovery ============
      { date: '2026-06-01', title: 'Easy bike 45min Z1', workoutType: 2, description: `Easy bike 45min Z1
<167W | HR <145 | Flat, easy, conversational.
Recovery week — let the body absorb.`, totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },
      { date: '2026-06-02', title: 'Easy run 8km + strides', workoutType: 3, description: `Easy run 8km + 4×100m strides
NOT a KEY — recovery week.
Pace: 5:10-5:25/km (Z1) | HR <150
Strides stay smooth. Keep legs turning over, no more.`, distancePlanned: 8000, totalTimePlanned: 0.7, structure: STRUCTURES.easyRun8km },
      { date: '2026-06-03', title: 'Yoga 40min', workoutType: 100, description: `Yoga / mobility 40min
- Sun salutations 8min
- Hip openers 10min
- Hamstring PNF 8min
- Foam roll 10min
- Savasana 4min

Recovery week. Trust the absorption.`, totalTimePlanned: 0.67 },
      { date: '2026-06-04', title: 'Gym LIGHTER + easy bike 45min', workoutType: 9, description: `Gym 30min — MAINTENANCE only

- Bodyweight squats 2x10
- Glute bridges 2x12
- Single-leg calf raises 2x12
- Plank 2x40sec

Very light. No DOMS.

Then: Easy bike 45min Z1 (<167W, HR <145).`, totalTimePlanned: 1.25 },
      { date: '2026-06-05', title: 'Easy bike 45min OR rest', workoutType: 2, description: `Easy bike 45min Z1 OR full rest
Whatever protects tomorrow's long run.`, totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },
      { date: '2026-06-06', title: 'Easy long run 12km', workoutType: 3, description: `EASY LONG RUN — 12km
Pace: 5:00-5:15/km (Z2) | HR <156
Recovery week long run. No inserts, no fast finish.
Pure aerobic.

TOTAL: 12km  |  TSS ~65`, distancePlanned: 12000, totalTimePlanned: 1.03, tssPlanned: 65, structure: STRUCTURES.easyRun12km },
      { date: '2026-06-07', title: 'Easy bike 90min Z2', workoutType: 2, description: `Endurance ride 90min Z2
168-227W | HR 146-156
End of recovery week. Transition into Block 3 tomorrow.`, totalTimePlanned: 1.5, structure: STRUCTURES.bikeEndurance90 },
    ],
  },
  // ═══════════════ BLOCK 3: Sharpen the Blade (Jun 8 - Jul 5) ═══════════════
  {
    id: 'block-3-sharpen',
    number: 3,
    name: 'Sharpen the Blade',
    phase: 'speed',
    startDate: '2026-06-08',
    endDate: '2026-07-05',
    stimulus: 'Full 5K pace reps (1km length) + overspeed. Taper week culminates in 5K TT on Jul 4 Sat.',
    goals: [
      '5×1km @ 5K pace (3:28-3:32/km) smooth and controlled',
      '6×800m overspeed slightly faster than 5K pace',
      'Long runs drop to 12-14km with 5K pace or sub-T finishes',
      '5K TT Jul 4: sub-17:30',
    ],
    successMetrics: [
      '5×1km @ 3:28-3:32 with HR <180 on last rep',
      '6×800m overspeed feeling smoother than race pace',
      'Taper leaves legs ELECTRIC not tired',
      '5K TT sub-17:30',
    ],
    weekPattern: 'Mon bike | Tue KEY | Wed easy+strides | Thu gym+bike | Fri shake | Sat long run | Sun bike',
    restrictions: [
      'No new training stimuli in Week 12 (race week)',
      'No strength work Week 12',
      'Long run max 14km in this block',
      '72hr between Tue KEY and Sat long run',
    ],
    sessions: [
      // ============ WEEK 9 (Jun 8-14) — Full 1km reps ============
      { date: '2026-06-08', title: 'Bike tempo intervals', workoutType: 2, description: `Bike tempo intervals 60min
3×8min Z3 (78-85% FTP, 234-255W) / 4min Z1.
Maintain aerobic ceiling — complements run sharpening.`, totalTimePlanned: 1.0, structure: STRUCTURES.bikeTempoIntervals },
      { date: '2026-06-09', title: 'KEY — 5×1km @ 5K pace', workoutType: 3, description: `KEY — 5×1km @ 5K PACE
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (15min)
  • 2km easy jog 5:10/km (Z1)
  • Drills 5min
  • 3×80m accelerations

MAIN SET  —  5×1km
  • Target: 3:28-3:32/km (105-108%, 5K race pace)
  • Recovery: 400m easy jog (~2min)
  • HR: Z5a 175-180 on reps
  • RPE 8/10 — focused, relaxed face
  • Negative split: last km should match first km

COOL-DOWN  (10min)
  • Easy 5:20/km jog (Z1)

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~10km  |  TSS ~75
First full 1km reps at 5K pace. The headline session of Block 3.`, distancePlanned: 10000, totalTimePlanned: 0.83, tssPlanned: 75, structure: STRUCTURES.track5x1km },
      { date: '2026-06-10', title: 'Easy run 10km + strides', workoutType: 3, description: `Easy run 10km + 4×100m strides
Pace: 5:00-5:15/km (Z1-Z2) | HR <150`, distancePlanned: 10000, totalTimePlanned: 0.87, structure: STRUCTURES.easyRun10km },
      { date: '2026-06-11', title: 'Gym + easy bike 45min', workoutType: 9, description: `Gym 40min — Maintain strength

- Front squats 3x5
- Hip thrusts 3x8
- Single-leg calf raises 3x12
- Plank 3x45sec
- Pallof press 3x10/side

Then: Easy bike 45min Z1-Z2.`, totalTimePlanned: 1.25 },
      { date: '2026-06-12', title: 'Easy run 7km shake', workoutType: 3, description: `Easy run 7km + 6×100m strides (shake-out)
Pace: 5:10-5:25/km (Z1) | HR <150`, distancePlanned: 7000, totalTimePlanned: 0.6, structure: STRUCTURES.easyRunStrides7km },
      { date: '2026-06-13', title: 'Long run 14km + 3km sub-T finish', workoutType: 3, description: `LONG RUN — 14km WITH 3km SUB-THRESHOLD FINISH
━━━━━━━━━━━━━━━━━━━━━━━━
SEGMENT 1  —  km 1-11 (EASY Z2)
  • Pace: 5:00-5:15/km | HR 146-156

SEGMENT 2  —  km 12-14 (SUB-THRESHOLD)
  • Pace: 3:50-3:56/km (95-98%)
  • HR: Z4 166-174
  • RPE 7/10

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 14km  |  TSS ~85
Canova insert long run — supports the speed work.`, distancePlanned: 14000, totalTimePlanned: 1.22, tssPlanned: 85, structure: STRUCTURES.longRun14kmSubThreshold },
      { date: '2026-06-14', title: 'Easy bike 75min Z2', workoutType: 2, description: `Endurance ride 75min Z2
168-227W | HR 146-156 | 85-90rpm`, totalTimePlanned: 1.25, structure: STRUCTURES.bikeEndurance75 },

      // ============ WEEK 10 (Jun 15-21) — Overspeed 6×800m ============
      { date: '2026-06-15', title: 'Recovery ride 60min', workoutType: 2, description: `Easy recovery ride 60min Z1
<167W | HR <145 | Flat, easy spin.`, totalTimePlanned: 1.0, structure: STRUCTURES.recoveryRide60 },
      { date: '2026-06-16', title: 'KEY — 6×800m overspeed', workoutType: 3, description: `KEY — 6×800m OVERSPEED
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (15min)
  • 2km easy + drills + 3×80m accelerations

MAIN SET  —  6×800m
  • Target: 2:44-2:48 per 800m (3:25-3:30/km, 107-110%)
  • Slightly FASTER than 5K race pace
  • Recovery: 400m easy jog (~2min 15s)
  • HR: Z5a-Z5b 178-185 on last 100m
  • RPE 8.5/10 — fast but smooth

COOL-DOWN  (10min)
  • Easy 5:20/km jog

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~10km  |  TSS ~75
Overspeed makes 5K race pace feel slower on race day.`, distancePlanned: 10000, totalTimePlanned: 0.83, tssPlanned: 75, structure: STRUCTURES.track6x800m },
      { date: '2026-06-17', title: 'Easy run 10km + strides', workoutType: 3, description: `Easy run 10km + 4×100m strides
Pace: 5:00-5:15/km (Z1-Z2) | HR <150`, distancePlanned: 10000, totalTimePlanned: 0.87, structure: STRUCTURES.easyRun10km },
      { date: '2026-06-18', title: 'Gym (power focus) + easy bike 45min', workoutType: 9, description: `Gym 40min — Power focus

- Front squats 3x3 (heavy, explosive concentric)
- Trap bar deadlift 3x5
- Depth jumps 3x5
- Broad jumps 3x5
- Plank 3x45sec

Then: Easy bike 45min Z1-Z2.`, totalTimePlanned: 1.25 },
      { date: '2026-06-19', title: 'Easy run 7km shake', workoutType: 3, description: `Easy run 7km + 6×100m strides (shake-out)
Pace: 5:10-5:25/km (Z1) | HR <150`, distancePlanned: 7000, totalTimePlanned: 0.6, structure: STRUCTURES.easyRunStrides7km },
      { date: '2026-06-20', title: 'Long run 16km + 4km sub-T finish', workoutType: 3, description: `LONG RUN — 16km WITH 4km SUB-THRESHOLD FINISH
━━━━━━━━━━━━━━━━━━━━━━━━
SEGMENT 1  —  km 1-12 (EASY Z2)
  • Pace: 5:00-5:15/km | HR 146-156

SEGMENT 2  —  km 13-16 (SUB-THRESHOLD)
  • Pace: 3:50-3:56/km (95-98%)
  • HR: Z4 166-174

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 16km  |  TSS ~100`, distancePlanned: 16000, totalTimePlanned: 1.38, tssPlanned: 100, structure: STRUCTURES.longRun16kmSubThreshold },
      { date: '2026-06-21', title: 'Bike sweet spot 75min', workoutType: 2, description: `Bike sweet spot 75min
2×15min @ 88-93% FTP (264-279W) with 5min recovery.
Last hard bike before race-week prep.`, totalTimePlanned: 1.25, structure: STRUCTURES.bikeSweetSpot },

      // ============ WEEK 11 (Jun 22-28) — Sharpener week ============
      { date: '2026-06-22', title: 'Easy bike 60min Z2', workoutType: 2, description: `Easy bike 60min Z2
168-227W | HR 146-156 | Recovery week begins.`, totalTimePlanned: 1.0, structure: STRUCTURES.easyBike60 },
      { date: '2026-06-23', title: 'KEY — 3×1km sharpener', workoutType: 3, description: `KEY — 3×1km SHARPENER
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (15min)
  • 2km easy + drills + 3×100m openers at race pace

MAIN SET  —  3×1km
  • Target: 3:25-3:28/km (108-110%, slightly faster than 5K pace)
  • Recovery: 400m easy jog (~2min)
  • HR: Z5a 175-180
  • RPE 8/10 — sharp, NOT fatiguing
  • Only 3 reps. Leave feeling fast.

COOL-DOWN  (10min)

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~8km  |  TSS ~55
Last hard 1km reps before TT. Sharp, not tired.`, distancePlanned: 8000, totalTimePlanned: 0.67, tssPlanned: 55, structure: STRUCTURES.sharpener3x1km },
      { date: '2026-06-24', title: 'Easy run 8km + strides', workoutType: 3, description: `Easy run 8km + 4×100m strides
Pace: 5:00-5:15/km (Z1-Z2) | HR <150`, distancePlanned: 8000, totalTimePlanned: 0.7, structure: STRUCTURES.easyRun8km },
      { date: '2026-06-25', title: 'Gym LIGHT + easy bike 45min', workoutType: 9, description: `Gym 25min — VERY LIGHT

- Bodyweight squats 2x10
- Glute bridges 2x12
- Plank 2x40sec
- Dead bug 2x8/side

Maintenance only. No DOMS.

Then: Easy bike 45min Z1.`, totalTimePlanned: 1.17 },
      { date: '2026-06-26', title: 'Easy run 7km shake', workoutType: 3, description: `Easy run 7km + 6×100m strides (shake-out)
Pace: 5:10-5:25/km (Z1) | HR <150`, distancePlanned: 7000, totalTimePlanned: 0.6, structure: STRUCTURES.easyRunStrides7km },
      { date: '2026-06-27', title: 'Long run 12km easy', workoutType: 3, description: `LONG RUN — 12km EASY (sharpener week)
━━━━━━━━━━━━━━━━━━━━━━━━
MAIN  (12km)
  • Pace: 5:00-5:15/km (Z1-Z2) | HR 146-156
  • Smooth and relaxed. RPE 4/10.
  • Pure aerobic. No fast finish.

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 12km  |  TSS ~65
Sharpener week long run. Keep legs turning over, no stress.`, distancePlanned: 12000, totalTimePlanned: 1.03, tssPlanned: 65, structure: STRUCTURES.easyRun12km },
      { date: '2026-06-28', title: 'Easy bike 60min Z1', workoutType: 2, description: `Easy bike 60min Z1
<167W | HR <145 | Flat, gentle spin.
Race week starts tomorrow.`, totalTimePlanned: 1.0, structure: STRUCTURES.easyBike60 },

      // ============ WEEK 12 (Jun 29 - Jul 5) — RACE WEEK ============
      { date: '2026-06-29', title: 'Rest', workoutType: 100, description: `REST DAY

Full rest. Hydrate. Eat well. Sleep 8+ hrs.
No running. No gym. Light walk OK.
Mental prep: visualize the race, km by km.`, totalTimePlanned: 0 },
      { date: '2026-06-30', title: 'Opener run + 4×100m strides', workoutType: 3, description: `OPENER RUN — 5km + 4×100m strides
Pace: 5:10-5:20/km (Z1) | HR <150
Strides smooth, relaxed, ~90% effort.
Wake up the legs. Visualize the TT.`, distancePlanned: 5000, totalTimePlanned: 0.45, structure: STRUCTURES.easyRunStrides6km },
      { date: '2026-07-01', title: 'Yoga 30min', workoutType: 100, description: `Yoga 30min — gentle stretch only
Hip openers, hamstrings, calves.
Nothing new. Breathe. Trust the training.`, totalTimePlanned: 0.5 },
      { date: '2026-07-02', title: 'Sharp opener + 2×200m', workoutType: 3, description: `RACE-WEEK SHARP OPENER (4km + 2×200m)
━━━━━━━━━━━━━━━━━━━━━━━━
MAIN  (4km)
  • Easy jog 5:10-5:20/km (Z1)

OPENERS  —  2×200m @ 5K pace
  • Target: 41-42sec (3:25-3:30/km)
  • Recovery: 200m easy jog
  • Just 2 reps. Feel the race pace.

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~5km  |  22min
Feel sharp. If these feel easy, Saturday will fly.`, distancePlanned: 4800, totalTimePlanned: 0.37, structure: STRUCTURES.raceWeekOpener },
      { date: '2026-07-03', title: 'Rest', workoutType: 100, description: `REST DAY

Full rest before the 5K TT.
Hydrate. Eat well. Sleep 8hrs. Light walk OK.

Race plan:
- Km 1: 3:32-3:35 (DON'T go out fast)
- Km 2-3: 3:28-3:30 (settle, rhythm)
- Km 4: 3:28 (hold form)
- Km 5: 3:25 or faster (EVERYTHING)`, totalTimePlanned: 0 },
      { date: '2026-07-04', title: '5K TIME TRIAL — sub-17:30', workoutType: 3, description: `5K TIME TRIAL — TARGET SUB-17:30
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (15min)
  • 2km easy jog
  • Dynamic drills (5min)
  • 3×100m at race pace

RACE  —  5km
  • Target: 17:15-17:30 (3:27-3:30/km, 107-109%)
  • Km 1: 3:32-3:35 — CONTROLLED start
  • Km 2-3: 3:28-3:30 — settle, rhythm, breathe
  • Km 4: 3:28 — the crucible, HOLD FORM
  • Km 5: 3:25 or faster — EVERYTHING

COOL-DOWN  (10min)
  • Easy jog + walk

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~9km  |  TSS ~65
THIS IS THE GOAL. Trust the block. Execute the plan.`, distancePlanned: 5000, totalTimePlanned: 0.5, tssPlanned: 65, structure: STRUCTURES.tt5k },
      { date: '2026-07-05', title: 'Recovery ride 60min', workoutType: 2, description: `Easy recovery ride 60min Z1
<167W | HR <145 | Spin out the TT legs.
5K block complete. Celebrate. Block 4 starts tomorrow.`, totalTimePlanned: 1.0, structure: STRUCTURES.recoveryRide60 },
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
    stimulus: 'Recovery from 5K TT (1 wk), rebuild + introduce 10K pace (1 wk), peak 10K specific (1 wk), taper + 10K TT (1 wk).',
    goals: [
      'Recover from 5K TT then pivot to 10K pace (3:36/km)',
      '4×2km @ 10K pace as peak specific session',
      'Long runs with 10K pace finish',
      '10K TT Aug 1: sub-36:00',
    ],
    successMetrics: [
      '3×2km @ 3:36-3:40 smooth (rebuild week)',
      '4×2km @ 3:36-3:40 metronomic (peak week)',
      'Long run 10K pace finish executed cleanly',
      '10K TT sub-36:00',
    ],
    weekPattern: 'Mon bike | Tue KEY | Wed easy+strides | Thu gym+bike | Fri shake | Sat long run | Sun bike',
    restrictions: [
      'No new training stimuli in Week 16 (race week)',
      'Keep Tue→Sat gap at 72hr minimum',
      'Long run max 14km in this block',
      '10K TT is Sat Aug 1 — block extended 1 week vs original plan',
    ],
    sessions: [
      // ============ WEEK 13 (Jul 6-12) — Recovery from 5K TT ============
      { date: '2026-07-06', title: 'Rest', workoutType: 100, description: `REST DAY

Post-5K TT recovery. Full rest.
Hydrate. Reflect on the race. Plan the 10K block.`, totalTimePlanned: 0 },
      { date: '2026-07-07', title: 'Easy run 8km', workoutType: 3, description: `Easy run 8km
NOT a KEY — post-TT recovery.
Pace: 5:10-5:30/km (Z1) | HR <150
Legs may feel heavy — that's normal. Keep it smooth.`, distancePlanned: 8000, totalTimePlanned: 0.7, structure: STRUCTURES.easyRun8km },
      { date: '2026-07-08', title: 'Easy bike 60min Z1', workoutType: 2, description: `Easy bike 60min Z1
<167W | HR <145 | Gentle spin.
Active recovery only.`, totalTimePlanned: 1.0, structure: STRUCTURES.easyBike60 },
      { date: '2026-07-09', title: 'Gym LIGHT + yoga', workoutType: 9, description: `Gym 25min — VERY LIGHT

- Bodyweight squats 2x10
- Glute bridges 2x12
- Plank 2x40sec

Then: Yoga 20min — hips + hamstrings.
Recovery week vibe. No load.`, totalTimePlanned: 0.75 },
      { date: '2026-07-10', title: 'Easy run 7km', workoutType: 3, description: `Easy run 7km
Pace: 5:10-5:25/km (Z1) | HR <150
Pre-long-run flush.`, distancePlanned: 7000, totalTimePlanned: 0.6, structure: STRUCTURES.easyRun7km },
      { date: '2026-07-11', title: 'Easy long run 14km', workoutType: 3, description: `EASY LONG RUN — 14km
Pace: 5:00-5:15/km (Z2) | HR 146-156
No inserts, no fast finish. Pure aerobic rebuild.
TOTAL: 14km  |  TSS ~75`, distancePlanned: 14000, totalTimePlanned: 1.22, tssPlanned: 75, structure: STRUCTURES.easyRun14km },
      { date: '2026-07-12', title: 'Easy bike 75min Z2', workoutType: 2, description: `Endurance ride 75min Z2
168-227W | HR 146-156 | 85-90rpm`, totalTimePlanned: 1.25, structure: STRUCTURES.bikeEndurance75 },

      // ============ WEEK 14 (Jul 13-19) — First 10K pace work ============
      { date: '2026-07-13', title: 'Easy bike 60min Z2', workoutType: 2, description: `Easy bike 60min Z2
168-227W | HR 146-156`, totalTimePlanned: 1.0, structure: STRUCTURES.easyBike60 },
      { date: '2026-07-14', title: 'KEY — 3×2km @ 10K pace', workoutType: 3, description: `KEY — 3×2km @ 10K PACE
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (15min)
  • 2km easy jog + drills + 3×80m strides

MAIN SET  —  3×2km
  • Target: 3:36-3:40/km (100-104%, 10K race pace)
  • Recovery: 400m easy jog (~2min 15s)
  • HR: Z4 upper 170-178 on reps
  • RPE 7.5/10 — strong but sustainable for 10km
  • Metronomic pacing — each rep within 3sec of target

COOL-DOWN  (10min)
  • Easy 5:20/km jog

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~10km  |  TSS ~65
First 10K-specific session. Find the new race pace.`, distancePlanned: 10000, totalTimePlanned: 0.83, tssPlanned: 65, structure: STRUCTURES.tempo3x2km },
      { date: '2026-07-15', title: 'Easy run 10km + strides', workoutType: 3, description: `Easy run 10km + 4×100m strides
Pace: 5:00-5:15/km (Z1-Z2) | HR <150`, distancePlanned: 10000, totalTimePlanned: 0.87, structure: STRUCTURES.easyRun10km },
      { date: '2026-07-16', title: 'Gym + easy bike 45min', workoutType: 9, description: `Gym 40min — Maintain strength

- Front squats 3x5
- Hip thrusts 3x8
- Single-leg calf raises 3x12
- Plank 3x45sec
- Pallof press 3x10/side

Then: Easy bike 45min Z1-Z2.`, totalTimePlanned: 1.25 },
      { date: '2026-07-17', title: 'Easy run 7km shake', workoutType: 3, description: `Easy run 7km + 6×100m strides (shake-out)
Pace: 5:10-5:25/km (Z1) | HR <150`, distancePlanned: 7000, totalTimePlanned: 0.6, structure: STRUCTURES.easyRunStrides7km },
      { date: '2026-07-18', title: 'Long run 16km + 4km @ 10K pace', workoutType: 3, description: `LONG RUN — 16km WITH 4km @ 10K PACE FINISH
━━━━━━━━━━━━━━━━━━━━━━━━
SEGMENT 1  —  km 1-12 (EASY Z2)
  • Pace: 5:00-5:15/km | HR 146-156

SEGMENT 2  —  km 13-16 (10K PACE)
  • Pace: 3:38-3:44/km (98-103%)
  • HR: Z4 170-178
  • RPE 7.5/10

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 16km  |  TSS ~105
The 10K finish test on bigger legs. If this feels manageable, sub-36 is on.`, distancePlanned: 16000, totalTimePlanned: 1.38, tssPlanned: 105, structure: STRUCTURES.longRun16km10kFinish },
      { date: '2026-07-19', title: 'Long ride 2hrs Z2', workoutType: 2, description: `Long ride 2hrs Z2
168-227W | HR 146-156
Aerobic volume — supports 10K work.`, totalTimePlanned: 2.0, tssPlanned: 110, structure: STRUCTURES.longRide120Bridge },

      // ============ WEEK 15 (Jul 20-26) — Peak 10K specific ============
      { date: '2026-07-20', title: 'Bike tempo intervals', workoutType: 2, description: `Bike tempo intervals 60min
3×8min Z3 (78-85% FTP) / 4min Z1.
Complement the run speed work.`, totalTimePlanned: 1.0, structure: STRUCTURES.bikeTempoIntervals },
      { date: '2026-07-21', title: 'KEY — 4×2km @ 10K pace', workoutType: 3, description: `KEY — 4×2km @ 10K RACE PACE
━━━━━━━━━━━━━━━━━━━━━━━━
BIG 10K session. 8km of pace work.

WARM-UP  (15min)
  • 2km easy + drills + 3×80m strides

MAIN SET  —  4×2km
  • Target: 3:36-3:40/km (102-105%)
  • Recovery: 400m easy jog (~2min 15s)
  • HR: Z4 upper 170-178
  • RPE 7.5/10 — you could do a 5th rep
  • Metronomic pacing — each rep within 3sec

COOL-DOWN  (10min)
  • Easy 5:20/km jog

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~12km  |  TSS ~80
The BIG 10K session. 8km at race pace.
If pacing is metronomic and HR <178, race is READY.`, distancePlanned: 12000, totalTimePlanned: 0.92, tssPlanned: 80, structure: STRUCTURES.tempo4x2km },
      { date: '2026-07-22', title: 'Easy run 10km + strides', workoutType: 3, description: `Easy run 10km + 4×100m strides
Pace: 5:00-5:15/km (Z1-Z2) | HR <150`, distancePlanned: 10000, totalTimePlanned: 0.87, structure: STRUCTURES.easyRun10km },
      { date: '2026-07-23', title: 'Gym + easy bike 45min', workoutType: 9, description: `Gym 35min — Last strength session

- Front squats 3x5
- Hip thrusts 3x8
- Single-leg calf raises 3x12
- Plank 3x45sec

Then: Easy bike 45min Z1-Z2.
Last gym session before taper.`, totalTimePlanned: 1.25 },
      { date: '2026-07-24', title: 'Easy run 7km shake', workoutType: 3, description: `Easy run 7km + 6×100m strides (shake-out)
Pace: 5:10-5:25/km (Z1) | HR <150`, distancePlanned: 7000, totalTimePlanned: 0.6, structure: STRUCTURES.easyRunStrides7km },
      { date: '2026-07-25', title: 'Long run 14km + 4km @ 10K pace', workoutType: 3, description: `LONG RUN — 14km WITH 4km @ 10K PACE FINISH
━━━━━━━━━━━━━━━━━━━━━━━━
SEGMENT 1  —  km 1-10 (EASY Z2)
  • Pace: 5:00-5:15/km | HR 146-156

SEGMENT 2  —  km 11-14 (10K PACE)
  • Pace: 3:38-3:44/km (98-103%)
  • HR: Z4 170-178
  • RPE 7.5/10

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 14km  |  TSS ~90
Last long run with pace work. 4km at 10K pace = dress rehearsal.`, distancePlanned: 14000, totalTimePlanned: 1.22, tssPlanned: 90, structure: STRUCTURES.longRun14km10kFinish },
      { date: '2026-07-26', title: 'Easy bike 75min Z2', workoutType: 2, description: `Endurance ride 75min Z2
168-227W | HR 146-156
Last big bike of the season.`, totalTimePlanned: 1.25, structure: STRUCTURES.bikeEndurance75 },

      // ============ WEEK 16 (Jul 27 - Aug 1) — TAPER + 10K TT ============
      { date: '2026-07-27', title: 'Easy bike 45min Z1', workoutType: 2, description: `Easy bike 45min Z1
<167W | HR <145 | Flat, easy, short.
Taper week. Less is more.`, totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },
      { date: '2026-07-28', title: 'Sharpener 3×1km', workoutType: 3, description: `SHARPENER — 3×1km
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (15min)
  • 2km easy + drills + 3×100m openers

MAIN SET  —  3×1km
  • Target: 3:33-3:36/km (104-106%, at/slightly faster than 10K pace)
  • Recovery: 400m easy jog
  • HR: Z4-Z5a 170-178
  • Only 3 reps. Short and sharp.

COOL-DOWN  (10min)

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~8km  |  TSS ~50
Last hard session. Leave fast, not tired.`, distancePlanned: 8000, totalTimePlanned: 0.67, tssPlanned: 50, structure: STRUCTURES.sharpener3x1km },
      { date: '2026-07-29', title: 'Yoga 30min', workoutType: 100, description: `Yoga 30min — gentle stretch only
Hip openers, hamstrings, calves.
Taper mode. The work is done.`, totalTimePlanned: 0.5 },
      { date: '2026-07-30', title: 'Easy run 5km + strides (opener)', workoutType: 3, description: `Easy run 5km + 4×100m strides
Pace: 5:10-5:20/km (Z1) | HR <150
Strides smooth, ~90% effort.
Wake up the legs. Visualize the 10K.`, distancePlanned: 5000, totalTimePlanned: 0.45, structure: STRUCTURES.easyRunStrides6km },
      { date: '2026-07-31', title: 'Rest', workoutType: 100, description: `REST DAY

Full rest before the 10K TT.
Hydrate. Eat well. Sleep 8+ hrs. Light walk OK.

Race plan:
- Km 1-2: 3:38-3:40 (DON'T go out fast)
- Km 3-5: 3:35-3:36 (settle, rhythm)
- Km 6-8: 3:33-3:35 (the engine room)
- Km 9: 3:30 (push — you can see the finish)
- Km 10: 3:25 or faster (EVERYTHING)`, totalTimePlanned: 0 },
      { date: '2026-08-01', title: '10K TIME TRIAL — sub-36:00', workoutType: 3, description: `10K TIME TRIAL — TARGET SUB-36:00
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (15min)
  • 2km easy jog
  • Dynamic drills (5min)
  • 3×100m at 10K race pace

RACE  —  10km
  • Target: 35:30-36:00 (3:33-3:36/km, 103-107%)
  • Km 1-2: 3:38-3:40 — CONTROLLED. Resist adrenaline.
  • Km 3-5: 3:35-3:36 — settle, rhythm, breathe
  • Km 6-8: 3:33-3:35 — engine room. HOLD FORM.
  • Km 9: 3:30 — dig deep, push the pace
  • Km 10: 3:25 or faster — EVERYTHING LEFT

COOL-DOWN  (10min)
  • Easy jog + walk

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~14km  |  TSS ~85
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
