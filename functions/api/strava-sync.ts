interface Env {
  DB: D1Database;
  STRAVA_CLIENT_ID: string;
  STRAVA_CLIENT_SECRET: string;
}

// POST /api/strava-sync — sync activities for a user
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const body = await context.request.json() as any;
  const { email } = body;

  if (!email) {
    return Response.json({ error: 'Missing email' }, { status: 400 });
  }

  // Get user + athlete with Strava token
  const athlete = await context.env.DB.prepare(
    `SELECT a.id, a.strava_refresh_token, u.id as user_id
     FROM athletes a JOIN users u ON a.user_id = u.id
     WHERE u.email = ?`
  ).bind(email).first();

  if (!athlete?.strava_refresh_token) {
    return Response.json({ error: 'Strava not connected' }, { status: 400 });
  }

  // Refresh access token
  const tokenRes = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: context.env.STRAVA_CLIENT_ID,
      client_secret: context.env.STRAVA_CLIENT_SECRET,
      refresh_token: athlete.strava_refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  if (!tokenRes.ok) {
    return Response.json({ error: 'Token refresh failed' }, { status: 500 });
  }

  const tokens = await tokenRes.json() as any;
  const accessToken = tokens.access_token;

  // Update refresh token if changed
  if (tokens.refresh_token && tokens.refresh_token !== athlete.strava_refresh_token) {
    await context.env.DB.prepare(
      'UPDATE athletes SET strava_refresh_token = ? WHERE id = ?'
    ).bind(tokens.refresh_token, athlete.id).run();
  }

  // Get latest activity date for this user
  const latest = await context.env.DB.prepare(
    'SELECT MAX(date) as max_date FROM activities WHERE athlete_id = ?'
  ).bind(athlete.id).first();

  const after = latest?.max_date
    ? Math.floor(new Date(latest.max_date as string).getTime() / 1000) - 86400
    : Math.floor(Date.now() / 1000) - 90 * 86400; // 90 days back

  // Fetch activities
  let allActivities: any[] = [];
  let page = 1;
  while (true) {
    const res = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=100&page=${page}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) break;
    const activities = await res.json() as any[];
    if (activities.length === 0) break;
    allActivities = allActivities.concat(activities);
    if (activities.length < 100) break;
    page++;
  }

  // Sport category mapping
  function sportCategory(type: string): string {
    const map: Record<string, string> = {
      Run: 'run', VirtualRun: 'run', TrailRun: 'run',
      Ride: 'bike', VirtualRide: 'bike', EBikeRide: 'bike', MountainBikeRide: 'bike',
      Swim: 'swim', Yoga: 'yoga', Pilates: 'yoga',
      WeightTraining: 'strength', Crossfit: 'strength', Workout: 'strength',
      Hike: 'hike', Walk: 'hike',
    };
    return map[type] || 'other';
  }

  // Upsert activities
  let newCount = 0;
  for (const a of allActivities) {
    const dist = Math.round((a.distance / 1000) * 10) / 10;
    const pace = dist > 0 ? Math.round((a.moving_time / dist) * 10) / 10 : 0;
    const date = (a.start_date_local || '').slice(0, 10);
    const sport = sportCategory(a.sport_type || a.type);

    const existing = await context.env.DB.prepare(
      'SELECT id FROM activities WHERE id = ?'
    ).bind(a.id).first();

    if (!existing) {
      await context.env.DB.prepare(
        `INSERT INTO activities (id, athlete_id, name, distance, time, date, pace, hr, max_hr, elevation, type, sport)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        a.id, athlete.id, a.name, dist, a.moving_time, date, pace,
        a.average_heartrate || 0, a.max_heartrate || 0,
        a.total_elevation_gain || 0, a.sport_type || a.type, sport
      ).run();
      newCount++;
    }
  }

  return Response.json({
    synced: newCount,
    total: allActivities.length,
    athleteId: athlete.id,
  });
};
