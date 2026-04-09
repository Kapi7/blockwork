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
    repeatSetDist(3, 2000, 90, 94, 400, 55, 65),
    singleStep('Cool down', 600, 65, 75, 'coolDown'),
  ]),

  // 4x2km tempo @ 10K race pace
  tempo4x2km: runStructure([
    singleStep('Warm up', 720, 65, 75, 'warmUp'),
    repeatSetDist(4, 2000, 93, 97, 400, 55, 65),
    singleStep('Cool down', 600, 65, 75, 'coolDown'),
  ]),

  // 14km long run with last 4km @ 10K pace
  longRun14km10kFinish: runStructure([
    distStep('Easy', 10000, 70, 76, 'active'),
    distStep('10K pace finish', 4000, 88, 94, 'active'),
  ]),

  // 10K time trial
  tt10k: runStructure([
    singleStep('Warm up + openers', 900, 65, 85, 'warmUp'),
    distStep('10K RACE', 10000, 93, 100, 'active'),
    singleStep('Cool down', 600, 55, 70, 'coolDown'),
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
    stimulus: 'Rebuild aerobic base with structure. Hill work for power. Fartlek for gear changes. Bike volume for aerobic ceiling. Strength progressing.',
    goals: [
      'Build running to 40-50km/week across 3 quality runs + easy runs',
      'Introduce hill repeats and fartlek for neuromuscular power',
      'Long run to 18km with negative split finish',
      'Bike 2-3 sessions/week for aerobic volume without impact',
      'Strength progressing load week over week',
    ],
    successMetrics: [
      'Long run 18km with last km fastest',
      'Hill power: 200m uphill in 42-45sec',
      'Fartlek: 90s reps at 4:00-4:10/km without blowing up',
      'Tempo 3x1.5km at 4:15-4:25/km metronomic',
    ],
    weekPattern: 'Mon bike | Tue KEY1 (hills/track) | Wed gym | Thu KEY2 (fartlek/tempo) | Fri bike/easy | Sat long run | Sun long ride',
    restrictions: [
      'No 5K pace intervals yet (save for speed block)',
      'Long run must include negative split finish',
      'Week 4 is recovery — back off volume, test with 18km',
    ],
    sessions: [
      // ============ WEEK 1 (Apr 14-20) — Bridge intro ============
      { date: '2026-04-13', title: 'Easy bike Z2', workoutType: 2, description: 'Easy bike 60min Z2\nSteady Z2 195-225W (65-75% FTP). HR Z1-Z2 146-156.\nFirst day of base block. Protect legs for tomorrow.', totalTimePlanned: 1.0, structure: STRUCTURES.easyBike60 },
      { date: '2026-04-14', title: 'Easy run + strides', workoutType: 3, description: 'Easy run 7km @ 5:10/km\n+ 6x100m strides (build to 90%, walk back)\nStrides maintain turnover from Block 0. Relaxed, not sprinting.', distancePlanned: 7000, totalTimePlanned: 0.63, structure: STRUCTURES.easyRunStrides7km },
      { date: '2026-04-15', title: 'Gym — Strength (light)', workoutType: 9, description: 'Strength 45min (light)\n\n- Back squats 3x10\n- Walking lunges 3x8/leg\n- Single-leg RDL 3x8/leg\n- Glute bridges 3x12\n- Plank 3x45sec\n- Copenhagen plank 3x20sec/side\n\nModerate load. Build from Block 0 bodyweight base.', totalTimePlanned: 0.75 },
      { date: '2026-04-16', title: 'Bike 90s on/off', workoutType: 2, description: `BIKE — 90s ON/OFF (wake-up session)
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (10min)
  • Progressive Z1-Z2 | 90rpm

MAIN SET  —  8x (90s ON / 90s OFF)
  • ON: 85-95% FTP (255-285W) — strong but controlled
  • OFF: 50-60% FTP (150-180W) — easy spin
  • RPE on reps: 7/10 — NOT maximal

COOL-DOWN  (10min)
  • Easy Z1 spin

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 44min  |  TSS ~50
Fun intensity to wake up the engine. Not a test.`, totalTimePlanned: 0.73, tssPlanned: 50, structure: STRUCTURES.bikeOnOff90 },
      { date: '2026-04-17', title: 'Easy run', workoutType: 3, description: 'Easy run 6km @ 5:15-5:25/km\nZ1 only. HR <140. Smooth and relaxed.\nRecovery between intensity days.', distancePlanned: 6000, totalTimePlanned: 0.53, structure: STRUCTURES.easyRun6km },
      { date: '2026-04-18', title: 'Easy run + strides', workoutType: 3, description: 'Easy run 8km @ 5:10-5:20/km\n+ 6x100m strides\nLongest easy run of the week. Should feel comfortable.', distancePlanned: 8000, totalTimePlanned: 0.7, structure: STRUCTURES.easyRun8km },
      { date: '2026-04-19', title: 'Long ride Z2', workoutType: 2, description: `LONG RIDE — Z2 BASE + Z3 SURGES  (2hrs)
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (10min)
  • Easy Z1 spin

MAIN  (1h40)
  • Z2 base (65-75% FTP) with 3x 5min Z3 surges (78-85% FTP)
  • Surges are feel-based — on a climb or into headwind

COOL-DOWN  (10min)
  • Easy Z1

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 2hrs  |  TSS ~100
Bridge ride. Finish feeling strong.`, totalTimePlanned: 2.0, tssPlanned: 100, structure: STRUCTURES.longRide120Bridge },

      // ============ WEEK 2 (Apr 21-27) — First KEY sessions ============
      { date: '2026-04-20', title: 'Easy bike Z2', workoutType: 2, description: 'Easy bike 60min Z2\nSteady 195-225W. Conversational pace.\nProtect legs for tomorrow\'s first KEY session.', totalTimePlanned: 1.0, structure: STRUCTURES.easyBike60 },
      { date: '2026-04-21', title: 'KEY 1 — Hill repeats 6x200m', workoutType: 3, description: `KEY 1 — HILL REPEATS (power)
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (2.5km, ~15min)
  • 2km easy jog 5:10/km (Z1) | HR <156
  • Dynamic drills: leg swings, high knees, A-skips, B-skips (5min)
  • 3x 80m accelerations (build to 5K pace)

MAIN SET  —  6x 200m UPHILL
  • Grade: 6-8%
  • Target: 42-45sec per rep (3:30-3:45/km pace)
  • Effort: 9/10 — DRIVE knees, pump arms, tall posture
  • HR: Z4-Z5 on rep, recover to Z2 before next
  • Recovery: easy jog DOWN the hill (~90sec)

COOL-DOWN  (2.5km)
  • 2km easy 5:20/km (Z1 Recovery)
  • 4x 100m FLAT strides (build, not sprint)

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~10km  |  TSS ~65
PURPOSE: neuromuscular power + form under load.
Hills are the foundation that 5K speed sits on.`, distancePlanned: 10000, totalTimePlanned: 0.83, tssPlanned: 65, structure: STRUCTURES.hillRepeats6x200 },
      { date: '2026-04-22', title: 'Gym — Strength', workoutType: 9, description: 'Strength 45min\n\n- Back squats 3x8\n- Walking lunges 3x10/leg\n- Single-leg RDL 3x8/leg\n- Box jumps 3x5\n- Plank 3x45sec\n- Copenhagen plank 3x20sec/side\n\nModerate load, good form over heavy weight.', totalTimePlanned: 0.75 },
      { date: '2026-04-23', title: 'KEY 2 — Fartlek', workoutType: 3, description: `KEY 2 — FARTLEK (find the gears)
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (2km)
  • Easy jog 5:10/km (Z1) | HR <156
  • 4x 80m strides (build to tempo)

MAIN SET  —  8x (90s HARD / 90s EASY)
  • HARD: 4:00-4:10/km (Z3 upper, just under threshold)
     HR Z5a 175-180 | RPE 8/10
  • EASY: 5:15-5:30/km recovery jog
     HR drop to Z2 ~155bpm | RPE 4/10
  • Run by FEEL, not watch
  • Total work: 12min | Total set: 24min

COOL-DOWN  (2km)
  • Easy 5:20/km (Z1) + 2min walk

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~9km  |  TSS ~60
PURPOSE: teach the body to switch gears without blowing up.`, distancePlanned: 9000, totalTimePlanned: 0.75, tssPlanned: 60, structure: STRUCTURES.fartlek8x90 },
      { date: '2026-04-24', title: 'Easy bike', workoutType: 2, description: 'Easy bike 60min Z1-Z2\nFlat, easy, zero surges. RPE 2/10.\nPre-long run flush. Bike > run today.', totalTimePlanned: 1.0, structure: STRUCTURES.easyBike60 },
      { date: '2026-04-25', title: 'Long run 14km — negative split', workoutType: 3, description: `LONG RUN — NEGATIVE SPLIT (14km)
━━━━━━━━━━━━━━━━━━━━━━━━
SEGMENT 1  —  km 1-10 (PATIENCE)
  • Pace: 5:00-5:05/km (Z1/low Z2)
  • HR: Z2 146-156
  • RPE 4/10 — feel held back

SEGMENT 2  —  km 11-12 (SHIFT)
  • Pace: 4:45-4:50/km
  • HR: Z3 157-165
  • RPE 6/10

SEGMENT 3  —  km 13-14 (CONTROLLED PUSH)
  • Pace: 4:35-4:40/km
  • HR: Z3/Z4 165-174
  • RPE 7/10 — finish STRONG, not dead

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 14km ~70min  |  TSS ~85
Last km should be your fastest.`, distancePlanned: 14000, totalTimePlanned: 1.17, tssPlanned: 85, structure: STRUCTURES.longRun14kmProgressive },
      { date: '2026-04-26', title: 'Long ride Z2 2.5hrs', workoutType: 2, description: `LONG RIDE — Z2 AEROBIC (2.5hrs)
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (15min)
  • Progressive Z1-Z2 | 165-225W | 85-90rpm

MAIN  (2hrs 5min)
  • Steady Z2 195-225W | HR Z1-Z2 130-156
  • Cadence 85-95rpm
  • Natural Z3 bursts on climbs OK (<2min)

COOL-DOWN  (10min)
  • Easy Z1 spin

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 2.5hrs  |  TSS ~150
Bike = aerobic volume with ZERO impact on legs.
Hydrate: 750ml/hr + electrolytes.`, totalTimePlanned: 2.5, tssPlanned: 150, structure: STRUCTURES.longRide150 },

      // ============ WEEK 3 (Apr 28 - May 4) — Push ============
      { date: '2026-04-27', title: 'Easy bike Z2', workoutType: 2, description: 'Easy bike 60min Z2\nSteady 195-225W. Conversation pace.\nRecovery from weekend. Protect legs for track tomorrow.', totalTimePlanned: 1.0, structure: STRUCTURES.easyBike60 },
      { date: '2026-04-28', title: 'KEY 1 — Track 6x400m', workoutType: 3, description: `KEY 1 — TRACK 6x400m (speed endurance)
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (2.5km, ~18min)
  • 2km easy 5:10/km (Z1) | HR <156
  • Drills: A-skips, B-skips, butt kicks, high knees (5min)
  • 3x 80m accelerations (tempo to 5K pace)

MAIN SET  —  6x 400m
  • Target: 84-86sec per rep (3:30-3:35/km, Z5b 5K pace)
  • HR: Z5a-Z5b 178-185 on last 100m
  • RPE 8.5/10 — fast but NOT desperate
  • Recovery: 200m jog ~90sec, keep moving
  • Form cues: relaxed shoulders, quick feet, tall chest

COOL-DOWN  (2km)
  • Easy 5:20/km (Z1) + walk + gentle stretch

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~10km  |  TSS ~70
Negative split the set (6th = fastest).`, distancePlanned: 10000, totalTimePlanned: 0.83, tssPlanned: 70, structure: STRUCTURES.track6x400 },
      { date: '2026-04-29', title: 'Gym — Strength (heavier)', workoutType: 9, description: 'Strength 45min — progress the load\n\n- Front squats 3x6\n- Bulgarian split squats 3x8/leg\n- Hip thrusts 3x10\n- Box jumps 3x5 (higher box)\n- Core: dead bugs, pallof press, side plank\n- Calf raises 3x15 (weighted, slow eccentric)\n\nHeavier than last week. Form first.', totalTimePlanned: 0.75 },
      { date: '2026-04-30', title: 'KEY 2 — Tempo 3x1.5km', workoutType: 3, description: `KEY 2 — TEMPO CRUISE (3x1.5km)
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (2.5km)
  • 2km easy 5:10/km (Z1)
  • 4x 100m strides

MAIN SET  —  3x 1.5km
  • Target: 4:15-4:25/km (Z3 Tempo / threshold)
  • HR: Z4-Z5a 170-180 (just under LTHR 180)
  • RPE 7.5/10 — comfortably hard, controlled breathing
  • Recovery: 90sec easy jog (~5:40/km)
  • Goal: METRONOMIC pacing — each rep within 3sec of target

COOL-DOWN  (2km)
  • Easy 5:20/km (Z1) + walk

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~9km  |  TSS ~65
If HR drifts >185 mid-rep, ease back.`, distancePlanned: 9000, totalTimePlanned: 0.75, tssPlanned: 65, structure: STRUCTURES.tempo3x1500 },
      { date: '2026-05-01', title: 'Easy bike', workoutType: 2, description: 'Easy bike 60min Z1-Z2\nRecovery spin. HR <145. RPE 2/10.\nProtect legs for tomorrow\'s long run.', totalTimePlanned: 1.0, structure: STRUCTURES.easyBike60 },
      { date: '2026-05-02', title: 'Long run 16km — progressive', workoutType: 3, description: `LONG RUN — PROGRESSIVE (16km)
━━━━━━━━━━━━━━━━━━━━━━━━
SEGMENT 1  —  km 1-11 (HOLD BACK)
  • Pace: 5:00-5:05/km (Z1/low Z2)
  • HR: Z2 146-156
  • RPE 4/10 — should feel EASY

SEGMENT 2  —  km 12-14 (SHIFT)
  • Pace: 4:45/km (Z2)
  • HR: Z3 157-165
  • RPE 6/10

SEGMENT 3  —  km 15-16 (CONTROLLED SURGE)
  • Pace: 4:30-4:35/km (Z2-Z3 boundary)
  • HR: Z3/Z4 165-174
  • RPE 7.5/10 — strong, not max

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 16km ~80min  |  TSS ~95
Last 5km teaches the body to run fast when TIRED.
Fueling: 30g carbs at km 9.`, distancePlanned: 16000, totalTimePlanned: 1.33, tssPlanned: 95, structure: STRUCTURES.longRun16kmProgressive },
      { date: '2026-05-03', title: 'Long ride + hills 2.75hrs', workoutType: 2, description: `LONG RIDE + HILLS (2h45)
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (15min)
  • Progressive Z1-Z2 | 165-225W | 90rpm

MAIN  —  Endurance + Climbs
  • Base: Z2 210-240W | 85-90rpm
  • CLIMBS (3-4 natural or Zwift):
     Seated: Z3 245-265W | 80rpm
     Standing surges: 30sec @ Z4 290W+
  • HR: 130-160 base, 165-175 on climbs

COOL-DOWN  (10min)
  • Easy Z1 spin

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 2h45  |  TSS ~170
Hills on the bike = free strength work for running.`, totalTimePlanned: 2.75, tssPlanned: 170, structure: STRUCTURES.longRide165Hills },

      // ============ WEEK 4 (May 5-11) — Recovery + block test ============
      { date: '2026-05-04', title: 'Easy bike Z1', workoutType: 2, description: 'Easy bike 45min Z1\nRecovery week. Flat, easy, conversation pace.\nLet the body absorb 3 weeks of work.', totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },
      { date: '2026-05-05', title: 'Easy run + strides', workoutType: 3, description: 'Easy run 7km @ 5:10/km\n+ 6x100m strides (build to 90%, walk back)\nRecovery week. Keep it smooth and relaxed.', distancePlanned: 7000, totalTimePlanned: 0.63, structure: STRUCTURES.easyRunStrides7km },
      { date: '2026-05-06', title: 'Gym — lighter', workoutType: 9, description: 'Strength 40min — recovery week, lighter loads\n\n- Deadlift 3x5\n- Hip thrusts 3x10\n- Single-leg calf raises 3x12\n- Core: plank variations, pallof press\n\nMaintain, don\'t overload. Body needs to absorb.', totalTimePlanned: 0.67 },
      { date: '2026-05-07', title: 'Bike 90s on/off', workoutType: 2, description: `BIKE — 90s ON/OFF
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (10min)
  • Progressive Z1-Z2 | 90rpm

MAIN SET  —  8x (90s ON / 90s OFF)
  • ON: 85-95% FTP (255-285W)
  • OFF: 50-60% FTP (150-180W)
  • RPE 7/10 — keep it fun

COOL-DOWN  (10min)
  • Easy Z1 spin

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 55min  |  TSS ~55
Recovery-week intensity on the bike, not the legs.`, totalTimePlanned: 0.92, tssPlanned: 55, structure: STRUCTURES.bikeOnOff90 },
      { date: '2026-05-08', title: 'Yoga / mobility', workoutType: 100, description: 'Yoga / mobility 40min\n- Long hold pigeon pose 3min/side\n- Deep squat hold 2min\n- Hamstring PNF stretching\n- Foam roll quads, calves, glutes\n\nPre-block-test recovery. Protect the tank.', totalTimePlanned: 0.67 },
      { date: '2026-05-09', title: 'Long run 18km — THE BLOCK TEST', workoutType: 3, description: `LONG RUN — THE BLOCK TEST (18km)
━━━━━━━━━━━━━━━━━━━━━━━━
SEGMENT 1  —  km 1-13 (PATIENCE)
  • Pace: 5:00/km (low Z2) exact
  • HR: Z2 146-156
  • RPE 4/10 — FEEL HELD BACK

SEGMENT 2  —  km 14-15 (SHIFT)
  • Pace: 4:40/km (Z2 top)
  • HR: Z3 160-168
  • RPE 6/10

SEGMENT 3  —  km 16-17 (PUSH)
  • Pace: 4:25/km (Z3 Tempo)
  • HR: Z3-Z4 168-175
  • RPE 8/10

SEGMENT 4  —  km 18 (FAST)
  • Pace: 4:15/km
  • HR: Z5a 175-180
  • RPE 9/10 — controlled maximum

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 18km ~90min  |  TSS ~110
THE BLOCK 1 EXAM.
Finish strong = GREEN LIGHT for Block 2 (speed).
Last km MUST be your fastest.
Fuel: 30g carbs at km 9 + 30g at km 14.`, distancePlanned: 18000, totalTimePlanned: 1.5, tssPlanned: 110, structure: STRUCTURES.longRun18kmTest },
      { date: '2026-05-10', title: 'Easy recovery ride', workoutType: 2, description: 'Recovery ride 75min Z1\nEasy Z1 150-180W. Flat, zero surges. RPE 2/10.\nBase block DONE. How did the 18km feel?\nSpeed block starts tomorrow.', totalTimePlanned: 1.25, structure: STRUCTURES.recoveryRide60 },
    ],
  },
  // ═══════════════ BLOCK 2: Hunt the 5K (May 12 - Jun 8) ═══════════════
  {
    id: 'block-2-speed',
    number: 2,
    name: 'Hunt the 5K',
    phase: 'speed',
    startDate: '2026-05-11',
    endDate: '2026-06-07',
    stimulus: '5K-specific speed. Track intervals at race pace and faster. Bike maintains aerobic base. Every run matters.',
    goals: [
      '5K pace reps (3:28-3:32/km) feeling controlled',
      '800m reps at 3:22-3:26/km (overspeed)',
      'Tempo: 3km @ 3:55-4:00/km continuous',
      'Long run with 5K pace finish',
    ],
    successMetrics: [
      '1km reps @ 3:28-3:32/km with HR < 178',
      '800m reps at 3:22-3:26/km smooth',
      '3km tempo at 3:55-4:00 controlled',
      'Long run 5K pace finish executed cleanly',
    ],
    weekPattern: 'Mon bike | Tue KEY1 track | Wed gym | Thu KEY2 tempo+speed | Fri bike | Sat long run w/ fast finish | Sun long ride',
    restrictions: [
      'Max 3 hard runs per week — no junk miles',
      'Track work on track or flat route only',
      'Long run max 14km — energy for speed',
      'Week 8 is full recovery — no intensity',
    ],
    sessions: [
      // ============ WEEK 5 (May 12-18) — Introduce race pace ============
      { date: '2026-05-11', title: 'Easy bike Z2', workoutType: 2, description: 'Easy bike 60min Z2\nRecovery from Block 1 test. Spin the legs out.\nConversational pace, flat terrain.', totalTimePlanned: 1.0, structure: STRUCTURES.easyBike60 },
      { date: '2026-05-12', title: 'KEY 1 — Track 5x1km', workoutType: 3, description: `KEY 1 — TRACK 5x1km @ 5K PACE
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (15min)
  • 2km easy jog 5:10/km
  • Dynamic drills: leg swings, A-skips, B-skips
  • 3x 80m accelerations

MAIN SET  —  5x 1km
  • Target: 3:28-3:32/km (5K race pace)
  • Recovery: 400m easy jog between reps (~2min)
  • HR: should hit Z4-Z5a on reps
  • Focus: RELAXED speed. Smooth turnover, not grinding.

COOL-DOWN  (10min)
  • Easy jog + walk

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~10km  |  TSS ~70
First time at 5K pace in the speed block. Feel the speed.`, distancePlanned: 10000, totalTimePlanned: 0.83, tssPlanned: 70, structure: STRUCTURES.track5x1km },
      { date: '2026-05-13', title: 'Gym + easy bike', workoutType: 9, description: 'Strength 40min\n\n- Back squats 3x6\n- Single-leg RDL 3x8/leg\n- Box jumps 3x5\n- Calf raises 3x15 (weighted, slow eccentric)\n- Core: dead bugs, pallof press, plank 3x45sec\n\nThen: Easy bike 30-45min Z1 if legs allow.', totalTimePlanned: 0.67 },
      { date: '2026-05-14', title: 'KEY 2 — Tempo 3km + 4x200m', workoutType: 3, description: `KEY 2 — TEMPO 3km + 4x200m SHARPENERS
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (12min)
  • 2km easy jog + drills + 2x 100m strides

MAIN SET A  —  Tempo 3km
  • Target: 3:55-4:00/km (just under threshold)
  • HR: Z3-Z4 — comfortably hard
  • Should feel smooth, not a death march

3min easy jog recovery

MAIN SET B  —  4x 200m
  • Target: 39-41sec (3:15-3:20/km pace)
  • Recovery: 200m walk/jog
  • Fast and EASY — nervous system activation

COOL-DOWN  (10min)
  • Easy jog

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~9km  |  TSS ~65`, distancePlanned: 9000, totalTimePlanned: 0.75, tssPlanned: 65, structure: STRUCTURES.tempoAndSharpeners },
      { date: '2026-05-15', title: 'Easy bike / yoga', workoutType: 2, description: 'Easy bike 60min Z1-Z2\nOR yoga 40min\nPre-long-run day. Protect the legs.\nIf heavy from Thursday, do yoga instead.', totalTimePlanned: 1.0, structure: STRUCTURES.easyBike60 },
      { date: '2026-05-16', title: 'Long run 14km — tempo finish', workoutType: 3, description: `LONG RUN — 14km WITH TEMPO FINISH
━━━━━━━━━━━━━━━━━━━━━━━━
MAIN  (14km)
  • Km 1-11: Easy Z1-Z2, 4:50-5:10/km
  • Km 12-14: Push to 4:00-4:10/km (Z3 tempo)
  • HR: stay Z2 for first 11km, Z3 for finish

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 14km  |  TSS ~90
Finish strong. If tempo feels hard, you're too tired — easy is fine.`, distancePlanned: 14000, totalTimePlanned: 1.17, tssPlanned: 90, structure: STRUCTURES.longRun14kmTempoFinish },
      { date: '2026-05-17', title: 'Long ride Z2 2.5hrs', workoutType: 2, description: 'Long ride 2.5hrs Z2\nAerobic maintenance. Steady effort.\nKeep HR in Z2, cadence 85-90rpm.', totalTimePlanned: 2.5, structure: STRUCTURES.longRide150 },

      // ============ WEEK 6 (May 19-25) — Sharpen ============
      { date: '2026-05-18', title: 'Easy bike recovery', workoutType: 2, description: 'Recovery ride 60min Z1\nFlat, easy spin. Active recovery from the weekend.', totalTimePlanned: 1.0, structure: STRUCTURES.recoveryRide60 },
      { date: '2026-05-19', title: 'KEY 1 — Track 6x800m', workoutType: 3, description: `KEY 1 — TRACK 6x800m (FASTER THAN RACE PACE)
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (15min)
  • 2km easy jog + drills
  • 3x 80m accelerations

MAIN SET  —  6x 800m
  • Target: 2:42-2:45 per 800m (3:22-3:26/km)
  • That's FASTER than 5K pace — overspeed training
  • Recovery: 400m easy jog between reps
  • Focus: arrive at rep 6 still smooth

COOL-DOWN  (10min)
  • Easy jog + walk

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~10km  |  TSS ~75
Overspeed — should feel faster than last week's 1km reps.`, distancePlanned: 10000, totalTimePlanned: 0.83, tssPlanned: 75, structure: STRUCTURES.track6x800m },
      { date: '2026-05-20', title: 'Gym (maintain) + yoga', workoutType: 9, description: 'Strength 35min (maintenance)\n\n- Front squats 3x5\n- Hip thrusts 3x10\n- Single-leg calf raises 3x12\n- Core: plank variations\n\nThen: Yoga 20min — hips + hamstrings.\nSpeed block gym: maintain, don\'t build. No DOMS.', totalTimePlanned: 0.58 },
      { date: '2026-05-21', title: 'KEY 2 — 2km tempo + 6x400m', workoutType: 3, description: `KEY 2 — 2km TEMPO + 6x400m
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (12min)
  • 2km easy jog + drills + strides

MAIN SET A  —  Tempo 2km
  • Target: 3:50/km (Z4 threshold)
  • Shorter and faster than last week's tempo

3min easy jog recovery

MAIN SET B  —  6x 400m
  • Target: 80-82sec per 400 (3:20-3:25/km)
  • Recovery: 200m walk/jog
  • THE 5K sharpener session. Neuromuscular speed.

COOL-DOWN  (10min)

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~9km  |  TSS ~70`, distancePlanned: 9000, totalTimePlanned: 0.75, tssPlanned: 70, structure: STRUCTURES.tempoAnd400s },
      { date: '2026-05-22', title: 'Easy bike', workoutType: 2, description: 'Easy bike 60min Z1-Z2\nRecovery spin before long run.\nKeep it genuinely easy.', totalTimePlanned: 1.0, structure: STRUCTURES.easyBike60 },
      { date: '2026-05-23', title: 'Long run 12km — 5K pace finish', workoutType: 3, description: `LONG RUN — 12km WITH 5K PACE FINISH
━━━━━━━━━━━━━━━━━━━━━━━━
MAIN  (12km)
  • Km 1-10: Easy Z1-Z2, 4:50-5:10/km
  • Km 11-12: PUSH to 3:30/km (5K race pace!)
  • Last 2km should feel like the finish of a real 5K

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 12km  |  TSS ~80
Race-pace legs on tired legs. Key rehearsal.`, distancePlanned: 12000, totalTimePlanned: 1.0, tssPlanned: 80, structure: STRUCTURES.longRun12km5kFinish },
      { date: '2026-05-24', title: 'Easy ride 90min Z2', workoutType: 2, description: 'Easy ride 90min Z2\nSteady aerobic effort, nothing hard.\nCadence 85-90rpm.', totalTimePlanned: 1.5, structure: STRUCTURES.bikeEndurance90 },

      // ============ WEEK 7 (May 26 - Jun 1) — Peak ============
      { date: '2026-05-25', title: 'Easy bike Z2', workoutType: 2, description: 'Easy bike 60min Z2\nSteady aerobic maintenance.\nKeep legs fresh for Tuesday\'s sharpener.', totalTimePlanned: 1.0, structure: STRUCTURES.easyBike60 },
      { date: '2026-05-26', title: 'KEY 1 — 3x1km sharpener', workoutType: 3, description: `KEY 1 — SHARPENER 3x1km
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (15min)
  • 2km easy + drills + openers (3x 100m at race pace)

MAIN SET  —  3x 1km
  • Target: 3:25-3:28/km (slightly faster than race pace)
  • Recovery: 400m easy jog
  • Only 3 reps. Sharp, not fatiguing.

COOL-DOWN  (10min)
  • Easy jog

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~8km  |  TSS ~55
Short and fast. Leave feeling sharp, not tired.`, distancePlanned: 8000, totalTimePlanned: 0.67, tssPlanned: 55, structure: STRUCTURES.sharpener3x1km },
      { date: '2026-05-27', title: 'Gym (maintain)', workoutType: 9, description: 'Strength 35min (maintenance)\n\n- Front squats 3x5\n- Hip thrusts 3x10\n- Single-leg calf raises 3x12\n- Core: plank variations\n\nMaintain only. No DOMS. No new exercises.', totalTimePlanned: 0.58 },
      { date: '2026-05-28', title: 'KEY 2 — Tempo 3km + 4x200m', workoutType: 3, description: `KEY 2 — TEMPO 3km + 4x200m SHARPENERS
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (12min)
  • 2km easy jog + drills + strides

MAIN SET A  —  Tempo 3km
  • Target: 3:55-4:00/km (just under threshold)
  • HR: Z3-Z4 — comfortably hard

3min easy jog recovery

MAIN SET B  —  4x 200m
  • Target: 39-41sec (3:15-3:20/km)
  • Recovery: 200m walk/jog
  • Fast and easy — nervous system priming

COOL-DOWN  (10min)

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~9km  |  TSS ~65`, distancePlanned: 9000, totalTimePlanned: 0.75, tssPlanned: 65, structure: STRUCTURES.tempoAndSharpeners },
      { date: '2026-05-29', title: 'Easy bike', workoutType: 2, description: 'Easy bike 60min Z1-Z2\nPre-long-run flush. Easy does it.', totalTimePlanned: 1.0, structure: STRUCTURES.easyBike60 },
      { date: '2026-05-30', title: 'Long run 14km — tempo finish', workoutType: 3, description: `LONG RUN — 14km WITH TEMPO FINISH
━━━━━━━━━━━━━━━━━━━━━━━━
MAIN  (14km)
  • Km 1-11: Easy Z1-Z2, 4:50-5:10/km
  • Km 12-14: Push to 4:00-4:10/km (Z3 tempo)
  • HR: stay Z2 for first 11km, Z3 for finish

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 14km  |  TSS ~90
Peak week long run. Finish strong.`, distancePlanned: 14000, totalTimePlanned: 1.17, tssPlanned: 90, structure: STRUCTURES.longRun14kmTempoFinish },
      { date: '2026-05-31', title: 'Long ride Z2 2hrs', workoutType: 2, description: 'Long ride 2hrs Z2\nSteady aerobic base. Z2 195-225W.\nLast big ride before recovery week.', totalTimePlanned: 2.0, structure: STRUCTURES.longRide120Bridge },

      // ============ WEEK 8 (Jun 2-8) — Recovery ============
      { date: '2026-06-01', title: 'Easy bike Z1', workoutType: 2, description: 'Easy bike 45min Z1\nRecovery week. Flat, easy, short.\nLet the body absorb 3 weeks of speed work.', totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },
      { date: '2026-06-02', title: 'Easy run + strides', workoutType: 3, description: 'Easy run 7km @ 5:10/km\n+ 6x100m strides (build to 90%, walk back)\nRecovery week. Smooth and relaxed.', distancePlanned: 7000, totalTimePlanned: 0.63, structure: STRUCTURES.easyRunStrides7km },
      { date: '2026-06-03', title: 'Yoga only', workoutType: 100, description: 'Yoga 30min — gentle stretch\nNo gym this week. Recovery.\nHip openers, hamstrings, calves.\nRelax. Trust the training.', totalTimePlanned: 0.5 },
      { date: '2026-06-04', title: 'Easy run + strides', workoutType: 3, description: 'Easy run 6km @ 5:15/km\n+ 4x100m strides (relaxed speed)\nKeep the legs turning over. Nothing hard.', distancePlanned: 6000, totalTimePlanned: 0.53, structure: STRUCTURES.easyRunStrides6km },
      { date: '2026-06-05', title: 'Easy bike', workoutType: 2, description: 'Easy bike 45min Z1\nGentle spin. Active recovery only.', totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },
      { date: '2026-06-06', title: 'Easy run 8km', workoutType: 3, description: 'Easy run 8km @ 5:10-5:20/km\nZ1-Z2 only. Longest run of recovery week.\nShould feel refreshed and ready to sharpen.', distancePlanned: 8000, totalTimePlanned: 0.7, structure: STRUCTURES.easyRun8km },
      { date: '2026-06-07', title: 'Easy ride 90min Z2', workoutType: 2, description: 'Easy ride 90min Z2\nSteady aerobic maintenance.\nBlock 2 complete. Ready for the blade.', totalTimePlanned: 1.5, structure: STRUCTURES.bikeEndurance90 },
    ],
  },
  // ═══════════════ BLOCK 3: Sharpen the Blade (Jun 9 - Jul 6) ═══════════════
  {
    id: 'block-3-sharpen',
    number: 3,
    name: 'Sharpen the Blade',
    phase: 'speed',
    startDate: '2026-06-08',
    endDate: '2026-07-05',
    stimulus: 'Race-specific sharpening. Overspeed reps, race simulation, 5K time trial. Taper into A-race.',
    goals: [
      '800m reps at 3:18-3:22/km (overspeed)',
      '3km time trial under 10:30',
      'Speed combo 4x400m + 4x200m smooth',
      '5K TIME TRIAL: sub-17:30 on Jul 5',
    ],
    successMetrics: [
      '3km TT under 10:30 (3:30/km)',
      '800m reps at 3:18-3:22 arriving smooth at rep 6',
      '5K TT sub-17:30 (stretch: 17:00-17:15)',
      'Race execution: even or negative split',
    ],
    weekPattern: 'Mon bike | Tue KEY1 (track/race sim) | Wed gym/yoga | Thu KEY2 (tempo+speed/combo) | Fri bike | Sat long run/easy | Sun ride',
    restrictions: [
      'Week 12 is strict taper — reduced volume, short sharp reps only',
      'No new training stimuli in race week',
      'No strength after week 11',
      'Long run max 12km in this block',
    ],
    sessions: [
      // ============ WEEK 9 (Jun 9-15) — Overspeed ============
      { date: '2026-06-08', title: 'Easy bike Z2', workoutType: 2, description: 'Easy bike 60min Z2\nSteady 195-225W. Fresh start to the sharpening block.\nLegs should feel recharged after recovery week.', totalTimePlanned: 1.0, structure: STRUCTURES.easyBike60 },
      { date: '2026-06-09', title: 'KEY 1 — 6x800m overspeed', workoutType: 3, description: `KEY 1 — TRACK 6x800m (OVERSPEED)
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (15min)
  • 2km easy jog + drills
  • 3x 80m accelerations

MAIN SET  —  6x 800m
  • Target: 2:38-2:42 per 800m (3:18-3:22/km)
  • FASTER than 5K pace — training the nervous system
  • Recovery: 400m easy jog between reps
  • Focus: smooth and controlled at this new speed

COOL-DOWN  (10min)
  • Easy jog + walk

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~10km  |  TSS ~75
Overspeed makes 5K pace feel slower on race day.`, distancePlanned: 10000, totalTimePlanned: 0.83, tssPlanned: 75, structure: STRUCTURES.track6x800m },
      { date: '2026-06-10', title: 'Gym (maintain)', workoutType: 9, description: 'Strength 35min (maintenance)\n\n- Front squats 3x5\n- Hip thrusts 3x10\n- Calf raises 3x12\n- Core: plank variations\n\nMaintain only. No DOMS.', totalTimePlanned: 0.58 },
      { date: '2026-06-11', title: 'KEY 2 — 2km tempo + 6x400m', workoutType: 3, description: `KEY 2 — 2km TEMPO + 6x400m @ 78-80sec
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (12min)
  • 2km easy jog + drills + strides

MAIN SET A  —  Tempo 2km
  • Target: 3:50/km (Z4 threshold)

3min easy jog recovery

MAIN SET B  —  6x 400m
  • Target: 78-80sec per 400 (3:15-3:20/km)
  • Recovery: 200m walk/jog
  • Faster than last block's 400s. Speed is building.

COOL-DOWN  (10min)

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~9km  |  TSS ~70`, distancePlanned: 9000, totalTimePlanned: 0.75, tssPlanned: 70, structure: STRUCTURES.tempoAnd400s },
      { date: '2026-06-12', title: 'Easy bike / yoga', workoutType: 2, description: 'Easy bike 60min Z1-Z2\nOR yoga 40min\nPre-long-run day. Protect the legs.', totalTimePlanned: 1.0, structure: STRUCTURES.easyBike60 },
      { date: '2026-06-13', title: 'Long run 12km — 5K pace finish', workoutType: 3, description: `LONG RUN — 12km WITH 5K PACE FINISH
━━━━━━━━━━━━━━━━━━━━━━━━
MAIN  (12km)
  • Km 1-10: Easy Z1-Z2, 4:50-5:10/km
  • Km 11-12: PUSH to 3:30/km (5K race pace!)
  • Last 2km = race rehearsal on tired legs

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 12km  |  TSS ~80
Key rehearsal for the 5K TT in 3 weeks.`, distancePlanned: 12000, totalTimePlanned: 1.0, tssPlanned: 80, structure: STRUCTURES.longRun12km5kFinish },
      { date: '2026-06-14', title: 'Long ride Z2 2hrs', workoutType: 2, description: 'Long ride 2hrs Z2\nSteady aerobic base. Z2 195-225W.\nCadence 85-90rpm.', totalTimePlanned: 2.0, structure: STRUCTURES.longRide120Bridge },

      // ============ WEEK 10 (Jun 16-22) — Race simulation ============
      { date: '2026-06-15', title: 'Easy bike recovery', workoutType: 2, description: 'Recovery ride 60min Z1\nFlat, easy spin. Active recovery from the weekend.', totalTimePlanned: 1.0, structure: STRUCTURES.recoveryRide60 },
      { date: '2026-06-16', title: 'KEY 1 — 3km time trial', workoutType: 3, description: `KEY 1 — 3km TIME TRIAL (race simulation)
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (15min)
  • 2km easy jog + drills
  • 3x 100m at race pace (openers)

RACE  —  3km
  • Target: sub-10:30 (3:30/km or faster)
  • Km 1: 3:32 — controlled start
  • Km 2: 3:28-3:30 — settle and push
  • Km 3: 3:25 or faster — EVERYTHING

COOL-DOWN  (10min)
  • Easy jog + walk

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~8km  |  TSS ~55
Race simulation. Practice your pacing strategy for the 5K.`, distancePlanned: 8000, totalTimePlanned: 0.67, tssPlanned: 55, structure: STRUCTURES.tt3k },
      { date: '2026-06-17', title: 'Gym (light) + yoga', workoutType: 9, description: 'Strength 30min (light)\n\n- Squats 2x8 (light)\n- Hip thrusts 2x10\n- Core: planks, dead bugs\n\nThen: Yoga 20min — hips + hamstrings.\nLight touch only after yesterday\'s TT.', totalTimePlanned: 0.5 },
      { date: '2026-06-18', title: 'KEY 2 — 5x1km @ 5K pace', workoutType: 3, description: `KEY 2 — TRACK 5x1km @ 5K PACE
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (15min)
  • 2km easy jog + drills
  • 3x 80m accelerations

MAIN SET  —  5x 1km
  • Target: 3:25-3:28/km (slightly faster than race pace)
  • Recovery: 400m easy jog
  • HR: Z4-Z5a on reps
  • These should feel EASIER than early in Block 2

COOL-DOWN  (10min)
  • Easy jog

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~10km  |  TSS ~70
Gauge: if 3:25 feels comfortable, 17:30 is in the bag.`, distancePlanned: 10000, totalTimePlanned: 0.83, tssPlanned: 70, structure: STRUCTURES.track5x1km },
      { date: '2026-06-19', title: 'Easy bike', workoutType: 2, description: 'Easy bike 45min Z1\nShort, easy spin. Pre-long-run flush.', totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },
      { date: '2026-06-20', title: 'Long run 10km — 5K pace finish', workoutType: 3, description: `LONG RUN — 10km WITH 5K PACE FINISH
━━━━━━━━━━━━━━━━━━━━━━━━
MAIN  (10km)
  • Km 1-7: Easy Z1-Z2, 4:50-5:10/km
  • Km 8-10: PUSH to 3:28-3:32/km (5K race pace)
  • 3km at 5K pace on tired legs — the real race rehearsal

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 10km  |  TSS ~70
This is the dress rehearsal. Execute the finish.`, distancePlanned: 10000, totalTimePlanned: 0.83, tssPlanned: 70, structure: STRUCTURES.longRun10km5kFinish },
      { date: '2026-06-21', title: 'Easy ride 90min Z2', workoutType: 2, description: 'Easy ride 90min Z2\nSteady aerobic maintenance.\nLast big ride before taper.', totalTimePlanned: 1.5, structure: STRUCTURES.bikeEndurance90 },

      // ============ WEEK 11 (Jun 23-29) — Final sharpening ============
      { date: '2026-06-22', title: 'Easy bike Z1', workoutType: 2, description: 'Easy bike 45min Z1\nTaper begins. Less volume, maintain sharpness.\nFlat, easy, short.', totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },
      { date: '2026-06-23', title: 'KEY 1 — Sharpener 3x1km', workoutType: 3, description: `KEY 1 — SHARPENER 3x1km
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (15min)
  • 2km easy + drills + openers (3x 100m at race pace)

MAIN SET  —  3x 1km
  • Target: 3:22-3:25/km (slightly faster than race pace)
  • Recovery: 400m easy jog
  • Only 3 reps. Sharp, not fatiguing.

COOL-DOWN  (10min)
  • Easy jog

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~8km  |  TSS ~50
Last hard 1km reps before the TT. Leave fast, not tired.`, distancePlanned: 8000, totalTimePlanned: 0.67, tssPlanned: 50, structure: STRUCTURES.sharpener3x1km },
      { date: '2026-06-24', title: 'Yoga only', workoutType: 100, description: 'Yoga 30min — gentle stretch\nNo gym from here to race day.\nHip openers, hamstrings, calves.\nRelax. Trust the training.', totalTimePlanned: 0.5 },
      { date: '2026-06-25', title: 'KEY 2 — Speed combo 4x400m + 4x200m', workoutType: 3, description: `KEY 2 — SPEED COMBO (4x400m + 4x200m)
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (15min)
  • 2km easy + drills + 3x 80m accelerations

SET A  —  4x 400m
  • Target: 78-80sec (3:15-3:20/km)
  • Recovery: 200m jog
  • Fast and controlled — neuromuscular priming

3min recovery jog

SET B  —  4x 200m
  • Target: 37-39sec (3:05-3:15/km)
  • Recovery: 200m walk/jog
  • FAST. Pure speed. Relaxed face.

COOL-DOWN  (10min)
  • Easy jog

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~7km  |  TSS ~55
Last real speed session. Leave feeling ELECTRIC.`, distancePlanned: 7000, totalTimePlanned: 0.58, tssPlanned: 55, structure: STRUCTURES.speedCombo400200 },
      { date: '2026-06-26', title: 'Easy bike short', workoutType: 2, description: 'Easy bike 30min Z1\nVery short and easy. Just spin the legs.\nTaper mode — less is more.', totalTimePlanned: 0.5, structure: STRUCTURES.easyBike45 },
      { date: '2026-06-27', title: 'Easy run 8km + strides', workoutType: 3, description: 'Easy run 8km @ 5:10-5:20/km\n+ 6x100m strides\nLast longer run before race week. Smooth and controlled.\nVisualize the TT.', distancePlanned: 8000, totalTimePlanned: 0.7, structure: STRUCTURES.easyRun8km },
      { date: '2026-06-28', title: 'Easy ride 60min', workoutType: 2, description: 'Easy ride 60min Z1-Z2\nGentle spin. Active recovery only.\nRace week starts tomorrow.', totalTimePlanned: 1.0, structure: STRUCTURES.easyBike60 },

      // ============ WEEK 12 (Jun 30 - Jul 6) — RACE WEEK ============
      { date: '2026-06-29', title: 'Rest', workoutType: 100, description: 'REST DAY\n\nFull rest. Hydrate. Eat well. Sleep 8hrs.\nNo running. No gym. Light walk OK.\nMental prep: visualize the race, km by km.', totalTimePlanned: 0 },
      { date: '2026-06-30', title: 'Easy run + strides (opener)', workoutType: 3, description: 'Easy run 6km @ 5:15/km\n+ 4x100m strides (relaxed speed)\nOpener run. Short and smooth.\nVisualize the TT — first km controlled, build from there.', distancePlanned: 6000, totalTimePlanned: 0.5, structure: STRUCTURES.easyRunStrides6km },
      { date: '2026-07-01', title: 'Yoga 20min', workoutType: 100, description: 'Yoga 20min — gentle stretch only\nHip openers, hamstrings, calves.\nNothing new. Breathe. Trust the training.', totalTimePlanned: 0.33 },
      { date: '2026-07-02', title: 'Easy run + race pace openers', workoutType: 3, description: `RACE-WEEK OPENER (4km + 2x200m)
━━━━━━━━━━━━━━━━━━━━━━━━
MAIN  (4km)
  • Easy jog 5:10-5:20/km (Z1)

OPENERS  —  2x 200m @ race pace
  • Target: 42sec per 200 (~3:30/km)
  • Recovery: 200m easy jog
  • Just 2 reps. Wake up the legs, nothing more.

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~5km  |  22min
Feel sharp. If these feel easy, Saturday will fly.`, distancePlanned: 4800, totalTimePlanned: 0.37, structure: STRUCTURES.raceWeekOpener },
      { date: '2026-07-03', title: 'Rest', workoutType: 100, description: 'REST DAY\n\nFull rest before the 5K TT.\nHydrate. Eat well. Sleep 8hrs.\nNo running. No gym. Light walk OK.\n\nRace plan:\n- Km 1: 3:32-3:35 (DON\'T go out fast)\n- Km 2-3: 3:28-3:30 (settle into rhythm)\n- Km 4: 3:28 (the crucible — hold form)\n- Km 5: 3:25 or faster (EVERYTHING left)', totalTimePlanned: 0 },
      { date: '2026-07-04', title: '5K TIME TRIAL — sub-17:30', workoutType: 3, description: `5K TIME TRIAL — TARGET SUB-17:30
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (15min)
  • 2km easy jog
  • Dynamic drills
  • 3x 100m at race pace (openers)

RACE  —  5km
  • Target: 17:15-17:30 (3:27-3:30/km)
  • Km 1: 3:32-3:35 — CONTROLLED. Don't blow the first km.
  • Km 2-3: 3:28-3:30 — settle, rhythm, breathe
  • Km 4: 3:28 — the crucible. Hold form.
  • Km 5: 3:25 or faster — EVERYTHING

COOL-DOWN  (10min)
  • Easy jog + walk

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~9km  |  TSS ~65
THIS IS THE GOAL. 12 weeks of work for this moment.
Trust the block. Execute the plan.`, distancePlanned: 5000, totalTimePlanned: 0.5, tssPlanned: 65, structure: STRUCTURES.tt5k },
      { date: '2026-07-05', title: 'Recovery ride', workoutType: 2, description: 'Easy recovery ride 60min Z1\nSpin out the TT legs.\n5K block complete. Celebrate. Then pivot to 10K.', totalTimePlanned: 1.0, structure: STRUCTURES.recoveryRide60 },
    ],
  },
  // ═══════════════ BLOCK 4: 10K Campaign (Jul 7 - Jul 26) ═══════════════
  {
    id: 'block-4-10k',
    number: 4,
    name: '10K Campaign',
    phase: 'speed',
    startDate: '2026-07-06',
    endDate: '2026-07-25',
    stimulus: '10K-specific preparation. Longer tempo reps at 10K pace. Maintain 5K speed. Taper into 10K TT.',
    goals: [
      '2km tempo reps at 10K pace (3:36/km) feeling controlled',
      'Long run with 10K pace finish',
      'Maintain 5K sharpness with 1km reps',
      '10K TIME TRIAL: sub-36:00 on Jul 26',
    ],
    successMetrics: [
      '4x2km @ 3:33-3:36/km with even pacing',
      'Long run 14km with 10K pace finish executed cleanly',
      '1km reps still at 3:30-3:33 smooth',
      '10K TT sub-36:00',
    ],
    weekPattern: 'Tue KEY1 (track/tempo) | Thu KEY2 (10K tempo) | Sat long run | Mon/Fri bike | Wed gym/yoga',
    restrictions: [
      'Week 15 is strict taper — reduced volume, sharp reps only',
      'No new training stimuli in taper week',
      'Keep 5K speed with 1km reps, don\'t lose it',
    ],
    sessions: [
      // ============ WEEK 13 (Jul 7-13) — Recovery + rebuild ============
      { date: '2026-07-06', title: 'Rest', workoutType: 100, description: 'REST DAY\n\nPost-5K TT recovery. Full rest.\nHydrate. Reflect on the race. Plan the 10K block.', totalTimePlanned: 0 },
      { date: '2026-07-07', title: 'Easy run + strides', workoutType: 3, description: 'Easy run 7km @ 5:10/km\n+ 6x100m strides (build to 90%, walk back)\nFirst run after the 5K TT. Easy and smooth.\nLegs may feel heavy — that\'s normal.', distancePlanned: 7000, totalTimePlanned: 0.63, structure: STRUCTURES.easyRunStrides7km },
      { date: '2026-07-08', title: 'Easy bike Z2', workoutType: 2, description: 'Easy bike 60min Z2\nSteady 195-225W. Aerobic maintenance.\nTransition day into 10K training.', totalTimePlanned: 1.0, structure: STRUCTURES.easyBike60 },
      { date: '2026-07-09', title: 'KEY 2 — 3x2km @ 10K pace', workoutType: 3, description: `KEY 2 — TEMPO 3x2km @ 10K PACE
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (12min)
  • 2km easy jog + drills + strides

MAIN SET  —  3x 2km
  • Target: 3:36/km (10K goal pace, ~90-94% threshold)
  • Recovery: 400m easy jog between reps
  • HR: Z3-Z4, should settle into rhythm by rep 2
  • RPE 7/10 — strong but sustainable for 10km

COOL-DOWN  (10min)
  • Easy jog

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~10km  |  TSS ~65
First 10K-specific session. Find the new race pace.`, distancePlanned: 10000, totalTimePlanned: 0.83, tssPlanned: 65, structure: STRUCTURES.tempo3x2km },
      { date: '2026-07-10', title: 'Easy bike / yoga', workoutType: 2, description: 'Easy bike 60min Z1-Z2\nOR yoga 40min\nPre-long-run day. Easy does it.', totalTimePlanned: 1.0, structure: STRUCTURES.easyBike60 },
      { date: '2026-07-11', title: 'Long run 14km — 10K pace finish', workoutType: 3, description: `LONG RUN — 14km WITH 10K PACE FINISH
━━━━━━━━━━━━━━━━━━━━━━━━
MAIN  (14km)
  • Km 1-10: Easy Z1-Z2, 4:50-5:10/km
  • Km 11-14: Push to 3:33-3:36/km (10K race pace)
  • Last 4km = 10K race rehearsal on tired legs

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 14km  |  TSS ~85
The 10K finish test. If this feels manageable, sub-36 is on.`, distancePlanned: 14000, totalTimePlanned: 1.17, tssPlanned: 85, structure: STRUCTURES.longRun14km10kFinish },
      { date: '2026-07-12', title: 'Long ride Z2 2hrs', workoutType: 2, description: 'Long ride 2hrs Z2\nSteady aerobic base. Z2 195-225W.\nLast big ride of the season.', totalTimePlanned: 2.0, structure: STRUCTURES.longRide120Bridge },

      // ============ WEEK 14 (Jul 14-20) — 10K specific ============
      { date: '2026-07-13', title: 'Easy bike Z2', workoutType: 2, description: 'Easy bike 60min Z2\nSteady aerobic maintenance.\nProtect legs for track tomorrow.', totalTimePlanned: 1.0, structure: STRUCTURES.easyBike60 },
      { date: '2026-07-14', title: 'KEY 1 — 5x1km @ 3:30-3:33', workoutType: 3, description: `KEY 1 — TRACK 5x1km (maintain 5K sharpness)
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (15min)
  • 2km easy jog + drills + 3x 80m accelerations

MAIN SET  —  5x 1km
  • Target: 3:30-3:33/km (5K pace — maintain the speed)
  • Recovery: 400m easy jog
  • HR: Z4-Z5a on reps
  • Should feel comfortable after Block 3 speed work

COOL-DOWN  (10min)
  • Easy jog

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~10km  |  TSS ~70
Maintain 5K speed while building 10K endurance.`, distancePlanned: 10000, totalTimePlanned: 0.83, tssPlanned: 70, structure: STRUCTURES.track5x1km },
      { date: '2026-07-15', title: 'Gym (light)', workoutType: 9, description: 'Strength 30min (light)\n\n- Squats 2x8 (light)\n- Hip thrusts 2x10\n- Core: planks, dead bugs\n\nLast gym session before taper. Light touch only.', totalTimePlanned: 0.5 },
      { date: '2026-07-16', title: 'KEY 2 — 4x2km @ 10K race pace', workoutType: 3, description: `KEY 2 — TEMPO 4x2km @ 10K RACE PACE
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (12min)
  • 2km easy jog + drills + strides

MAIN SET  —  4x 2km
  • Target: 3:33-3:36/km (10K race pace)
  • Recovery: 400m easy jog between reps
  • HR: Z3-Z4 — the 10K engine
  • RPE 7.5/10 — strong but you could do a 5th rep

COOL-DOWN  (10min)
  • Easy jog

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~12km  |  TSS ~80
The BIG 10K session. 4 reps = 8km at race pace.
If pacing is metronomic, race is ready.`, distancePlanned: 12000, totalTimePlanned: 0.92, tssPlanned: 80, structure: STRUCTURES.tempo4x2km },
      { date: '2026-07-17', title: 'Easy bike', workoutType: 2, description: 'Easy bike 45min Z1\nRecovery spin. Pre-long-run flush.', totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },
      { date: '2026-07-18', title: 'Long run 16km — progressive', workoutType: 3, description: `LONG RUN — PROGRESSIVE (16km)
━━━━━━━━━━━━━━━━━━━━━━━━
SEGMENT 1  —  km 1-11 (HOLD BACK)
  • Pace: 5:00-5:05/km (Z1/low Z2)
  • HR: Z2 146-156
  • RPE 4/10

SEGMENT 2  —  km 12-14 (SHIFT)
  • Pace: 4:45/km (Z2)
  • HR: Z3 157-165
  • RPE 6/10

SEGMENT 3  —  km 15-16 (SURGE)
  • Pace: 4:30-4:35/km
  • HR: Z3/Z4 165-174
  • RPE 7.5/10

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: 16km ~80min  |  TSS ~95
Last long run before the 10K TT.`, distancePlanned: 16000, totalTimePlanned: 1.33, tssPlanned: 95, structure: STRUCTURES.longRun16kmProgressive },
      { date: '2026-07-19', title: 'Long ride Z2 2hrs', workoutType: 2, description: 'Long ride 2hrs Z2\nSteady aerobic base. Last long ride before taper.\nCadence 85-90rpm.', totalTimePlanned: 2.0, structure: STRUCTURES.longRide120Bridge },

      // ============ WEEK 15 (Jul 21-26) — Taper + 10K TT ============
      { date: '2026-07-20', title: 'Easy bike Z1', workoutType: 2, description: 'Easy bike 45min Z1\nTaper week. Flat, easy, short.\nLess is more. Trust the training.', totalTimePlanned: 0.75, structure: STRUCTURES.easyBike45 },
      { date: '2026-07-21', title: 'Sharpener 3x1km', workoutType: 3, description: `SHARPENER — 3x1km
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (15min)
  • 2km easy + drills + openers (3x 100m at race pace)

MAIN SET  —  3x 1km
  • Target: 3:25-3:28/km (5K pace — keep the speed)
  • Recovery: 400m easy jog
  • Only 3 reps. Sharp, not fatiguing.

COOL-DOWN  (10min)
  • Easy jog

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~8km  |  TSS ~50
Last hard session. Leave feeling fast and ready.`, distancePlanned: 8000, totalTimePlanned: 0.67, tssPlanned: 50, structure: STRUCTURES.sharpener3x1km },
      { date: '2026-07-22', title: 'Yoga only', workoutType: 100, description: 'Yoga 30min — gentle stretch\nNo gym. Taper.\nHip openers, hamstrings, calves.\nRelax. The work is done.', totalTimePlanned: 0.5 },
      { date: '2026-07-23', title: 'Easy run + strides', workoutType: 3, description: 'Easy run 5km @ 5:15/km\n+ 4x100m strides (relaxed speed)\nShort opener. Keep it smooth.\nVisualize the 10K — first 2km controlled, settle, push from 7km.', distancePlanned: 5000, totalTimePlanned: 0.47, structure: STRUCTURES.easyRunStrides6km },
      { date: '2026-07-24', title: 'Rest', workoutType: 100, description: 'REST DAY\n\nFull rest before the 10K TT.\nHydrate. Eat well. Sleep 8hrs.\n\nRace plan:\n- Km 1-2: 3:38-3:40 (DON\'T go out fast)\n- Km 3-5: 3:35-3:36 (settle into rhythm)\n- Km 6-8: 3:33-3:35 (maintain — this is where it gets hard)\n- Km 9: 3:30 (push — you can see the finish)\n- Km 10: 3:25 or faster (EVERYTHING)', totalTimePlanned: 0 },
      { date: '2026-07-25', title: '10K TIME TRIAL — sub-36:00', workoutType: 3, description: `10K TIME TRIAL — TARGET SUB-36:00
━━━━━━━━━━━━━━━━━━━━━━━━
WARM-UP  (15min)
  • 2km easy jog + drills
  • 3x 100m at 10K race pace (openers)

RACE  —  10km
  • Target: 35:30-36:00 (3:33-3:36/km)
  • Km 1-2: 3:38-3:40 — CONTROLLED. Resist the adrenaline.
  • Km 3-5: 3:35-3:36 — settle, rhythm, breathe
  • Km 6-8: 3:33-3:35 — the engine room. Hold form.
  • Km 9: 3:30 — dig deep, push the pace
  • Km 10: 3:25 or faster — EVERYTHING LEFT

COOL-DOWN  (10min)
  • Easy jog + walk

━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL: ~14km  |  TSS ~80
THE SEASON FINALE. Sub-36. Make it count.
Even splits or negative split. NEVER positive.`, distancePlanned: 10000, totalTimePlanned: 0.6, tssPlanned: 80, structure: STRUCTURES.tt10k },
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
