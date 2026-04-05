/**
 * GET /api/george/debug-compute-zones?token=...
 *
 * Since TP's zones API is locked down, we empirically derive Itay's real
 * HR zones and FTP from his last 180 days of workouts. Uses:
 *  - Max observed HR across all runs → estimate maxHR
 *  - 75th percentile of max HR in hard sessions → estimate LTHR
 *  - Max sustained NP over rides → estimate bike FTP (via IF when rides are hard)
 *  - Joe Friel %LTHR zone formula
 */

import { getBearerToken, listWorkouts } from '../lib/tp-client';

interface Env {
  TP_AUTH_COOKIE: string;
  SYNC_TOKEN: string;
}

const ATHLETE_ID = 3030673;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function percentile(arr: number[], p: number): number | null {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor((p / 100) * (sorted.length - 1));
  return sorted[idx];
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  if (url.searchParams.get('token') !== env.SYNC_TOKEN) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const token = await getBearerToken(env.TP_AUTH_COOKIE);
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 180);

    const workouts = await listWorkouts(token, ATHLETE_ID, isoDate(start), isoDate(end));
    const completed = workouts.filter((w: any) => (w.distance || 0) > 0 || (w.totalTime || 0) > 0);

    const runs = completed.filter((w: any) => w.workoutTypeValueId === 3);
    const bikes = completed.filter((w: any) => w.workoutTypeValueId === 2);

    // HR analysis on runs
    const runMaxHRs = runs.map((w: any) => w.heartRateMaximum).filter((v: any) => v && v > 100);
    const runAvgHRs = runs.map((w: any) => w.heartRateAverage).filter((v: any) => v && v > 80);

    const observedMaxHR = runMaxHRs.length ? Math.max(...runMaxHRs) : null;
    const avgOfMaxHRs = runMaxHRs.length
      ? Math.round(runMaxHRs.reduce((s: number, x: number) => s + x, 0) / runMaxHRs.length)
      : null;

    // LTHR estimate: top 25% of max HR values from runs (corresponds to hard sessions)
    const top25MaxHR = percentile(runMaxHRs, 75);

    // For runs: identify "hard" sessions (top quartile by pace or RPE) and their avg HR
    const runsByPace = runs
      .filter((w: any) => w.velocityAverage)
      .sort((a: any, b: any) => (b.velocityAverage || 0) - (a.velocityAverage || 0));
    const hardRuns = runsByPace.slice(0, Math.max(1, Math.floor(runsByPace.length * 0.15)));
    const hardRunAvgHRs = hardRuns.map((w: any) => w.heartRateAverage).filter((v: any) => v && v > 100);
    const hardRunMedianAvgHR = percentile(hardRunAvgHRs, 50);

    // Threshold HR estimate: avg HR on the fastest-paced runs (these are likely tempo/threshold)
    const thresholdHR = hardRunMedianAvgHR;

    // Bike power analysis
    const bikeNPs = bikes.map((w: any) => w.normalizedPowerActual).filter((v: any) => v && v > 50);
    const bikeIFs = bikes.map((w: any) => w.if).filter((v: any) => v && v > 0.3);
    const ridesWithBoth = bikes.filter((w: any) => w.normalizedPowerActual && w.if);

    // Derive FTP from each ride: FTP = NP / IF (TP computes this relative to the stored FTP)
    const derivedFTPs = ridesWithBoth
      .map((w: any) => Math.round((w.normalizedPowerActual || 0) / (w.if || 1)))
      .filter((v: number) => v > 100 && v < 500);
    const medianFTP = percentile(derivedFTPs, 50);
    const avgFTP = derivedFTPs.length ? Math.round(derivedFTPs.reduce((s, x) => s + x, 0) / derivedFTPs.length) : null;

    // Build HR zones using Joe Friel %LTHR formula
    let hrZones: any = null;
    if (thresholdHR) {
      hrZones = {
        thresholdHR,
        observedMaxHR,
        z1_recovery: `< ${Math.round(thresholdHR * 0.85)}`,
        z2_aerobic: `${Math.round(thresholdHR * 0.85)}-${Math.round(thresholdHR * 0.89)}`,
        z3_tempo: `${Math.round(thresholdHR * 0.9)}-${Math.round(thresholdHR * 0.94)}`,
        z4_threshold: `${Math.round(thresholdHR * 0.95)}-${Math.round(thresholdHR * 0.99)}`,
        z5a_vo2: `${Math.round(thresholdHR * 1.0)}-${Math.round(thresholdHR * 1.02)}`,
        z5b_anaerobic: `${Math.round(thresholdHR * 1.03)}+`,
      };
    }

    // Build bike power zones using Coggan %FTP
    let bikeZones: any = null;
    if (medianFTP) {
      bikeZones = {
        ftp: medianFTP,
        z1_recovery: `< ${Math.round(medianFTP * 0.55)}W`,
        z2_endurance: `${Math.round(medianFTP * 0.56)}-${Math.round(medianFTP * 0.75)}W`,
        z3_tempo: `${Math.round(medianFTP * 0.76)}-${Math.round(medianFTP * 0.9)}W`,
        z4_threshold: `${Math.round(medianFTP * 0.91)}-${Math.round(medianFTP * 1.05)}W`,
        z5_vo2: `${Math.round(medianFTP * 1.06)}-${Math.round(medianFTP * 1.2)}W`,
        z6_anaerobic: `${Math.round(medianFTP * 1.21)}W+`,
      };
    }

    return Response.json({
      analyzedWindow: { start: isoDate(start), end: isoDate(end), totalWorkouts: completed.length, runs: runs.length, bikes: bikes.length },
      hrAnalysis: {
        observedMaxHR,
        avgOfMaxHRs,
        p75MaxHR: top25MaxHR,
        thresholdHREstimate: thresholdHR,
        runsWithHR: runMaxHRs.length,
        hardRunsAnalyzed: hardRunAvgHRs.length,
      },
      powerAnalysis: {
        derivedFTPs: derivedFTPs.slice(0, 20),
        medianFTP,
        avgFTP,
        ridesWithPower: ridesWithBoth.length,
      },
      hrZones,
      bikeZones,
      note: 'Zones derived from YOUR actual 180-day TP workout data. Adjust ATHLETE_PROFILE if you know your real threshold/FTP.',
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => onRequestGet(ctx);
