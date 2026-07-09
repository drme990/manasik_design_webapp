import { NextRequest, NextResponse } from 'next/server';
import { findUserByEmail } from '@/lib/auth/user.repository';
import { comparePassword } from '@/lib/auth/password';
import { createJWT } from '@/lib/auth/jwt';
import { AUTH_COOKIE_NAME, AUTH_COOKIE_MAX_AGE } from '@/lib/auth/constants';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'missingCredentials' },
        { status: 400 }
      );
    }

    const user = await findUserByEmail(email);
    if (!user) {
      console.warn('[login] User not found:', email);
      return NextResponse.json(
        { success: false, error: 'invalidCredentials' },
        { status: 401 }
      );
    }

    console.log('[login] User found:', email, 'hasPassword:', !!user.password);

    const isMatch = await comparePassword(password, user.password);
    if (!isMatch) {
      console.warn('[login] Password mismatch:', email);
      return NextResponse.json(
        { success: false, error: 'invalidCredentials' },
        { status: 401 }
      );
    }

    const userId = user._id?.toString() || email;
    const role = user.role || 'admin';
    const token = createJWT({
      id: userId,
      email: user.email,
      name: user.name,
      role,
      allowedPages: user.allowedPages,
      ref: user.ref,
    });

    const response = NextResponse.json({
      success: true,
      user: {
        id: userId,
        name: user.name,
        email: user.email,
        role,
        allowedPages: user.allowedPages,
        ref: user.ref,
      },
    });

    response.cookies.set(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: AUTH_COOKIE_MAX_AGE,
    });

    return response;
  } catch (error) {
    console.error('Login API error:', error);
    return NextResponse.json(
      { success: false, error: 'serverError' },
      { status: 500 }
    );
  }
}
