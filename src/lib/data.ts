import type { SlimRun, Block, Meta, WeeklyVolume, FitnessSummary, Race, MatchedDay, Session } from './types';

import runsData from '../data/runs.json';
import racesData from '../data/races.json';
import weeklyData from '../data/weekly-volumes.json';
import fitnessData from '../data/fitness-summary.json';
import metaData from '../data/meta.json';
import detailedData from '../data/detailed-runs.json';
import trainingLoadData from '../data/training-load.json';
import coachContextData from '../data/coach-context.json';

// Import blocks statically (no fs in Cloudflare Workers)
import block0 from '../data/blocks/block-0-recovery.json';
import block1 from '../data/blocks/block-1-base-strength.json';
import block2 from '../data/blocks/block-2-speed.json';

const ALL_BLOCKS = [block0, block1, block2];

export function getRuns(): SlimRun[] {
  return runsData as SlimRun[];
}

export function getRecentRuns(n: number = 20): SlimRun[] {
  return getRuns().slice(0, n);
}

export function getRaces(): Race[] {
  return racesData as Race[];
}

export function getWeeklyVolumes(): WeeklyVolume[] {
  return weeklyData as WeeklyVolume[];
}

export function getFitness(): FitnessSummary {
  return fitnessData as FitnessSummary;
}

export function getMeta(): Meta {
  return metaData as Meta;
}

export function getBlocks(): Block[] {
  return (ALL_BLOCKS as Block[]).sort((a, b) => b.number - a.number);
}

export function getBlock(id: string): Block | null {
  const blocks = getBlocks();
  return blocks.find((b) => b.id === id) ?? null;
}

export function getCurrentBlock(): Block | null {
  const meta = getMeta();
  return getBlock(meta.currentBlockId);
}

export function getRunsByDate(): Record<string, SlimRun> {
  const runs = getRuns();
  const byDate: Record<string, SlimRun> = {};
  for (const r of runs) {
    if (!byDate[r.date] || r.dist > byDate[r.date].dist) {
      byDate[r.date] = r;
    }
  }
  return byDate;
}

/** Get ALL activities for a given date (multiple runs/rides per day) */
export function getActivitiesByDate(): Record<string, SlimRun[]> {
  const runs = getRuns();
  const byDate: Record<string, SlimRun[]> = {};
  for (const r of runs) {
    if (!byDate[r.date]) byDate[r.date] = [];
    byDate[r.date].push(r);
  }
  return byDate;
}

/** Map session type to expected sport categories */
const SESSION_SPORT_MAP: Record<string, string[]> = {
  key: ['run'], easy: ['run'], steady: ['run'], recovery: ['run'],
  threshold: ['run'], race: ['run'],
  bike: ['bike'],
  yoga: ['yoga'], strength: ['strength'],
  rest: [],
};

/** Match a planned session to the best activity from a list */
function matchActivity(session: Session, activities: SlimRun[]): SlimRun | null {
  if (!activities || activities.length === 0) return null;

  const expectedSports = SESSION_SPORT_MAP[session.type] || ['run'];
  if (expectedSports.length === 0) return null; // rest day

  // Filter by expected sport category
  const candidates = activities.filter((a) => expectedSports.includes(a.sport || 'other'));

  // Fallback: if no match by sport, try all activities
  const pool = candidates.length > 0 ? candidates : activities;

  if (pool.length === 0) return null;
  if (pool.length === 1) return pool[0];

  // If planned has distance, pick closest match
  if (session.planned.distance > 0) {
    pool.sort((a, b) => {
      const diffA = Math.abs(a.dist - session.planned.distance);
      const diffB = Math.abs(b.dist - session.planned.distance);
      return diffA - diffB;
    });
    return pool[0];
  }

  // No planned distance — take longest
  return pool.reduce((best, r) => (r.dist > best.dist ? r : best), pool[0]);
}

/** Build a calendar of matched days across all blocks */
export function getCalendarDays(weeksBack: number = 8): MatchedDay[] {
  const blocks = getBlocks();
  const activitiesByDate = getActivitiesByDate();

  // Build session map from all blocks
  const sessionMap: Record<string, { session: Session; blockId: string; blockName: string; phase: string }> = {};
  for (const block of blocks) {
    for (const s of block.sessions) {
      sessionMap[s.date] = { session: s, blockId: block.id, blockName: block.name, phase: block.phase };
    }
  }

  // Determine date range
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - (weeksBack * 7) - start.getDay() + 1); // Start on Monday
  const end = new Date(today);
  end.setDate(end.getDate() + (4 * 7)); // 4 weeks ahead

  const days: MatchedDay[] = [];
  const current = new Date(start);

  while (current <= end) {
    const dateStr = current.toISOString().slice(0, 10);
    const mapped = sessionMap[dateStr];
    const dayActivities = activitiesByDate[dateStr] || [];

    const day: MatchedDay = {
      date: dateStr,
      session: mapped ? { ...mapped.session } : null,
      activities: dayActivities,
      blockId: mapped?.blockId || null,
      blockName: mapped?.blockName || null,
      phase: mapped?.phase || null,
    };

    // Smart match: attach best activity to session
    if (day.session && dayActivities.length > 0) {
      day.session.actual = matchActivity(day.session, dayActivities);
    }

    days.push(day);
    current.setDate(current.getDate() + 1);
  }

  return days;
}

/** Group calendar days into weeks (Mon-Sun) */
export function getCalendarWeeks(weeksBack: number = 8): MatchedDay[][] {
  const days = getCalendarDays(weeksBack);
  const weeks: MatchedDay[][] = [];

  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  return weeks;
}

export function getTrainingLoad(): any {
  return trainingLoadData;
}

export function getCoachContext(): any {
  return coachContextData;
}

export function getDetailedRuns(): any[] {
  return detailedData as any[];
}

export function getDetailedByDate(): Record<string, any> {
  const byDate: Record<string, any> = {};
  for (const r of getDetailedRuns()) {
    byDate[r.date] = r;
  }
  return byDate;
}

export function getPBs(): Record<string, Race> {
  const races = getRaces();
  const pbs: Record<string, Race> = {};
  for (const r of races) {
    const cat = r.category;
    if (!pbs[cat] || r.time < pbs[cat].time) {
      pbs[cat] = r;
    }
  }
  return pbs;
}
