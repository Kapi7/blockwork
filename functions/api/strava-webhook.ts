/**
 * POST /api/strava-webhook — receives Strava activity events.
 * GET  /api/strava-webhook — Strava subscription verification challenge.
 *
 * When a new activity uploads to Strava, Strava pings this endpoint.
 * We wait a bit (TP needs time to sync from Garmin), then dispatch the
 * george-sync GitHub Action so Playwright posts George's comment.
 */

interface Env {
  STRAVA_VERIFY_TOKEN?: string;
  GITHUB_TOKEN?: string;
  GITHUB_REPO?: string; // e.g. "Kapi7/blockwork"
}

// GET — Strava's subscription verification handshake
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === (env.STRAVA_VERIFY_TOKEN || 'blockwork-strava-verify')) {
    return Response.json({ 'hub.challenge': challenge });
  }
  return new Response('Forbidden', { status: 403 });
};

// POST — new activity notification
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let event: any;
  try {
    event = await request.json();
  } catch {
    return new Response('Bad body', { status: 400 });
  }

  // Only react to new activities
  if (event.object_type !== 'activity' || event.aspect_type !== 'create') {
    return Response.json({ ignored: true, reason: 'not new activity' });
  }

  // Dispatch the GitHub Action via repository_dispatch
  if (env.GITHUB_TOKEN && env.GITHUB_REPO) {
    try {
      const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/dispatches`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'User-Agent': 'blockwork-strava-webhook',
        },
        body: JSON.stringify({
          event_type: 'strava-activity',
          client_payload: {
            activityId: event.object_id,
            athleteId: event.owner_id,
            ts: new Date().toISOString(),
          },
        }),
      });
      if (!res.ok) {
        console.error(`GitHub dispatch failed: ${res.status} ${await res.text()}`);
      }
    } catch (err: any) {
      console.error(`GitHub dispatch error: ${err.message}`);
    }
  }

  // Always ack immediately so Strava doesn't retry
  return Response.json({ received: true, activityId: event.object_id });
};
