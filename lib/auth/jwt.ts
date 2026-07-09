import { createHmac, timingSafeEqual } from 'crypto';
import type { SessionUser } from '@/types/auth';

export interface JWTPayload {
  sub: string;
  email: string;
  name: string;
  role?: 'admin' | 'super_admin';
  allowedPages?: string[];
  ref?: string;
  iat: number;
  exp: number;
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }
  return secret;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(value: string): string {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  return Buffer.from((value + padding).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}

export function createJWT(user: SessionUser, maxAgeSeconds = 60 * 60 * 24 * 7): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: JWTPayload = {
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    ...(user.allowedPages ? { allowedPages: user.allowedPages } : {}),
    ...(user.ref ? { ref: user.ref } : {}),
    iat: now,
    exp: now + maxAgeSeconds,
  };

  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac('sha256', getSecret()).update(signingInput).digest('base64url');

  return `${signingInput}.${signature}`;
}

export function verifyJWT(token: string): JWTPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, signature] = parts;
  if (!encodedHeader || !encodedPayload || !signature) return null;

  try {
    const header = JSON.parse(base64UrlDecode(encodedHeader));
    if (header.alg !== 'HS256' || header.typ !== 'JWT') return null;

    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const expectedSignature = createHmac('sha256', getSecret()).update(signingInput).digest('base64url');
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) return null;

    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as JWTPayload;
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number' || payload.exp < now) return null;

    return payload;
  } catch {
    return null;
  }
}
