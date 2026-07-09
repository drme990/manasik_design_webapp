'use server';

import { cookies } from 'next/headers';
import { verifyJWT } from './jwt';
import { AUTH_COOKIE_NAME } from './constants';
import type { SessionUser } from '@/types/auth';

export async function verifySession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = verifyJWT(token);
  if (!payload) return null;

  return {
    id: payload.sub,
    email: payload.email,
    name: payload.name,
    role: payload.role || 'admin',
    allowedPages: payload.allowedPages,
    ref: payload.ref,
  };
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}
