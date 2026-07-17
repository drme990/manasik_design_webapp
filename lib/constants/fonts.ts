import {
  Tajawal,
  IBM_Plex_Sans_Arabic,
} from 'next/font/google';

const tajawal = Tajawal({ subsets: ['arabic', 'latin'], weight: ['400', '500', '700', '800'], variable: '--font-tajawal', display: 'swap' });
const ibmPlexSansArabic = IBM_Plex_Sans_Arabic({ subsets: ['arabic', 'latin'], weight: ['400', '500', '700'], variable: '--font-ibm-plex-sans-arabic', display: 'swap' });

export const editorFontVariables = [
  tajawal.variable, ibmPlexSansArabic.variable,
].join(' ');

export const FONT_CSS_VAR_MAP: Record<string, string> = {
  'Expo Arabic': 'var(--font-expo-arabic)',
  'Tajawal': 'var(--font-tajawal)',
  'IBM Plex Sans Arabic': 'var(--font-ibm-plex-sans-arabic)',
};

export function resolveFontFamily(fontFamily: string): string {
  return FONT_CSS_VAR_MAP[fontFamily] || fontFamily;
}
