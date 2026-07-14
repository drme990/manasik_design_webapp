import {
  Tajawal,
  Cairo,
  Almarai,
  IBM_Plex_Sans_Arabic,
  Noto_Sans_Arabic,
  Noto_Kufi_Arabic,
  Amiri,
  Aref_Ruqaa,
  Reem_Kufi,
  El_Messiri,
  Lateef,
  Scheherazade_New,
  Markazi_Text,
  Vazirmatn,
  Inter,
  Roboto,
  Open_Sans,
  Lato,
  Montserrat,
  Poppins,
  Playfair_Display,
  Merriweather,
  Oswald,
  Raleway,
  Dancing_Script,
  Bebas_Neue,
} from 'next/font/google';

const tajawal = Tajawal({ subsets: ['arabic', 'latin'], weight: ['300', '400', '500', '700', '800'], variable: '--font-tajawal', display: 'swap' });
const cairo = Cairo({ subsets: ['arabic', 'latin'], weight: ['300', '400', '500', '600', '700', '800', '900'], variable: '--font-cairo', display: 'swap' });
const almarai = Almarai({ subsets: ['arabic', 'latin'], weight: ['300', '400', '700', '800'], variable: '--font-almarai', display: 'swap' });
const ibmPlexSansArabic = IBM_Plex_Sans_Arabic({ subsets: ['arabic', 'latin'], weight: ['300', '400', '500', '600', '700'], variable: '--font-ibm-plex-sans-arabic', display: 'swap' });
const notoSansArabic = Noto_Sans_Arabic({ subsets: ['arabic', 'latin'], weight: ['300', '400', '500', '600', '700', '800'], variable: '--font-noto-sans-arabic', display: 'swap' });
const notoKufiArabic = Noto_Kufi_Arabic({ subsets: ['arabic', 'latin'], weight: ['300', '400', '500', '600', '700', '800'], variable: '--font-noto-kufi-arabic', display: 'swap' });
const amiri = Amiri({ subsets: ['arabic', 'latin'], weight: ['400', '700'], style: ['normal', 'italic'], variable: '--font-amiri', display: 'swap' });
const arefRuqaa = Aref_Ruqaa({ subsets: ['arabic', 'latin'], weight: ['400', '700'], variable: '--font-aref-ruqaa', display: 'swap' });
const reemKufi = Reem_Kufi({ subsets: ['arabic', 'latin'], weight: ['400', '500', '600', '700'], variable: '--font-reem-kufi', display: 'swap' });
const elMessiri = El_Messiri({ subsets: ['arabic', 'latin'], weight: ['400', '500', '600', '700'], variable: '--font-el-messiri', display: 'swap' });
const lateef = Lateef({ subsets: ['arabic', 'latin'], weight: ['400', '700'], variable: '--font-lateef', display: 'swap' });
const scheherazadeNew = Scheherazade_New({ subsets: ['arabic', 'latin'], weight: ['400', '700'], variable: '--font-scheherazade-new', display: 'swap' });
const markaziText = Markazi_Text({ subsets: ['arabic', 'latin'], weight: ['400', '500', '600', '700'], variable: '--font-markazi-text', display: 'swap' });
const vazirmatn = Vazirmatn({ subsets: ['arabic', 'latin'], weight: ['300', '400', '500', '600', '700', '800', '900'], variable: '--font-vazirmatn', display: 'swap' });

const inter = Inter({ subsets: ['latin'], weight: ['300', '400', '500', '600', '700', '800', '900'], variable: '--font-inter', display: 'swap' });
const roboto = Roboto({ subsets: ['latin'], weight: ['300', '400', '500', '700', '900'], variable: '--font-roboto', display: 'swap' });
const openSans = Open_Sans({ subsets: ['latin'], weight: ['300', '400', '500', '600', '700', '800'], variable: '--font-open-sans', display: 'swap' });
const lato = Lato({ subsets: ['latin'], weight: ['300', '400', '700', '900'], variable: '--font-lato', display: 'swap' });
const montserrat = Montserrat({ subsets: ['latin'], weight: ['300', '400', '500', '600', '700', '800', '900'], variable: '--font-montserrat', display: 'swap' });
const poppins = Poppins({ subsets: ['latin'], weight: ['300', '400', '500', '600', '700', '800', '900'], variable: '--font-poppins', display: 'swap' });
const playfairDisplay = Playfair_Display({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800', '900'], variable: '--font-playfair-display', display: 'swap' });
const merriweather = Merriweather({ subsets: ['latin'], weight: ['300', '400', '700', '900'], variable: '--font-merriweather', display: 'swap' });
const oswald = Oswald({ subsets: ['latin'], weight: ['200', '300', '400', '500', '600', '700'], variable: '--font-oswald', display: 'swap' });
const raleway = Raleway({ subsets: ['latin'], weight: ['300', '400', '500', '600', '700', '800', '900'], variable: '--font-raleway', display: 'swap' });
const dancingScript = Dancing_Script({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-dancing-script', display: 'swap' });
const bebasNeue = Bebas_Neue({ subsets: ['latin'], weight: ['400'], variable: '--font-bebas-neue', display: 'swap' });

export const editorFontVariables = [
  tajawal.variable, cairo.variable, almarai.variable, ibmPlexSansArabic.variable,
  notoSansArabic.variable, notoKufiArabic.variable, amiri.variable, arefRuqaa.variable,
  reemKufi.variable, elMessiri.variable, lateef.variable, scheherazadeNew.variable,
  markaziText.variable, vazirmatn.variable,
  inter.variable, roboto.variable, openSans.variable, lato.variable,
  montserrat.variable, poppins.variable, playfairDisplay.variable, merriweather.variable,
  oswald.variable, raleway.variable, dancingScript.variable, bebasNeue.variable,
].join(' ');

export const FONT_CSS_VAR_MAP: Record<string, string> = {
  'Tajawal': 'var(--font-tajawal)',
  'Cairo': 'var(--font-cairo)',
  'Almarai': 'var(--font-almarai)',
  'IBM Plex Sans Arabic': 'var(--font-ibm-plex-sans-arabic)',
  'Noto Sans Arabic': 'var(--font-noto-sans-arabic)',
  'Noto Kufi Arabic': 'var(--font-noto-kufi-arabic)',
  'Amiri': 'var(--font-amiri)',
  'Aref Ruqaa': 'var(--font-aref-ruqaa)',
  'Reem Kufi': 'var(--font-reem-kufi)',
  'El Messiri': 'var(--font-el-messiri)',
  'Lateef': 'var(--font-lateef)',
  'Scheherazade New': 'var(--font-scheherazade-new)',
  'Markazi Text': 'var(--font-markazi-text)',
  'Vazirmatn': 'var(--font-vazirmatn)',
  'Inter': 'var(--font-inter)',
  'Roboto': 'var(--font-roboto)',
  'Open Sans': 'var(--font-open-sans)',
  'Lato': 'var(--font-lato)',
  'Montserrat': 'var(--font-montserrat)',
  'Poppins': 'var(--font-poppins)',
  'Playfair Display': 'var(--font-playfair-display)',
  'Merriweather': 'var(--font-merriweather)',
  'Oswald': 'var(--font-oswald)',
  'Raleway': 'var(--font-raleway)',
  'Dancing Script': 'var(--font-dancing-script)',
  'Bebas Neue': 'var(--font-bebas-neue)',
  'tajawal': 'var(--font-tajawal)',
  'ibm-plex': 'var(--font-ibm-plex-sans-arabic)',
  'cairo': 'var(--font-cairo)',
  'almarai': 'var(--font-almarai)',
  'aref-ruqaa': 'var(--font-aref-ruqaa)',
};

export function resolveFontFamily(fontFamily: string): string {
  return FONT_CSS_VAR_MAP[fontFamily] || fontFamily;
}
