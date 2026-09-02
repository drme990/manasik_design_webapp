/**
 * Cleanup script — removes orphaned background image files from R2.
 *
 * An "orphaned" BG file is one that exists in R2 under
 * `design/template-bg/{projectId}/...` but is NOT referenced by any
 * project (template or order design) in MongoDB via `backgroundUri`
 * or `backgroundThumbnailUri`.
 *
 * Orphans accumulate when:
 *   - A user uploads a new BG (replacing the old one) — the old file
 *     stays in R2 because the editor doesn't delete it on replace.
 *   - A user removes the BG via the "remove" button — the file stays
 *     in R2 because the editor only sets `backgroundUri: undefined`.
 *   - A template is soft-deleted — R2 assets are preserved for
 *     recovery, but after recovery is no longer needed, they're orphans.
 *
 * Usage:
 *   npx tsx scripts/cleanup-orphaned-bg.ts
 *
 * Options:
 *   --dry-run   Show what would be deleted without actually deleting anything
 *
 * Requires R2_* env vars to be set for R2 access. The MongoDB URI
 * is hardcoded below (edit if your DB is elsewhere).
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import type { Project } from '@/types';
import type { Filter, Collection } from 'mongodb';
import type { MongoDBClient } from '@/lib/db/mongodb';

// ─── Late-bound imports (populated by main() after .env.local is loaded) ─
// r2.ts reads process.env at module load time, so we MUST load .env.local
// before importing it. See check-bg-integrity.ts for full explanation.
let listR2KeysByPrefixFn!: (prefix: string) => Promise<string[]>;
let deleteMultipleFromR2Fn!: (keys: string[]) => Promise<void>;
let getProjectCollectionFn!: (name: string) => Promise<Collection<Project>>;
let getMongoClientFn!: (uri?: string) => MongoDBClient;
let closeMongoClientFn!: () => Promise<void>;
let BOOKING_TEMPLATES_COLLECTION_NAME!: string;
let DESIGN_PROJECTS_COLLECTION_NAME!: string;

// ─── Load .env.local (tsx doesn't load it automatically) ───────────────
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
    console.error('\n   These are needed to list/delete BG files in R2.');
    console.error('   The script loads .env.local automatically — make sure');
    console.error('   these vars are defined there.\n');
    process.exit(1);
  }
}

// ─── Config ────────────────────────────────────────────────────────────
const MONGODB_URI = 'mongodb://localhost:27017/manasik';

const R2_BG_PREFIX = 'design/template-bg/';

// Parse CLI flags
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

/** Format a number with thousands separators. */
function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

/** Extract the R2 key from a full public URL. */
function extractKeyFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  if (!url.startsWith('http')) return null;
  try {
    const u = new URL(url);
    return u.pathname.replace(/^\//, '') || null;
  } catch {
    return null;
  }
}

async function main() {
  // Load .env.local FIRST, before any module that reads process.env
  loadEnvLocal();
  preflightR2Check();

  // Dynamic imports — r2.ts reads process.env at load time
  const r2Mod = await import('@/lib/storage/r2');
  listR2KeysByPrefixFn = r2Mod.listR2KeysByPrefix;
  deleteMultipleFromR2Fn = r2Mod.deleteMultipleFromR2;
  const mongoMod = await import('@/lib/db/mongodb');
  getMongoClientFn = mongoMod.getMongoClient;
  closeMongoClientFn = mongoMod.closeMongoClient;
  const collectionsMod = await import('@/lib/db/project-collections');
  getProjectCollectionFn = collectionsMod.getProjectCollection;
  BOOKING_TEMPLATES_COLLECTION_NAME = collectionsMod.BOOKING_TEMPLATES_COLLECTION;
  DESIGN_PROJECTS_COLLECTION_NAME = collectionsMod.DESIGN_PROJECTS_COLLECTION;

  const client = getMongoClientFn(MONGODB_URI);
  await client.connect();

  console.log(`\nCleanup orphaned BG files — ${DRY_RUN ? '[DRY RUN] ' : ''}LIVE mode`);
  console.log('='.repeat(60));

  // ── Step 1: List all BG files in R2 ──────────────────────────────
  console.log('\n1. Listing R2 objects under "design/template-bg/"...');
  const allR2Keys = await listR2KeysByPrefixFn(R2_BG_PREFIX);
  console.log(`   Found ${fmt(allR2Keys.length)} R2 object(s) under the prefix`);

  if (allR2Keys.length === 0) {
    console.log('   No BG files to check. Done.');
    await closeMongoClientFn();
    return;
  }

  // ── Step 2: Collect all referenced BG keys from MongoDB ──────────
  // Check both collections: templates and design projects (which may
  // have their own per-design BG copies after Fix 4).
  console.log('\n2. Collecting referenced BG keys from MongoDB...');

  const referencedKeys = new Set<string>();

  // Templates — use cursor for progress
  const templatesCol = await getProjectCollectionFn(BOOKING_TEMPLATES_COLLECTION_NAME);
  const templateCount = await templatesCol.countDocuments({} as Filter<Project>);
  console.log(`   Scanning ${fmt(templateCount)} template(s)...`);
  let tplScanned = 0;
  for await (const tpl of templatesCol.find({} as Filter<Project>)) {
    tplScanned++;
    if (tplScanned % 1000 === 0) {
      process.stdout.write(`\r   Templates: scanned ${fmt(tplScanned)} / ${fmt(templateCount)}...`);
    }
    // Include soft-deleted templates — their BGs are still referenced
    // (the document exists, just hidden). They'll be cleaned up when
    // the template is hard-deleted.
    const bgKey = extractKeyFromUrl(tpl.backgroundUri);
    if (bgKey) referencedKeys.add(bgKey);
    const thumbKey = extractKeyFromUrl(tpl.backgroundThumbnailUri);
    if (thumbKey) referencedKeys.add(thumbKey);
  }
  if (tplScanned >= 1000) process.stdout.write('\r' + ' '.repeat(80) + '\r');
  console.log(`   ✓ Scanned ${fmt(tplScanned)} template(s)`);

  // Design projects (includes order designs with per-design BG copies)
  // This collection can be very large — use a cursor and show progress
  const projectsCol = await getProjectCollectionFn(DESIGN_PROJECTS_COLLECTION_NAME);
  const projectCount = await projectsCol.countDocuments({} as Filter<Project>);
  console.log(`   Scanning ${fmt(projectCount)} project(s) (designs + order designs)...`);
  let projScanned = 0;
  for await (const proj of projectsCol.find({} as Filter<Project>)) {
    projScanned++;
    if (projScanned % 5000 === 0) {
      process.stdout.write(`\r   Projects: scanned ${fmt(projScanned)} / ${fmt(projectCount)}...`);
    }
    const bgKey = extractKeyFromUrl(proj.backgroundUri);
    if (bgKey) referencedKeys.add(bgKey);
    const thumbKey = extractKeyFromUrl(proj.backgroundThumbnailUri);
    if (thumbKey) referencedKeys.add(thumbKey);
  }
  if (projScanned >= 5000) process.stdout.write('\r' + ' '.repeat(80) + '\r');
  console.log(`   ✓ Scanned ${fmt(projScanned)} project(s)`);

  console.log(`   Found ${fmt(referencedKeys.size)} unique referenced BG key(s)`);

  // ── Step 3: Find orphans (in R2 but not referenced) ──────────────
  console.log('\n3. Identifying orphaned files...');
  const orphanedKeys = allR2Keys.filter((key) => !referencedKeys.has(key));
  console.log(`   Found ${fmt(orphanedKeys.length)} orphaned BG file(s)`);

  if (orphanedKeys.length > 0 && orphanedKeys.length <= 50) {
    for (const key of orphanedKeys) {
      console.log(`     - ${key}`);
    }
  } else if (orphanedKeys.length > 50) {
    // Only show first 10 + count for large sets
    for (let i = 0; i < 10; i++) {
      console.log(`     - ${orphanedKeys[i]}`);
    }
    console.log(`     ... and ${fmt(orphanedKeys.length - 10)} more (use --dry-run to see all)`);
  }

  // ── Step 4: Delete orphans ───────────────────────────────────────
  if (orphanedKeys.length === 0) {
    console.log('\n4. No orphans to delete. Done.');
  } else if (DRY_RUN) {
    console.log(`\n4. [DRY RUN] Would delete ${fmt(orphanedKeys.length)} orphaned BG file(s)`);
  } else {
    console.log(`\n4. Deleting ${fmt(orphanedKeys.length)} orphaned BG file(s)...`);
    await deleteMultipleFromR2Fn(orphanedKeys);
    console.log('   Deletion complete');
  }

  // ── Summary ──────────────────────────────────────────────────────
  console.log('\n── Summary ────────────────────────────────────────────');
  console.log(`  R2 BG files found:        ${fmt(allR2Keys.length)}`);
  console.log(`  Referenced BG keys:       ${fmt(referencedKeys.size)}`);
  console.log(`  Orphaned files:           ${fmt(orphanedKeys.length)}`);
  console.log(`  Orphans deleted:          ${DRY_RUN ? '(dry run)' : fmt(orphanedKeys.length)}`);
  console.log(`  Mode:                     ${DRY_RUN ? 'DRY RUN (nothing was deleted)' : 'LIVE (changes applied)'}`);
  console.log('='.repeat(60) + '\n');

  await closeMongoClientFn();
}

main().catch((error) => {
  console.error('Cleanup failed:', error);
  process.exit(1);
});
