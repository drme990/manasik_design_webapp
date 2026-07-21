import type { Metadata, Viewport } from "next";
import localFont from 'next/font/local';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { ToastProvider } from '@/components/providers/ToastProvider';
import { editorFontVariables } from '@/lib/constants/fonts';
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
  title: "تصميمات مناسك",
  description: "تطبيق التصميم للمناسبات والاحتفالات",
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ar"
      dir="rtl"
      suppressHydrationWarning
      className={`${satoshi.variable} ${expoArabic.variable} ${editorFontVariables} h-full antialiased`}
    >
      <body
        className="min-h-full"
        style={{ fontFamily: 'var(--font-expo-arabic), sans-serif' }}
      >
        <ThemeProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
