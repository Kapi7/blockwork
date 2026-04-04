import { defineMiddleware } from 'astro:middleware';
import { getSession } from './lib/auth';

const PUBLIC_ROUTES = ['/', '/login', '/api/auth/login', '/api/auth/callback', '/api/auth/logout', '/_astro'];

export const onRequest = defineMiddleware(async (context, next) => {
  const { request, url, locals, redirect } = context;
  const path = url.pathname;

  // Allow public routes
  if (PUBLIC_ROUTES.some((r) => path === r || (r !== '/' && path.startsWith(r)))) {
    // Still try to get user for public routes (for nav display)
    const runtime = (locals as any).runtime;
    const secret = runtime?.env?.SESSION_SECRET || 'blockwork-default-secret';
    const user = getSession(request, secret);
    if (user) (locals as any).user = user;
    return next();
  }

  // Check session
  const runtime = (locals as any).runtime;
  const secret = runtime?.env?.SESSION_SECRET || 'blockwork-default-secret';
  const user = getSession(request, secret);

  if (!user) {
    return redirect('/login', 302);
  }

  (locals as any).user = user;
  return next();
});
