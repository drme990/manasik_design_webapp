import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { routing } from '@/i18n/routing';

export default getRequestConfig(async () => {
  const cookieValue = (await cookies()).get('DESIGN_LOCALE')?.value;
  const locale = (
    cookieValue && routing.locales.includes(cookieValue as (typeof routing.locales)[number])
      ? cookieValue
      : routing.defaultLocale
  );

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
