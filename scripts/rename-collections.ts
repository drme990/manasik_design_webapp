/**
 * One-time migration script — renames and splits design app collections.
 *
 * What it does:
 * 1. Rename booking_products → design_booking_products
 * 2. Rename order_design_versions → design_order_versions
 * 3. Rename order_design_version_counters → design_order_version_counters
 * 4. Rename pdf_projects → design_pdf_projects
 * 5. Split projects → design_projects + design_booking_templates:
 *    a. Copy all docs with kind='booking_template' to design_booking_templates
 *    b. Copy all docs with kind='design' to design_projects
 *       - Update kind to 'order_design' where source='order'
 *    c. Drop the old projects collection (after verification)
 * 6. Fix indexes on design_user_fonts, design_user_shapes, design_saved_colors
 *    (setup-indexes.ts was referencing wrong names: fonts, shapes, saved_colors)
 *
 * Usage:
 *   npx tsx scripts/rename-collections.ts
 *
 * Options:
 *   --dry-run   Show what would be done without actually doing it
 *
 * Safe to run multiple times — checks if the new collection already exists
 * before renaming/splitting.
 *
 * Requires DATA_BASE_URL (or MONGODB_URI) env var. For local dev,
 * tsx doesn't load .env.local automatically — either set the env var
 * or edit the fallback URI below.
 */

import { getMongoClient, closeMongoClient } from '@/lib/db/mongodb';
import type { Db } from 'mongodb';

// Fallback for local dev (tsx doesn't load .env.local)
const MONGODB_URI = process.env.DATA_BASE_URL || process.env.MONGODB_URI || 'mongodb+srv://manasik-new:50TqqpcXYArAI7nO@manasik.aclzyuu.mongodb.net/manasik';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

async function collectionExists(db: Db, name: string): Promise<boolean> {
  const collections = await db.listCollections({ name }).toArray();
  return collections.length > 0;
}

async function countDocs(db: Db, name: string): Promise<number> {
  return db.collection(name).countDocuments();
}

async function renameCollection(db: Db, oldName: string, newName: string): Promise<void> {
  const oldExists = await collectionExists(db, oldName);
  const newExists = await collectionExists(db, newName);

  if (!oldExists && !newExists) {
    console.log(`  ⚠ Neither "${oldName}" nor "${newName}" exists — nothing to do`);
    return;
  }

  if (newExists) {
    console.log(`  ✓ "${newName}" already exists — skipping rename`);
    return;
  }

  if (!oldExists) {
    console.log(`  ⚠ "${oldName}" doesn't exist but "${newName}" does — already migrated`);
    return;
  }

  const count = await countDocs(db, oldName);
  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would rename "${oldName}" (${count} docs) → "${newName}"`);
    return;
  }

  console.log(`  Renaming "${oldName}" (${count} docs) → "${newName}"...`);
  await db.collection(oldName).rename(newName);
  console.log(`  ✓ Renamed successfully`);
}

async function splitProjectsCollection(db: Db): Promise<void> {
  const oldName = 'projects';
  const designsName = 'design_projects';
  const templatesName = 'design_booking_templates';

  const oldExists = await collectionExists(db, oldName);
  const designsExists = await collectionExists(db, designsName);
  const templatesExists = await collectionExists(db, templatesName);

  if (!oldExists && designsExists && templatesExists) {
    console.log(`  ✓ "${oldName}" already split into "${designsName}" + "${templatesName}" — nothing to do`);
    return;
  }

  if (!oldExists) {
    console.log(`  ⚠ "${oldName}" doesn't exist — already migrated or never created`);
    return;
  }

  const oldCount = await countDocs(db, oldName);
  const templateCount = await countDocs(db, oldName) > 0
    ? (await db.collection(oldName).countDocuments({ kind: 'booking_template' }))
    : 0;
  const designCount = oldCount - templateCount;

  console.log(`  Source: "${oldName}" (${oldCount} docs: ${templateCount} templates, ${designCount} designs)`);

  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would copy ${templateCount} templates → "${templatesName}"`);
    console.log(`  [DRY RUN] Would copy ${designCount} designs → "${designsName}" (updating kind='order_design' where source='order')`);
    console.log(`  [DRY RUN] Would drop "${oldName}" after verification`);
    return;
  }

  // Step 5a: Copy templates to design_booking_templates
  if (!templatesExists) {
    console.log(`  Copying templates → "${templatesName}"...`);
    const templates = await db.collection(oldName).find({ kind: 'booking_template' }).toArray();
    if (templates.length > 0) {
      await db.collection(templatesName).insertMany(templates);
    }
    const insertedTemplates = await countDocs(db, templatesName);
    console.log(`  ✓ Inserted ${insertedTemplates} templates`);
  } else {
    console.log(`  ✓ "${templatesName}" already exists — skipping template copy`);
  }

  // Step 5b: Copy designs to design_projects (update kind where source='order')
  if (!designsExists) {
    console.log(`  Copying designs → "${designsName}"...`);
    const designs = await db.collection(oldName).find({ kind: { $ne: 'booking_template' } }).toArray();
    // Update kind to 'order_design' where source='order'
    for (const doc of designs) {
      if (doc.source === 'order' && doc.kind === 'design') {
        doc.kind = 'order_design';
      }
    }
    if (designs.length > 0) {
      await db.collection(designsName).insertMany(designs);
    }
    const insertedDesigns = await countDocs(db, designsName);
    console.log(`  ✓ Inserted ${insertedDesigns} designs`);
  } else {
    console.log(`  ✓ "${designsName}" already exists — skipping design copy`);
  }

  // Step 5c: Verify counts match before dropping
  const newDesignsCount = await countDocs(db, designsName);
  const newTemplatesCount = await countDocs(db, templatesName);
  const totalNew = newDesignsCount + newTemplatesCount;

  if (totalNew !== oldCount) {
    console.error(`  ✗ Count mismatch! Old: ${oldCount}, New: ${totalNew} (${newDesignsCount} designs + ${newTemplatesCount} templates)`);
    console.error(`  NOT dropping "${oldName}" — please investigate manually`);
    return;
  }

  console.log(`  ✓ Counts match (${oldCount} = ${newDesignsCount} + ${newTemplatesCount})`);
  console.log(`  Dropping "${oldName}"...`);
  await db.collection(oldName).drop();
  console.log(`  ✓ Dropped "${oldName}"`);
}

async function main() {
  console.log('Connecting to MongoDB...');
  if (DRY_RUN) console.log('[DRY RUN mode — no changes will be made]\n');

  const client = getMongoClient(MONGODB_URI);
  await client.connect();

  const db = await client.getDb();
  if (!db) {
    console.error('Failed to get database');
    process.exit(1);
  }

  // ── Step 1: Rename booking_products → design_booking_products ──
  console.log('\n1. Renaming booking_products → design_booking_products...');
  await renameCollection(db, 'booking_products', 'design_booking_products');

  // ── Step 2: Rename order_design_versions → design_order_versions ──
  console.log('\n2. Renaming order_design_versions → design_order_versions...');
  await renameCollection(db, 'order_design_versions', 'design_order_versions');

  // ── Step 3: Rename order_design_version_counters → design_order_version_counters ──
  console.log('\n3. Renaming order_design_version_counters → design_order_version_counters...');
  await renameCollection(db, 'order_design_version_counters', 'design_order_version_counters');

  // ── Step 4: Rename pdf_projects → design_pdf_projects ──
  console.log('\n4. Renaming pdf_projects → design_pdf_projects...');
  await renameCollection(db, 'pdf_projects', 'design_pdf_projects');

  // ── Step 5: Split projects → design_projects + design_booking_templates ──
  console.log('\n5. Splitting projects → design_projects + design_booking_templates...');
  await splitProjectsCollection(db);

  // ── Step 6: Note about indexes ──
  console.log('\n6. Indexes:');
  console.log('  Note: Run `npx tsx scripts/setup-indexes.ts` to create indexes');
  console.log('  on the new collection names. This also fixes the bug where');
  console.log('  indexes were created on "fonts"/"shapes"/"saved_colors" instead');
  console.log('  of "design_user_fonts"/"design_user_shapes"/"design_saved_colors".');

  console.log('\n✅ Migration complete!\n');
  if (!DRY_RUN) {
    console.log('Next steps:');
    console.log('  1. Run `npx tsx scripts/setup-indexes.ts` to create indexes');
    console.log('  2. Deploy the updated code (collection names have changed)');
    console.log('  3. Verify the app works correctly');
    console.log();
  }

  await closeMongoClient();
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
