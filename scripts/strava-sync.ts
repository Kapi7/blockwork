/**
 * Fetches new runs from Strava API, merges with existing data,
 * and runs the prepare-data pipeline.
 *
 * Usage: STRAVA_CLIENT_ID=x STRAVA_CLIENT_SECRET=x STRAVA_REFRESH_TOKEN=x npx tsx scripts/strava-sync.ts
 */

import fs from 'fs';
import path from 'path';

const CLIENT_ID = process.env.STRAVA_CLIENT_ID;
const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.STRAVA_REFRESH_TOKEN;

const RAW_FILE = path.join(process.cwd(), 'data', 'raw', 'all_runs.json');

async function refreshAccessToken(): Promise<string> {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  console.log(`Token refreshed. Expires at: ${new Date(data.expires_at * 1000).toISOString()}`);
  return data.access_token;
}

async function fetchActivities(token: string, after: number, page: number = 1): Promise<any[]> {
  const url = `https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=100&page=${page}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Strava API error: ${res.status} ${await res.text()}`);
  }

  return res.json();
}

async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    console.error('Missing STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, or STRAVA_REFRESH_TOKEN');
    process.exit(1);
  }

  // Ensure raw directory exists
  fs.mkdirSync(path.dirname(RAW_FILE), { recursive: true });

  // Load existing runs
  let existing: any[] = [];
  if (fs.existsSync(RAW_FILE)) {
    existing = JSON.parse(fs.readFileSync(RAW_FILE, 'utf-8'));
  }

  const existingIds = new Set(existing.map((r: any) => r.id));

  // Find the most recent activity date to fetch after
  let afterTimestamp = 0;
  if (existing.length > 0) {
    const dates = existing
      .map((r: any) => new Date(r.start_date_local || r.start_date).getTime())
      .filter((d: number) => !isNaN(d));
    if (dates.length > 0) {
      // Fetch from 2 days before latest to catch any stragglers
      afterTimestamp = Math.floor((Math.max(...dates) - 2 * 86400000) / 1000);
    }
  }

  console.log(`Existing runs: ${existing.length}`);
  console.log(`Fetching activities after: ${afterTimestamp > 0 ? new Date(afterTimestamp * 1000).toISOString() : 'all time'}`);

  // Get fresh token
  const token = await refreshAccessToken();

  // Fetch all new pages
  let allNew: any[] = [];
  let page = 1;
  while (true) {
    const activities = await fetchActivities(token, afterTimestamp, page);
    if (activities.length === 0) break;
    allNew = allNew.concat(activities);
    console.log(`  Page ${page}: ${activities.length} activities`);
    if (activities.length < 100) break;
    page++;
  }

  // Filter to only truly new ones
  const newRuns = allNew.filter((r: any) => !existingIds.has(r.id));
  console.log(`New activities: ${newRuns.length} (${allNew.length} fetched, ${allNew.length - newRuns.length} duplicates)`);

  if (newRuns.length === 0) {
    console.log('No new activities. Data is up to date.');
    return;
  }

  // Merge: new runs first (most recent), then existing
  const merged = [...newRuns, ...existing];

  // Sort by date descending
  merged.sort((a: any, b: any) => {
    const da = new Date(a.start_date_local || a.start_date).getTime();
    const db = new Date(b.start_date_local || b.start_date).getTime();
    return db - da;
  });

  // Write merged data
  fs.writeFileSync(RAW_FILE, JSON.stringify(merged, null, 0));
  console.log(`Written ${merged.length} total activities to ${RAW_FILE}`);
  console.log(`File size: ${(fs.statSync(RAW_FILE).size / 1024).toFixed(0)}KB`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
