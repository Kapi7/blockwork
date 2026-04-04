interface Env {
  DB: D1Database;
}

// GET /api/activities?email=...&limit=50&sport=run
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const email = url.searchParams.get('email');
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const sport = url.searchParams.get('sport');

  if (!email) {
    return Response.json({ error: 'Missing email' }, { status: 400 });
  }

  // Find athlete for this user
  const athlete = await context.env.DB.prepare(
    'SELECT a.id FROM athletes a JOIN users u ON a.user_id = u.id WHERE u.email = ?'
  ).bind(email).first();

  if (!athlete) {
    return Response.json({ error: 'Athlete not found' }, { status: 404 });
  }

  let query = 'SELECT * FROM activities WHERE athlete_id = ?';
  const params: any[] = [athlete.id];

  if (sport) {
    query += ' AND sport = ?';
    params.push(sport);
  }

  query += ' ORDER BY date DESC LIMIT ?';
  params.push(limit);

  const result = await context.env.DB.prepare(query).bind(...params).all();

  return Response.json({
    activities: result.results,
    count: result.results.length,
  });
};
