import type { APIRoute } from 'astro';
import { getSession } from '../../../lib/auth';

export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = (locals as any).runtime;
  const db = runtime?.env?.DB;
  const secret = runtime?.env?.SESSION_SECRET || 'blockwork-default-secret';
  const user = getSession(request, secret);

  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const body = await request.json();
  const { sessionId, newDate } = body;

  if (!sessionId || !newDate || !db) {
    return new Response(JSON.stringify({ error: 'Missing sessionId or newDate' }), { status: 400 });
  }

  // Verify the session belongs to an athlete the user has access to
  const session = await db.prepare('SELECT * FROM sessions WHERE id = ?').bind(sessionId).first();
  if (!session) {
    return new Response(JSON.stringify({ error: 'Session not found' }), { status: 404 });
  }

  // Update date
  await db.prepare('UPDATE sessions SET date = ? WHERE id = ?').bind(newDate, sessionId).run();

  return new Response(JSON.stringify({ ok: true, sessionId, newDate }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
