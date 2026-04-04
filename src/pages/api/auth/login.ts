import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ request, redirect }) => {
  const env = (import.meta as any).env || {};
  const clientId = env.GOOGLE_CLIENT_ID || '';

  const url = new URL(request.url);
  const redirectUri = `${url.origin}/api/auth/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'select_account',
  });

  return redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`, 302);
};
