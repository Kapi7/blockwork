#!/usr/bin/env node
// Quick smoke test: feed the May 7 outside ride through summarizeLapData and
// see if the new logic correctly identifies the 30min IF 0.91 block.

import fs from 'fs';

// Inline the helpers from claude-coach.ts (TS not available at runtime)
function fmtPace(sec) {
  if (!isFinite(sec) || sec <= 0) return '-';
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
}

function speedToPace(ms) { if (!ms || ms <= 0) return '-'; return fmtPace(1000 / ms); }

function normalizeLap(lap) {
  const distKm = (lap.distance || 0) / 1000;
  const secs = (lap.elapsedTime || 0) / 1000;
  return { distKm, secs, paceSecPerKm: distKm > 0.005 ? secs / distKm : 0,
           hrAvg: lap.averageHeartRate ?? null, hrMax: lap.maximumHeartRate ?? null,
           ifVal: lap.intensityFactorActual ?? null, power: lap.averagePower ?? null,
           cadence: lap.averageCadence ?? null, name: lap.name || '' };
}

function detectSessionShape(laps) {
  const work = laps.filter(l => l.secs > 30);
  if (work.length === 0) return { shape: 'unknown', highIfLap: null, workReps: [] };
  if (work.length === 1) return { shape: 'single-block', highIfLap: { idx: 0, lap: work[0] }, workReps: [] };
  const ifs = work.map((l, i) => ({ idx: i, ifv: l.ifVal || 0, lap: l }));
  ifs.sort((a, b) => b.ifv - a.ifv);
  const highIf = ifs[0];
  const highIfLap = { idx: highIf.idx, lap: highIf.lap };
  if (work.length >= 3 && highIf.lap.secs >= 600 && (highIf.lap.ifVal || 0) >= 0.8) {
    const beforeAvgIf = work.slice(0, highIf.idx).reduce((s, l) => s + (l.ifVal || 0), 0) / Math.max(1, highIf.idx);
    const afterAvgIf = work.slice(highIf.idx + 1).reduce((s, l) => s + (l.ifVal || 0), 0) / Math.max(1, work.length - highIf.idx - 1);
    if (beforeAvgIf < 0.75 && afterAvgIf < 0.75) return { shape: 'race-simulation', highIfLap, workReps: [highIf.lap] };
  }
  const hard = work.filter(l => (l.ifVal || 0) >= 0.85);
  const easy = work.filter(l => (l.ifVal || 0) < 0.7);
  if (hard.length >= 3 && easy.length >= 2) return { shape: 'intervals', highIfLap, workReps: hard };
  const sustained = work.filter(l => (l.ifVal || 0) >= 0.75);
  if (sustained.length >= work.length * 0.7) return { shape: 'continuous-hard', highIfLap, workReps: sustained };
  return { shape: 'mixed-terrain', highIfLap, workReps: hard };
}

const all = JSON.parse(fs.readFileSync('/Users/kapi7/.playwright-mcp/may_5_8_laps.json', 'utf8'));

for (const t of all.ids) {
  const det = all.details[t.id];
  if (!det) continue;
  const laps = (det.lapsStats || []).map(normalizeLap);
  const shape = detectSessionShape(laps);
  console.log(`\n=== ${t.day} | ${t.title} ===`);
  console.log(`Shape: ${shape.shape}`);
  if (shape.highIfLap) {
    const l = shape.highIfLap.lap;
    console.log(`Hardest lap: ${Math.floor(l.secs/60)}:${String(Math.round(l.secs%60)).padStart(2,'0')} @ IF ${(l.ifVal||0).toFixed(2)}, HR ${l.hrAvg}/${l.hrMax}`);
  }
  if (shape.shape === 'intervals') {
    console.log(`Work reps: ${shape.workReps.length}`);
  }
}
