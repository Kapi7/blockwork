/**
 * Find all workouts near Peyia, Cyprus.
 *
 * Usage: STRAVA_CLIENT_ID=202546 STRAVA_CLIENT_SECRET=16799c36ec8b4e3646b5edfaf5e78e9315c7748c STRAVA_REFRESH_TOKEN=dedc457078a9d76172d7192c3289a25b06e7296d npx tsx scripts/find-peyia.ts
 */

const CLIENT_ID = process.env.STRAVA_CLIENT_ID;
const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.STRAVA_REFRESH_TOKEN;

const PEYIA_LAT = 34.88;
const PEYIA_LON = 32.38;
const RADIUS_KM = 5;

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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
  const data = await res.json();
  if (!data.access_token) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    console.error('Missing STRAVA env vars');
    process.exit(1);
  }

  const token = await refreshAccessToken();
  console.log('Token refreshed OK\n');

  let allActivities: any[] = [];
  let page = 1;
  while (true) {
    const url = `https://www.strava.com/api/v3/athlete/activities?per_page=200&page=${page}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const acts = await r.json();
    if (!Array.isArray(acts) || acts.length === 0) break;
    allActivities = allActivities.concat(acts);
    console.error(`Fetched page ${page}: ${acts.length} activities (total: ${allActivities.length})`);
    if (acts.length < 200) break;
    page++;
  }

  const peyiaRuns = allActivities.filter((a) => {
    if (!a.start_latlng || a.start_latlng.length < 2) return false;
    return haversine(a.start_latlng[0], a.start_latlng[1], PEYIA_LAT, PEYIA_LON) <= RADIUS_KM;
  });

  peyiaRuns.sort((a: any, b: any) => new Date(b.start_date_local).getTime() - new Date(a.start_date_local).getTime());

  console.log(`\n=== WORKOUTS IN PEYIA (${peyiaRuns.length} found, within ${RADIUS_KM}km) ===\n`);
  console.log('Date       | Name                                | Type     | Dist    | Time    | Pace      | Elev  | HR');
  console.log('-'.repeat(120));

  peyiaRuns.forEach((a: any) => {
    const dist = (a.distance / 1000).toFixed(1) + 'km';
    const mins = Math.floor(a.moving_time / 60);
    const secs = String(a.moving_time % 60).padStart(2, '0');
    const pace = a.distance > 0 ? ((a.moving_time / 60) / (a.distance / 1000)).toFixed(1) + '/km' : '-';
    const date = a.start_date_local.slice(0, 10);
    const elev = a.total_elevation_gain ? a.total_elevation_gain.toFixed(0) + 'm' : '-';
    const hr = a.average_heartrate ? a.average_heartrate.toFixed(0) + 'bpm' : '-';
    console.log(
      `${date} | ${a.name.padEnd(35)} | ${a.type.padEnd(8)} | ${dist.padStart(7)} | ${mins}:${secs} | ${pace.padStart(9)} | ${elev.padStart(5)} | ${hr}`
    );
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
