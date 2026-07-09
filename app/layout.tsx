import type { Metadata } from "next";
import localFont from 'next/font/local';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getLocale } from 'next-intl/server';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import "./globals.css";

const satoshi = localFont({
  src: [
    { path: '../public/fonts/Satoshi/Satoshi-Light.otf', weight: '300', style: 'normal' },
    { path: '../public/fonts/Satoshi/Satoshi-Regular.otf', weight: '400', style: 'normal' },
    { path: '../public/fonts/Satoshi/Satoshi-Medium.otf', weight: '500', style: 'normal' },
    { path: '../public/fonts/Satoshi/Satoshi-Bold.otf', weight: '700', style: 'normal' },
    { path: '../public/fonts/Satoshi/Satoshi-Black.otf', weight: '900', style: 'normal' },
    { path: '../public/fonts/Satoshi/Satoshi-LightItalic.otf', weight: '300', style: 'italic' },
    { path: '../public/fonts/Satoshi/Satoshi-Italic.otf', weight: '400', style: 'italic' },
    { path: '../public/fonts/Satoshi/Satoshi-MediumItalic.otf', weight: '500', style: 'italic' },
    { path: '../public/fonts/Satoshi/Satoshi-BoldItalic.otf', weight: '700', style: 'italic' },
    { path: '../public/fonts/Satoshi/Satoshi-BlackItalic.otf', weight: '900', style: 'italic' },
  ],
  variable: '--font-satoshi',
  display: 'swap',
});

const expoArabic = localFont({
  src: [
    { path: '../public/fonts/ExpoArabic/ExpoArabic-Light.ttf', weight: '300', style: 'normal' },
    { path: '../public/fonts/ExpoArabic/ExpoArabic-Book.ttf', weight: '400', style: 'normal' },
    { path: '../public/fonts/ExpoArabic/ExpoArabic-Medium.ttf', weight: '500', style: 'normal' },
    { path: '../public/fonts/ExpoArabic/ExpoArabic-SemiBold.ttf', weight: '600', style: 'normal' },
    { path: '../public/fonts/ExpoArabic/ExpoArabic-Bold.otf', weight: '700', style: 'normal' },
  ],
  variable: '--font-expo-arabic',
  display: 'swap',
});

export const metadata: Metadata = {
  title: "Manasik Design",
  description: "Design app for events and celebrations",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  const isRtl = locale === 'ar';

  return (
    <html
      lang={locale}
      dir={isRtl ? 'rtl' : 'ltr'}
      suppressHydrationWarning
      className={`${satoshi.variable} ${expoArabic.variable} h-full antialiased`}
    >
      <body
        className="min-h-full flex flex-col"
        style={{ fontFamily: isRtl ? 'var(--font-expo-arabic), sans-serif' : 'var(--font-satoshi), sans-serif' }}
      >
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider>
            {children}
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
