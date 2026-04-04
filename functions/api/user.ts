interface Env {
  DB: D1Database;
}

// POST /api/user — save/update user on Google login
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const body = await request.json() as any;
  const { googleId, email, name, picture } = body;

  if (!email || !googleId) {
    return Response.json({ error: 'Missing email or googleId' }, { status: 400 });
  }

  const role = email.toLowerCase() === 'kapoosha@gmail.com' ? 'coach' : 'athlete';

  // Upsert user
  await env.DB.prepare(
    `INSERT INTO users (id, email, name, picture, role)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET name = excluded.name, picture = excluded.picture`
  ).bind(googleId, email, name || email, picture || '', role).run();

  // Check if athlete profile exists
  const athlete = await env.DB.prepare(
    'SELECT id, strava_refresh_token FROM athletes WHERE user_id = ?'
  ).bind(googleId).first();

  let athleteId = athlete?.id as string | null;
  const stravaConnected = !!(athlete?.strava_refresh_token);

  if (!athleteId) {
    athleteId = `athlete-${googleId}`;
    await env.DB.prepare(
      'INSERT INTO athletes (id, user_id, coach_id, name, sport) VALUES (?, ?, ?, ?, ?)'
    ).bind(athleteId, googleId, null, name || email, 'run').run();
  }

  return Response.json({
    id: googleId,
    email,
    name,
    picture,
    role,
    athleteId,
    stravaConnected,
  });
};

// GET /api/user?email=... — get user profile
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const email = url.searchParams.get('email');

  if (!email) {
    return Response.json({ error: 'Missing email' }, { status: 400 });
  }

  const user = await context.env.DB.prepare(
    'SELECT u.*, a.id as athlete_id, a.sport, a.goals, a.pbs, a.strava_refresh_token FROM users u LEFT JOIN athletes a ON a.user_id = u.id WHERE u.email = ?'
  ).bind(email).first();

  if (!user) {
    return Response.json({ error: 'User not found' }, { status: 404 });
  }

  return Response.json({
    id: user.id,
    email: user.email,
    name: user.name,
    picture: user.picture,
    role: user.role,
    athleteId: user.athlete_id,
    sport: user.sport,
    goals: user.goals,
    pbs: user.pbs,
    stravaConnected: !!(user.strava_refresh_token),
  });
};
