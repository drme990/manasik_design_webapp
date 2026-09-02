/**
 * Integrity check script — finds templates and order designs whose
 * `backgroundUri` points to an R2 file that no longer exists.
 *
 * This is the diagnostic tool for the "template BG disappears" bug.
 * After deploying the fixes (ownership check, BG copy on duplicate,
 * per-design BG copies), run this script to identify any templates
 * or order designs that were already affected — their `backgroundUri`
 * points to a deleted R2 file.
 *
 * For each affected project, the script reports:
 *   - Project ID, name, kind
 *   - The broken backgroundUri URL
 *   - Whether the R2 file exists (HEAD check)
 *
 * Usage:
 *   npx tsx scripts/check-bg-integrity.ts
 *
 * Options:
 *   --repair   For templates with missing BGs, clear the backgroundUri
 *              field so the template opens cleanly in the editor without
 *              a broken image. The user can then re-upload a BG.
 *              Without this flag, the script only reports (read-only).
 *   --kind=templates       Check only templates (DEFAULT — fast)
 *   --kind=designs         Check only design projects (user + order designs)
 *   --kind=all             Check both templates and design projects
 *                         (design_projects can be huge — slow)
 *
 * Requires R2_* env vars to be set for R2 access. The script loads
 * `.env.local` automatically if it exists. The MongoDB URI is
 * hardcoded below (edit if your DB is elsewhere).
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import type { Project } from '@/types';
import type { Filter } from 'mongodb';

// ─── Load .env.local (tsx doesn't load it automatically) ───────────────
// IMPORTANT: This MUST run before any import of '@/lib/storage/r2' or
// '@/lib/db/mongodb', because those modules read process.env at module
// load time and cache the values in module-level constants. If we load
// them first, the env vars will be empty and every R2 HEAD check will
// silently fail (the catch block returns false → everything looks "broken").
//
// We use dynamic imports below (inside main()) to ensure the env is
// loaded first.
function loadEnvLocal(): void {
  const candidates = [
    resolve(__dirname, '..', '.env.local'),
    resolve(__dirname, '..', '..', '.env.local'),
    resolve(process.cwd(), '.env.local'),
  ];
  for (const envPath of candidates) {
    if (!existsSync(envPath)) continue;
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
    console.log(`  Loaded env from: ${envPath}`);
    return;
  }
  console.warn('  ⚠ No .env.local found — R2 env vars may be missing.');
}

// ─── Preflight check: verify R2 env vars are set ───────────────────────
function preflightR2Check(): void {
  const required = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME'];
  const missing = required.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    console.error('\n❌ Missing required R2 environment variables:');
    for (const v of missing) {
      console.error(`     - ${v}`);
    }
    console.error('\n   These are needed to check if BG files exist in R2.');
    console.error('   The script loads .env.local automatically — make sure');
    console.error('   these vars are defined there, or set them in your shell:\n');
    console.error('   PowerShell:  $env:R2_ACCOUNT_ID="..."; npx tsx scripts/check-bg-integrity.ts');
    console.error('   CMD:         set R2_ACCOUNT_ID=... && npx tsx scripts/check-bg-integrity.ts\n');
    process.exit(1);
  }
}

// ─── Config ────────────────────────────────────────────────────────────
const MONGODB_URI = 'mongodb://localhost:27017/manasik';

const args = process.argv.slice(2);
const REPAIR = args.includes('--repair');
// Default to 'templates' only — the design_projects collection can be
// huge (thousands of order designs) and slow to scan. Use --kind=all
// or --kind=designs to include them.
const KIND_FILTER = (() => {
  const arg = args.find((a) => a.startsWith('--kind='));
  return arg ? arg.slice(6) : 'templates'; // 'templates' | 'designs' | 'all'
})();

// How many R2 HEAD checks to run in parallel. Too high may trigger
// rate limiting on R2/S3; 10 is a safe balance.
const CONCURRENCY = 10;

/** Extract the R2 key from a full public URL. */
function extractKey(url: string | undefined): string | null {
  if (!url) return null;
  if (!url.startsWith('http')) return null;
  try {
    const u = new URL(url);
    return u.pathname.replace(/^\//, '') || null;
  } catch {
    return null;
  }
}

interface BrokenProject {
  id: string;
  name: string;
  kind: string;
  backgroundUri: string;
  r2Key: string;
  collectionName: string;
}

interface CheckCandidate {
  id: string;
  name: string;
  kind: string;
  backgroundUri: string;
  r2Key: string;
  collectionName: string;
}

/** Format a number with thousands separators. */
function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

/**
 * Run async operations over an array with a concurrency limit.
 * Calls `fn` for each item, at most `limit` at a time, with an
 * optional progress callback that fires after each item completes.
 */
async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  let nextIndex = 0;
  let completed = 0;
  const total = items.length;

  async function worker() {
    while (true) {
      const myIndex = nextIndex++;
      if (myIndex >= total) return;
      await fn(items[myIndex]);
      completed++;
      onProgress?.(completed, total);
    }
  }

  const workers = Array.from({ length: Math.min(limit, total) }, () => worker());
  await Promise.all(workers);
}

// ─── Late-bound imports (populated by main() after .env.local is loaded) ─
// These modules read process.env at import time, so we MUST load .env.local
// before importing them. We store them here after dynamic import in main().
let r2ObjectExistsFn!: (key: string) => Promise<boolean>;
let getProjectCollectionFn!: (name: string) => Promise<Collection<Project>>;
let getMongoClientFn!: (uri?: string) => MongoDBClient;
let closeMongoClientFn!: () => Promise<void>;
let BOOKING_TEMPLATES_COLLECTION_NAME!: string;
let DESIGN_PROJECTS_COLLECTION_NAME!: string;

// Type-only imports used for annotations
import type { Collection } from 'mongodb';
import type { MongoDBClient } from '@/lib/db/mongodb';

async function checkCollection(
  collectionName: string,
  kindLabel: string,
): Promise<BrokenProject[]> {
  const collection = await getProjectCollectionFn(collectionName);

  // First, just count total docs so we can show progress from the start
  const totalCount = await collection.countDocuments({} as Filter<Project>);
  console.log(`  ${kindLabel}: ${fmt(totalCount)} total document(s) in collection`);

  if (totalCount === 0) {
    console.log(`  ${kindLabel}: nothing to check`);
    return [];
  }

  // Fetch all docs (use a cursor to avoid loading everything into memory
  // at once for very large collections)
  const cursor = collection.find({} as Filter<Project>);
  const candidates: CheckCandidate[] = [];
  let scanned = 0;
  let withBg = 0;

  console.log(`  ${kindLabel}: scanning documents for backgroundUri...`);

  for await (const proj of cursor) {
    scanned++;
    if (scanned % 5000 === 0) {
      process.stdout.write(`\r  ${kindLabel}: scanned ${fmt(scanned)} / ${fmt(totalCount)}...`);
    }
    const bgUrl = proj.backgroundUri;
    if (!bgUrl) continue;
    if (!bgUrl.startsWith('http')) continue; // skip data:, blob:
    withBg++;
    const key = extractKey(bgUrl);
    if (!key) continue;
    candidates.push({
      id: proj.id,
      name: proj.name,
      kind: proj.kind,
      backgroundUri: bgUrl,
      r2Key: key,
      collectionName,
    });
  }
  if (scanned >= 5000) process.stdout.write('\r' + ' '.repeat(80) + '\r');

  console.log(`  ${kindLabel}: scanned ${fmt(scanned)} document(s), ${fmt(withBg)} have R2 BG URLs`);

  if (candidates.length === 0) {
    console.log(`  ${kindLabel}: no BG URLs to check — done`);
    return [];
  }

  // Now check each candidate's R2 object existence with concurrency
  console.log(`  ${kindLabel}: checking ${fmt(candidates.length)} R2 object(s) with concurrency=${CONCURRENCY}...`);

  const broken: BrokenProject[] = [];
  let lastProgressTime = Date.now();

  await runWithConcurrency(
    candidates,
    CONCURRENCY,
    async (cand) => {
      const exists = await r2ObjectExistsFn(cand.r2Key);
      if (!exists) {
        broken.push({
          id: cand.id,
          name: cand.name,
          kind: cand.kind,
          backgroundUri: cand.backgroundUri,
          r2Key: cand.r2Key,
          collectionName: cand.collectionName,
        });
      }
    },
    (done, total) => {
      // Update progress at most every 200ms to avoid flickering
      const now = Date.now();
      if (now - lastProgressTime > 200 || done === total) {
        lastProgressTime = now;
        const pct = Math.round((done / total) * 100);
        process.stdout.write(`\r  ${kindLabel}: ${fmt(done)}/${fmt(total)} checked (${pct}%) — ${broken.length} broken so far`);
      }
    },
  );

  // Clear the progress line
  process.stdout.write('\r' + ' '.repeat(100) + '\r');
  console.log(`  ${kindLabel}: ✓ checked ${fmt(candidates.length)} R2 object(s), ${broken.length} broken`);
  return broken;
}

async function main() {
  // Load .env.local FIRST, before any module that reads process.env
  loadEnvLocal();
  preflightR2Check();

  // Dynamic imports — these modules read process.env at load time,
  // so they MUST be imported after .env.local is loaded.
  const r2Mod = await import('@/lib/storage/r2');
  r2ObjectExistsFn = r2Mod.r2ObjectExists;
  const mongoMod = await import('@/lib/db/mongodb');
  getMongoClientFn = mongoMod.getMongoClient;
  closeMongoClientFn = mongoMod.closeMongoClient;
  const collectionsMod = await import('@/lib/db/project-collections');
  getProjectCollectionFn = collectionsMod.getProjectCollection;
  BOOKING_TEMPLATES_COLLECTION_NAME = collectionsMod.BOOKING_TEMPLATES_COLLECTION;
  DESIGN_PROJECTS_COLLECTION_NAME = collectionsMod.DESIGN_PROJECTS_COLLECTION;

  const client = getMongoClientFn(MONGODB_URI);
  await client.connect();

  console.log(`\nBG Integrity Check — ${REPAIR ? '[REPAIR MODE]' : '[READ-ONLY]'}`);
  console.log('='.repeat(60));
  console.log(`Scope: --kind=${KIND_FILTER}`);
  console.log(`Concurrency: ${CONCURRENCY} parallel R2 HEAD checks`);
  console.log('\nChecking all projects with backgroundUri pointing to R2...');

  const checkTemplates = KIND_FILTER === 'templates' || KIND_FILTER === 'all';
  const checkDesigns = KIND_FILTER === 'designs' || KIND_FILTER === 'all';

  let brokenTemplates: BrokenProject[] = [];
  let brokenProjects: BrokenProject[] = [];

  // Check templates
  if (checkTemplates) {
    console.log('\n── Templates ──');
    brokenTemplates = await checkCollection(BOOKING_TEMPLATES_COLLECTION_NAME, 'Templates');
  } else {
    console.log('\n── Templates ── (skipped via --kind=designs)');
  }

  // Check design projects (includes order designs)
  if (checkDesigns) {
    console.log('\n── Design Projects (user + order designs) ──');
    brokenProjects = await checkCollection(DESIGN_PROJECTS_COLLECTION_NAME, 'Design Projects');
  } else {
    console.log('\n── Design Projects ── (skipped via --kind=templates)');
  }

  const allBroken = [...brokenTemplates, ...brokenProjects];

  // ── Report ───────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  if (allBroken.length === 0) {
    console.log('✓ All background images are intact. No issues found.');
  } else {
    console.log(`✗ Found ${allBroken.length} project(s) with missing BG files:\n`);
    for (const bp of allBroken) {
      console.log(`  [${bp.kind}] ${bp.name} (id: ${bp.id})`);
      console.log(`    Broken URL: ${bp.backgroundUri}`);
      console.log(`    R2 key:     ${bp.r2Key}`);
      console.log(`    Collection: ${bp.collectionName}`);
      console.log('');
    }

    // ── Repair mode: clear broken backgroundUri ────────────────────
    if (REPAIR && allBroken.length > 0) {
      console.log('─'.repeat(60));
      console.log(`Repairing ${allBroken.length} project(s) — clearing broken backgroundUri...`);

      for (const bp of allBroken) {
        const collection = await getProjectCollectionFn(bp.collectionName);
        await collection.updateOne(
          { id: bp.id } as Filter<Project>,
          {
            $set: {
              backgroundUri: undefined,
              backgroundThumbnailUri: undefined,
              updatedAt: Date.now(),
            },
          },
        );
        console.log(`  ✓ Cleared BG for: ${bp.name} (${bp.id})`);
      }
      console.log('\nRepair complete. The affected projects can now be opened');
      console.log('in the editor without a broken image. Re-upload BGs as needed.');
    } else if (!REPAIR && allBroken.length > 0) {
      console.log('─'.repeat(60));
      console.log('To repair (clear broken backgroundUri fields), re-run with --repair:');
      console.log('  npx tsx scripts/check-bg-integrity.ts --repair');
    }
  }

  console.log('\n' + '='.repeat(60) + '\n');
  await closeMongoClientFn();
}

main().catch((error) => {
  console.error('Integrity check failed:', error);
  process.exit(1);
});
