import type { SlimRun, Block, Meta, WeeklyVolume, FitnessSummary, Race } from './types';

import runsData from '../data/runs.json';
import racesData from '../data/races.json';
import weeklyData from '../data/weekly-volumes.json';
import fitnessData from '../data/fitness-summary.json';
import metaData from '../data/meta.json';

import fs from 'node:fs';
import path from 'node:path';

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
  const blocksDir = path.join(process.cwd(), 'src', 'data', 'blocks');
  const files = fs.readdirSync(blocksDir).filter((f: string) => f.endsWith('.json'));
  const blocks: Block[] = files.map((f: string) => {
    const raw = fs.readFileSync(path.join(blocksDir, f), 'utf-8');
    return JSON.parse(raw);
  });
  return blocks.sort((a, b) => b.number - a.number);
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
