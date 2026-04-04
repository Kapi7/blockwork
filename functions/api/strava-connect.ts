interface Env {
  DB: D1Database;
  STRAVA_CLIENT_ID: string;
  STRAVA_CLIENT_SECRET: string;
}

// GET /api/strava-connect?email=... — redirect to Strava OAuth
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const email = url.searchParams.get('email');

  if (!email) {
    return Response.json({ error: 'Missing email' }, { status: 400 });
  }

  const clientId = context.env.STRAVA_CLIENT_ID;
  const redirectUri = `${url.origin}/api/strava-callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: 'read,activity:read_all',
    state: email, // pass email to identify user in callback
  });

  return Response.redirect(`https://www.strava.com/oauth/authorize?${params}`, 302);
};
