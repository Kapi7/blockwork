interface Env {
  DB: D1Database;
}

// POST /api/preferences — save athlete preferences
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const body = await context.request.json() as any;
  const { email, preferences } = body;

  if (!email || !preferences) {
    return Response.json({ error: 'Missing email or preferences' }, { status: 400 });
  }

  // Find user
  const user = await context.env.DB.prepare(
    'SELECT id FROM users WHERE email = ?'
  ).bind(email).first();

  if (!user) {
    return Response.json({ error: 'User not found' }, { status: 404 });
  }

  // Save preferences as JSON in athlete profile
  await context.env.DB.prepare(
    'UPDATE athletes SET profile = ? WHERE user_id = ?'
  ).bind(JSON.stringify(preferences), user.id).run();

  return Response.json({ ok: true });
};

// GET /api/preferences?email=... — get athlete preferences
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const email = url.searchParams.get('email');

  if (!email) {
    return Response.json({ error: 'Missing email' }, { status: 400 });
  }

  const athlete = await context.env.DB.prepare(
    'SELECT a.profile, a.goals, a.pbs FROM athletes a JOIN users u ON a.user_id = u.id WHERE u.email = ?'
  ).bind(email).first();

  if (!athlete) {
    return Response.json({ error: 'Athlete not found' }, { status: 404 });
  }

  const profile = athlete.profile ? JSON.parse(athlete.profile as string) : null;

  return Response.json({ preferences: profile });
};
