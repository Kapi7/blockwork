import type { APIRoute } from 'astro';
import { clearCookie } from '../../../lib/auth';

export const GET: APIRoute = async ({ redirect }) => {
  return new Response(null, {
    status: 302,
    headers: {
      Location: '/login',
      'Set-Cookie': clearCookie(),
    },
  });
};
