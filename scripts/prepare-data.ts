import fs from 'fs';
import path from 'path';

const RAW_DIR = path.join(process.cwd(), 'data', 'raw');
const OUT_DIR = path.join(process.cwd(), 'src', 'data');

interface RawRun {
  id: number;
  name: string;
  distance: number;
  moving_time: number;
  total_elevation_gain: number;
  type: string;
  sport_type: string;
  start_date_local: string;
  average_heartrate: number;
  max_heartrate: number;
  average_speed: number;
  suffer_score: number;
}

interface SlimRun {
  id: number;
  name: string;
  dist: number;
  time: number;
  date: string;
  pace: number;
  hr: number;
  maxHr: number;
  elev: number;
  type: string;
  sport: string;
}

function sportCategory(sportType: string): string {
  const map: Record<string, string> = {
    Run: 'run', VirtualRun: 'run', TrailRun: 'run',
    Ride: 'bike', VirtualRide: 'bike', EBikeRide: 'bike', MountainBikeRide: 'bike', GravelRide: 'bike',
    Swim: 'swim',
    Yoga: 'yoga', Pilates: 'yoga',
    WeightTraining: 'strength', Crossfit: 'strength', Workout: 'strength',
    Hike: 'hike', Walk: 'hike',
    Rowing: 'other', Elliptical: 'other', StairStepper: 'other',
  };
  return map[sportType] || 'other';
}

function slimRuns(raw: RawRun[]): SlimRun[] {
  return raw
    .filter((r) => r.distance > 0 || r.moving_time > 60) // keep anything with distance or > 1min
    .map((r) => {
      const distKm = r.distance / 1000;
      const pace = distKm > 0 ? r.moving_time / distKm : 0;
      const sport = r.sport_type || r.type;
      return {
        id: r.id,
        name: r.name,
        dist: Math.round(distKm * 10) / 10,
        time: r.moving_time,
        date: (r.start_date_local || '').slice(0, 10),
        pace: Math.round(pace * 10) / 10,
        hr: r.average_heartrate || 0,
        maxHr: r.max_heartrate || 0,
        elev: r.total_elevation_gain || 0,
        type: sport,
        sport: sportCategory(sport),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

function detectRaces(runs: SlimRun[]) {
  return runs
    .filter((r) => {
      // ONLY running activities can be races
      if (r.sport !== 'run') return false;

      const name = r.name.toLowerCase();
      // Exclude Zwift/treadmill/virtual
      if (name.includes('zwift') || name.includes('technogym') || name.includes('virtual')) return false;

      // Only detect as race if name contains race keywords — NOT by pace/distance alone
      // "Morning Run" at 10km pace is a training run, not a race
      const isGenericName = name.includes('morning run') || name.includes('evening run') || name.includes('afternoon run') || name.includes('lunch run');
      if (isGenericName) return false;

      const hasRaceKeyword =
        ['race', 'marathon', '10k', '5k', 'parkrun', 'half', 'strovolos', 'ayia napa', 'paphos', 'larnaca', 'nicosia', 'limassol', 'berlin', 'vienna', 'paris', 'tel aviv', 'test'].some((kw) =>
          name.includes(kw)
        );
      const hasEmoji = /[\u{0080}-\u{FFFF}]/u.test(r.name);

      if ((hasRaceKeyword || hasEmoji) && r.pace < 360) return true;
      return false;
    })
    .map((r) => {
      let category: string = 'other';
      if (r.dist >= 41) category = 'marathon';
      else if (r.dist >= 20) category = 'half';
      else if (r.dist >= 9) category = '10k';
      else if (r.dist >= 4 && r.dist <= 6) category = '5k';
      return { ...r, category };
    });
}

function computeWeeklyVolumes(runs: SlimRun[]) {
  const weeks: Record<string, { km: number; runs: number; paces: number[]; hrs: number[]; longRun: number }> = {};
  for (const r of runs) {
    if (!r.date || r.sport !== 'run') continue;
    const d = new Date(r.date);
    const iso = getISOWeek(d);
    if (!weeks[iso]) weeks[iso] = { km: 0, runs: 0, paces: [], hrs: [], longRun: 0 };
    weeks[iso].km += r.dist;
    weeks[iso].runs++;
    weeks[iso].paces.push(r.pace);
    if (r.hr > 0) weeks[iso].hrs.push(r.hr);
    if (r.dist > weeks[iso].longRun) weeks[iso].longRun = r.dist;
  }
  return Object.entries(weeks)
    .map(([week, v]) => ({
      week,
      km: Math.round(v.km * 10) / 10,
      runs: v.runs,
      avgPace: Math.round((v.paces.reduce((a, b) => a + b, 0) / v.paces.length) * 10) / 10,
      avgHr: v.hrs.length ? Math.round(v.hrs.reduce((a, b) => a + b, 0) / v.hrs.length) : 0,
      longRun: v.longRun,
    }))
    .sort((a, b) => a.week.localeCompare(b.week))
    .slice(-52);
}

function getISOWeek(d: Date): string {
  const dt = new Date(d.getTime());
  dt.setHours(0, 0, 0, 0);
  dt.setDate(dt.getDate() + 3 - ((dt.getDay() + 6) % 7));
  const yearStart = new Date(dt.getFullYear(), 0, 4);
  const weekNum = Math.ceil(((dt.getTime() - yearStart.getTime()) / 86400000 + yearStart.getDay() + 1) / 7);
  return `${dt.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
}

function computeFitness(runs: SlimRun[]) {
  const now = new Date();
  const last7: SlimRun[] = [];
  const last28: SlimRun[] = [];
  for (const r of runs.filter((r) => r.sport === 'run')) {
    const d = new Date(r.date);
    const daysAgo = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (daysAgo <= 7) last7.push(r);
    if (daysAgo <= 28) last28.push(r);
  }
  const hrs28 = last28.filter((r) => r.hr > 0);
  return {
    volume7d: Math.round(last7.reduce((a, r) => a + r.dist, 0) * 10) / 10,
    volume28d: Math.round(last28.reduce((a, r) => a + r.dist, 0) * 10) / 10,
    runs7d: last7.length,
    runs28d: last28.length,
    avgPace28d: last28.length ? Math.round((last28.reduce((a, r) => a + r.pace, 0) / last28.length) * 10) / 10 : 0,
    avgHr28d: hrs28.length ? Math.round(hrs28.reduce((a, r) => a + r.hr, 0) / hrs28.length) : 0,
    lastRun: runs[0]?.date || '',
    lastUpdated: now.toISOString().slice(0, 10),
  };
}

/**
 * Compute training load, fatigue, form — simplified TRIMP-like model.
 * ATL (Acute Training Load) = 7-day rolling weighted load
 * CTL (Chronic Training Load) = 42-day rolling weighted load
 * TSB (Training Stress Balance) = CTL - ATL (positive = fresh, negative = fatigued)
 */
function computeTrainingLoad(runs: SlimRun[]) {
  const runOnly = runs.filter((r) => r.sport === 'run').sort((a, b) => a.date.localeCompare(b.date));

  // Simple training stress per session: duration(min) * intensity factor
  // Intensity: HR-based if available, pace-based fallback
  function sessionLoad(r: SlimRun): number {
    const durationMin = r.time / 60;
    let intensity = 1.0;
    if (r.hr > 0) {
      // HR-based: higher HR = higher intensity
      intensity = Math.max(0.5, Math.min(2.5, (r.hr - 100) / 40));
    } else if (r.pace > 0 && r.pace < 600) {
      // Pace-based: faster = higher intensity
      intensity = Math.max(0.5, Math.min(2.5, (360 - r.pace) / 80 + 1));
    }
    return Math.round(durationMin * intensity);
  }

  // Compute daily loads
  const dailyLoads: Record<string, number> = {};
  for (const r of runOnly) {
    dailyLoads[r.date] = (dailyLoads[r.date] || 0) + sessionLoad(r);
  }

  // Also count all activities (bike, strength, yoga contribute to total load)
  const allActivities = runs.sort((a, b) => a.date.localeCompare(b.date));
  const dailyTotalLoads: Record<string, number> = {};
  for (const r of allActivities) {
    const durationMin = r.time / 60;
    const sportMultiplier = r.sport === 'run' ? 1.0 : r.sport === 'bike' ? 0.7 : r.sport === 'strength' ? 0.8 : 0.4;
    let intensity = 1.0;
    if (r.hr > 0) intensity = Math.max(0.5, Math.min(2.0, (r.hr - 100) / 40));
    const load = Math.round(durationMin * intensity * sportMultiplier);
    dailyTotalLoads[r.date] = (dailyTotalLoads[r.date] || 0) + load;
  }

  // Compute rolling averages
  const now = new Date();
  const days: { date: string; runLoad: number; totalLoad: number; atl: number; ctl: number; tsb: number }[] = [];

  for (let i = 56; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);

    // ATL: 7-day rolling average
    let atl = 0;
    for (let j = 0; j < 7; j++) {
      const dd = new Date(d);
      dd.setDate(dd.getDate() - j);
      const ds = dd.toISOString().slice(0, 10);
      atl += dailyTotalLoads[ds] || 0;
    }
    atl = Math.round(atl / 7);

    // CTL: 42-day rolling average
    let ctl = 0;
    for (let j = 0; j < 42; j++) {
      const dd = new Date(d);
      dd.setDate(dd.getDate() - j);
      const ds = dd.toISOString().slice(0, 10);
      ctl += dailyTotalLoads[ds] || 0;
    }
    ctl = Math.round(ctl / 42);

    const tsb = ctl - atl;
    days.push({ date: dateStr, runLoad: dailyLoads[dateStr] || 0, totalLoad: dailyTotalLoads[dateStr] || 0, atl, ctl, tsb });
  }

  const latest = days[days.length - 1];
  return {
    days,
    current: {
      atl: latest.atl,
      ctl: latest.ctl,
      tsb: latest.tsb,
      status: latest.tsb > 10 ? 'fresh' : latest.tsb > -5 ? 'balanced' : latest.tsb > -20 ? 'tired' : 'overreaching',
      statusColor: latest.tsb > 10 ? '#26de81' : latest.tsb > -5 ? '#ffa502' : latest.tsb > -20 ? '#fd9644' : '#ff4757',
    },
  };
}

/**
 * Generate a coach context summary — everything Claude needs to build the next block.
 */
function generateCoachContext(runs: SlimRun[], races: any[], fitness: any, trainingLoad: any) {
  const runOnly = runs.filter((r) => r.sport === 'run');
  const bikeOnly = runs.filter((r) => r.sport === 'bike');
  const last14 = runOnly.filter((r) => {
    const d = new Date(r.date);
    const daysAgo = (Date.now() - d.getTime()) / 86400000;
    return daysAgo <= 14;
  });
  const last14Bike = bikeOnly.filter((r) => {
    const d = new Date(r.date);
    return (Date.now() - d.getTime()) / 86400000 <= 14;
  });

  // Load feedback from a separate file if exists
  const recentRaces = races.slice(0, 5);

  return {
    generatedAt: new Date().toISOString().slice(0, 10),
    fitness: {
      ...fitness,
      trainingStatus: trainingLoad.current.status,
      atl: trainingLoad.current.atl,
      ctl: trainingLoad.current.ctl,
      tsb: trainingLoad.current.tsb,
    },
    last14Days: {
      runCount: last14.length,
      runKm: Math.round(last14.reduce((s, r) => s + r.dist, 0) * 10) / 10,
      avgRunPace: last14.length ? Math.round((last14.reduce((s, r) => s + r.pace, 0) / last14.length) * 10) / 10 : 0,
      avgRunHr: last14.filter((r) => r.hr > 0).length
        ? Math.round(last14.filter((r) => r.hr > 0).reduce((s, r) => s + r.hr, 0) / last14.filter((r) => r.hr > 0).length)
        : 0,
      bikeCount: last14Bike.length,
      bikeKm: Math.round(last14Bike.reduce((s, r) => s + r.dist, 0) * 10) / 10,
      longestRun: last14.length ? Math.max(...last14.map((r) => r.dist)) : 0,
      sessions: last14.map((r) => ({
        date: r.date,
        dist: r.dist,
        pace: r.pace,
        hr: r.hr,
        name: r.name,
      })),
    },
    recentRaces: recentRaces.map((r: any) => ({
      date: r.date,
      name: r.name,
      dist: r.dist,
      time: r.time,
      pace: r.pace,
      category: r.category,
    })),
  };
}

// Run
const rawRuns: RawRun[] = JSON.parse(fs.readFileSync(path.join(RAW_DIR, 'all_runs.json'), 'utf-8'));
const runs = slimRuns(rawRuns);
const races = detectRaces(runs);
const weeklyVolumes = computeWeeklyVolumes(runs);
const fitness = computeFitness(runs);

const trainingLoad = computeTrainingLoad(runs);
const coachContext = generateCoachContext(runs, races, fitness, trainingLoad);

fs.writeFileSync(path.join(OUT_DIR, 'runs.json'), JSON.stringify(runs));
fs.writeFileSync(path.join(OUT_DIR, 'races.json'), JSON.stringify(races));
fs.writeFileSync(path.join(OUT_DIR, 'weekly-volumes.json'), JSON.stringify(weeklyVolumes));
fs.writeFileSync(path.join(OUT_DIR, 'fitness-summary.json'), JSON.stringify(fitness));
fs.writeFileSync(path.join(OUT_DIR, 'training-load.json'), JSON.stringify(trainingLoad));
fs.writeFileSync(path.join(OUT_DIR, 'coach-context.json'), JSON.stringify(coachContext, null, 2));

// Copy detailed runs and race details as-is
fs.copyFileSync(path.join(RAW_DIR, 'detailed_long_runs.json'), path.join(OUT_DIR, 'detailed-runs.json'));
fs.copyFileSync(path.join(RAW_DIR, 'race_details.json'), path.join(OUT_DIR, 'race-details.json'));

const rawSize = fs.statSync(path.join(RAW_DIR, 'all_runs.json')).size;
const slimSize = fs.statSync(path.join(OUT_DIR, 'runs.json')).size;
console.log(`Runs: ${rawRuns.length} total, ${runs.length} running activities`);
console.log(`Races detected: ${races.length}`);
console.log(`Size: ${(rawSize / 1024).toFixed(0)}KB -> ${(slimSize / 1024).toFixed(0)}KB (${Math.round((1 - slimSize / rawSize) * 100)}% reduction)`);
console.log(`Weekly volumes: ${weeklyVolumes.length} weeks`);
console.log(`Fitness: 7d=${fitness.volume7d}km, 28d=${fitness.volume28d}km`);
console.log(`Training load: ATL=${trainingLoad.current.atl}, CTL=${trainingLoad.current.ctl}, TSB=${trainingLoad.current.tsb} (${trainingLoad.current.status})`);
console.log(`Coach context generated: ${JSON.stringify(coachContext.last14Days).length} bytes`);
