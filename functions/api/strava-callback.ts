interface Env {
  DB: D1Database;
  STRAVA_CLIENT_ID: string;
  STRAVA_CLIENT_SECRET: string;
}

// GET /api/strava-callback — Strava OAuth callback
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const code = url.searchParams.get('code');
  const email = url.searchParams.get('state'); // email passed as state

  if (!code || !email) {
    return new Response('Missing code or state', { status: 400 });
  }

  // Exchange code for tokens
  const tokenRes = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: context.env.STRAVA_CLIENT_ID,
      client_secret: context.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    return new Response(`Strava token exchange failed: ${err}`, { status: 500 });
  }

  const tokens = await tokenRes.json() as any;

  // Save refresh token to athlete profile
  const user = await context.env.DB.prepare(
    'SELECT id FROM users WHERE email = ?'
  ).bind(email).first();

  if (user) {
    await context.env.DB.prepare(
      'UPDATE athletes SET strava_refresh_token = ? WHERE user_id = ?'
    ).bind(tokens.refresh_token, user.id).run();
  }

  // Redirect back to dashboard with success
  return Response.redirect(`${url.origin}/dashboard?strava=connected`, 302);
};
