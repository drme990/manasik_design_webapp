/**
 * Download Tajawal and IBM Plex Sans Arabic .ttf files from Google Fonts
 * into public/fonts/google/ so the server-side canvas renderer can use them.
 *
 * Run: node scripts/download-google-fonts.mjs
 *
 * These fonts are used in the editor via next/font/google (client-side),
 * but the @napi-rs/canvas renderer needs the actual .ttf files on disk.
 * Without them, text using these families falls back to Expo Arabic.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FONT_DIR = path.join(__dirname, '..', 'public', 'fonts', 'google');

// Google Fonts CSS2 API — fetch each weight separately because the
// old User-Agent (needed to get .ttf instead of .woff2) only returns
// one @font-face rule per request.
const FONT_REQUESTS = [
  { family: 'Tajawal', weight: 400, filename: 'Tajawal-Regular.ttf' },
  { family: 'Tajawal', weight: 500, filename: 'Tajawal-Medium.ttf' },
  { family: 'Tajawal', weight: 700, filename: 'Tajawal-Bold.ttf' },
  { family: 'Tajawal', weight: 800, filename: 'Tajawal-ExtraBold.ttf' },
  { family: 'IBM Plex Sans Arabic', weight: 400, filename: 'IBMPlexSansArabic-Regular.ttf' },
  { family: 'IBM Plex Sans Arabic', weight: 500, filename: 'IBMPlexSansArabic-Medium.ttf' },
  { family: 'IBM Plex Sans Arabic', weight: 700, filename: 'IBMPlexSansArabic-Bold.ttf' },
];

async function fetchCss(url) {
  const res = await fetch(url, {
    headers: {
      // Use an older UA to get .ttf instead of .woff2
      'User-Agent': 'Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1)',
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch CSS: ${res.status} ${url}`);
  return res.text();
}

function parseFontFaceUrl(css) {
  // Extract the first src: url(...) from the CSS
  const srcMatch = css.match(/src:\s*url\(([^)]+)\)/);
  return srcMatch ? srcMatch[1].trim() : null;
}

async function downloadFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download: ${res.status} ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
  return buffer.length;
}

async function main() {
  // Create directory
  fs.mkdirSync(FONT_DIR, { recursive: true });
  console.log(`Font directory: ${FONT_DIR}`);

  let downloaded = 0;
  let skipped = 0;

  for (const req of FONT_REQUESTS) {
    const destPath = path.join(FONT_DIR, req.filename);
    if (fs.existsSync(destPath)) {
      console.log(`  Already exists: ${req.filename}`);
      skipped++;
      continue;
    }

    // Build CSS URL for this specific family+weight
    const familyParam = req.family.replace(/ /g, '+');
    const cssUrl = `https://fonts.googleapis.com/css2?family=${familyParam}:wght@${req.weight}`;

    console.log(`\nFetching: ${req.family} weight ${req.weight} → ${req.filename}`);
    const css = await fetchCss(cssUrl);
    const fontUrl = parseFontFaceUrl(css);
    if (!fontUrl) {
      console.log(`  Could not find font URL in CSS response`);
      continue;
    }

    console.log(`  Downloading from: ${fontUrl}`);
    const size = await downloadFile(fontUrl, destPath);
    console.log(`  Saved: ${req.filename} (${(size / 1024).toFixed(0)} KB)`);
    downloaded++;
  }

  console.log(`\nDone! Downloaded: ${downloaded}, Skipped: ${skipped}`);
  console.log(`Files in ${FONT_DIR}:`);
  for (const f of fs.readdirSync(FONT_DIR)) {
    const stat = fs.statSync(path.join(FONT_DIR, f));
    console.log(`  ${f} (${(stat.size / 1024).toFixed(0)} KB)`);
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
