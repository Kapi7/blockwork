/**
 * Strava webhook handler.
 *
 * GET — subscription verification handshake.
 * POST — new activity event: wait a bit (TP needs to sync from Garmin),
 *        then call /api/george/post internally to analyze & comment.
 */

interface Env {
  STRAVA_VERIFY_TOKEN?: string;
  SYNC_TOKEN: string;
  TP_AUTH_COOKIE: string;
  ANTHROPIC_API_KEY: string;
}

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

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let event: any;
  try {
    event = await request.json();
  } catch {
    return new Response('Bad body', { status: 400 });
  }

  // Only react to new activities (not updates/deletes)
  if (event.object_type !== 'activity' || event.aspect_type !== 'create') {
    return Response.json({ ignored: true, reason: 'not new activity' });
  }

  // Fire-and-forget: TP needs ~2-3 min to sync from Garmin.
  // We schedule the George loop with a delay by calling waitUntil.
  // NOTE: Cloudflare Workers don't support long sleeps in waitUntil (max ~30s),
  // so we immediately trigger — George will process whatever TP has. If the
  // activity isn't in TP yet, the cron job will pick it up within 2 hours.
  const origin = new URL(request.url).origin;
  const url = `${origin}/api/george/post?token=${encodeURIComponent(env.SYNC_TOKEN)}`;

  // Wait 3 seconds before firing (minimal delay to let TP process)
  const runLater = async () => {
    await new Promise((r) => setTimeout(r, 3000));
    try {
      const r = await fetch(url, { method: 'POST' });
      console.log(`George triggered from Strava webhook: ${r.status}`);
    } catch (e: any) {
      console.error(`George trigger failed: ${e.message}`);
    }
  };
  // @ts-expect-error — waitUntil exists on Pages Function context
  (request as any).waitUntil?.(runLater()) ?? runLater();

  return Response.json({ received: true, activityId: event.object_id });
};
