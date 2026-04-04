import type { APIRoute } from 'astro';
import { createSessionToken, sessionCookie, roleForEmail } from '../../../lib/auth';
import type { UserSession } from '../../../lib/auth';

export const GET: APIRoute = async ({ request, redirect }) => {
  const env = (import.meta as any).env || {};
  const clientId = env.GOOGLE_CLIENT_ID || '';
  const clientSecret = env.GOOGLE_CLIENT_SECRET || '';
  const sessionSecret = env.SESSION_SECRET || 'blockwork-default-secret';

  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return new Response('Missing auth code', { status: 400 });
  }

  const redirectUri = `${url.origin}/api/auth/callback`;

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    return new Response(`Token exchange failed: ${err}`, { status: 500 });
  }

  const tokens = await tokenRes.json();

  // Get user info
  const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!userRes.ok) {
    return new Response('Failed to get user info', { status: 500 });
  }

  const profile = await userRes.json();

  // Upsert user in D1
  const runtime = (Astro as any)?.locals?.runtime;
  const db = runtime?.env?.DB;

  const userId = profile.id;
  const email = profile.email;
  const name = profile.name || email;
  const picture = profile.picture || '';
  const role = roleForEmail(email);

  if (db) {
    await db.prepare(
      `INSERT INTO users (id, email, name, picture, role) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET name = ?, picture = ?, role = ?`
    ).bind(userId, email, name, picture, role, name, picture, role).run();

    // Auto-create athlete profile if none exists
    const existing = await db.prepare('SELECT id FROM athletes WHERE user_id = ?').bind(userId).first();
    if (!existing) {
      const athleteId = `athlete-${userId}`;
      await db.prepare(
        `INSERT INTO athletes (id, user_id, coach_id, name, sport) VALUES (?, ?, ?, ?, ?)`
      ).bind(athleteId, userId, null, name, 'run').run();
    }
  }

  const user: UserSession = { id: userId, email, name, picture, role };
  const token = createSessionToken(user, sessionSecret);

  return new Response(null, {
    status: 302,
    headers: {
      Location: '/',
      'Set-Cookie': sessionCookie(token),
    },
  });
};
