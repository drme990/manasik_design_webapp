'use server';

import { cookies } from 'next/headers';
import { routing } from '@/i18n/routing';

export async function setUserLocale(locale: string) {
    if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
        return;
    }

    const cookieStore = await cookies();
    cookieStore.set('DESIGN_LOCALE', locale, {
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
        sameSite: 'strict',
    });
}
