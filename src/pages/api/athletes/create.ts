import type { APIRoute } from 'astro';
import { getSession } from '../../../lib/auth';

export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = (locals as any).runtime;
  const db = runtime?.env?.DB;
  const secret = runtime?.env?.SESSION_SECRET || 'blockwork-default-secret';
  const user = getSession(request, secret);

  if (!user || user.role !== 'coach') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const body = await request.json();
  const { name, email, sport, experience, pb_5k, pb_10k, pb_hm, pb_marathon, goal, volume, notes } = body;

  if (!name || !email) {
    return new Response(JSON.stringify({ error: 'Name and email required' }), { status: 400 });
  }

  const athleteId = `athlete-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const pbs = JSON.stringify({
    '5k': pb_5k || null,
    '10k': pb_10k || null,
    'half': pb_hm || null,
    'marathon': pb_marathon || null,
  });

  const goals = JSON.stringify([
    { priority: 1, goal, target: goal, timeline: 'TBD' },
  ]);

  const profile = JSON.stringify({
    experience: parseInt(experience) || 0,
    weeklyVolume: parseInt(volume) || 0,
    notes: notes || '',
  });

  if (db) {
    // Check if user exists, create if not
    const existingUser = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    let userId = existingUser?.id;
    if (!userId) {
      userId = `user-${Date.now()}`;
      await db.prepare('INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?)').bind(userId, email, name, 'athlete').run();
    }

    await db.prepare(
      `INSERT INTO athletes (id, user_id, coach_id, name, sport, goals, pbs, profile)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(athleteId, userId, user.id, name, sport || 'run', goals, pbs, profile).run();
  }

  return new Response(JSON.stringify({ id: athleteId, name, email }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
