const COACH_EMAIL = 'kapoosha@gmail.com';
const COOKIE_NAME = 'blockwork_session';
const SESSION_DAYS = 30;

export interface UserSession {
  id: string;
  email: string;
  name: string;
  picture: string;
  role: 'coach' | 'athlete';
}

/** Create a base64-encoded session token (simple approach for MVP) */
export function createSessionToken(user: UserSession, secret: string): string {
  const payload = {
    ...user,
    exp: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000,
  };
  const data = JSON.stringify(payload);
  // Simple HMAC-like signature using the secret
  const encoder = new TextEncoder();
  const combined = `${btoa(data)}.${btoa(secret + data)}`;
  return combined;
}

/** Verify and decode a session token */
export function verifySessionToken(token: string, secret: string): UserSession | null {
  try {
    const [dataB64, sigB64] = token.split('.');
    if (!dataB64 || !sigB64) return null;

    const data = atob(dataB64);
    const expectedSig = btoa(secret + data);

    if (sigB64 !== expectedSig) return null;

    const payload = JSON.parse(data);
    if (payload.exp && payload.exp < Date.now()) return null;

    return {
      id: payload.id,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      role: payload.role,
    };
  } catch {
    return null;
  }
}

/** Set session cookie */
export function sessionCookie(token: string): string {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${SESSION_DAYS * 86400}`;
}

/** Clear session cookie */
export function clearCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`;
}

/** Extract session from request cookies */
export function getSession(request: Request, secret: string): UserSession | null {
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;
  return verifySessionToken(match[1], secret);
}

/** Determine role based on email */
export function roleForEmail(email: string): 'coach' | 'athlete' {
  return email.toLowerCase() === COACH_EMAIL ? 'coach' : 'athlete';
}
