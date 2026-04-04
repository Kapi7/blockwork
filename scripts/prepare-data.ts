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
}

function slimRuns(raw: RawRun[]): SlimRun[] {
  return raw
    .filter((r) => r.type === 'Run' || r.sport_type === 'Run')
    .map((r) => {
      const distKm = r.distance / 1000;
      const pace = distKm > 0 ? r.moving_time / distKm : 0;
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
        type: r.sport_type || r.type,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

function detectRaces(runs: SlimRun[]) {
  return runs
    .filter((r) => {
      const name = r.name.toLowerCase();
      const isRace =
        ['race', 'marathon', '10k', '5k', 'parkrun', 'half', 'strovolos', 'ayia napa', 'paphos', 'larnaca', 'nicosia', 'limassol', 'berlin', 'vienna', 'paris', 'tel aviv'].some((kw) =>
          name.includes(kw)
        ) || /[\u{0080}-\u{FFFF}]/u.test(r.name);
      if (isRace && r.pace < 360) return true;
      // Fast pace at standard distances
      if (r.dist >= 4.5 && r.dist <= 5.5 && r.pace < 240) return true;
      if (r.dist >= 9.5 && r.dist <= 10.5 && r.pace < 250) return true;
      if (r.dist >= 20 && r.dist <= 22 && r.pace < 270) return true;
      if (r.dist >= 41 && r.dist <= 43 && r.pace < 300) return true;
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
    if (!r.date) continue;
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
  for (const r of runs) {
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

// Run
const rawRuns: RawRun[] = JSON.parse(fs.readFileSync(path.join(RAW_DIR, 'all_runs.json'), 'utf-8'));
const runs = slimRuns(rawRuns);
const races = detectRaces(runs);
const weeklyVolumes = computeWeeklyVolumes(runs);
const fitness = computeFitness(runs);

fs.writeFileSync(path.join(OUT_DIR, 'runs.json'), JSON.stringify(runs));
fs.writeFileSync(path.join(OUT_DIR, 'races.json'), JSON.stringify(races));
fs.writeFileSync(path.join(OUT_DIR, 'weekly-volumes.json'), JSON.stringify(weeklyVolumes));
fs.writeFileSync(path.join(OUT_DIR, 'fitness-summary.json'), JSON.stringify(fitness));

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
