/**
 * Create database indexes for all collections used by the design app.
 *
 * This fixes the "Sort exceeded memory limit of 33554432 bytes" error
 * that occurs when the `design_projects` collection grows large and MongoDB
 * can't sort in memory without an index on the sort field.
 *
 * Usage:
 *   npx tsx scripts/setup-indexes.ts
 *
 * Safe to run multiple times — MongoDB's createIndex is idempotent.
 * If an index already exists, it's a no-op.
 *
 * Requires DATA_BASE_URL (or MONGODB_URI) env var. For local dev,
 * tsx doesn't load .env.local automatically — either set the env var
 * or edit the fallback URI below.
 */

import { getMongoClient, closeMongoClient } from '@/lib/db/mongodb';

// Fallback for local dev (tsx doesn't load .env.local)
const MONGODB_URI = process.env.DATA_BASE_URL || process.env.MONGODB_URI || 'mongodb+srv://manasik-new:50TqqpcXYArAI7nO@manasik.aclzyuu.mongodb.net/manasik';

async function main() {
  console.log('Connecting to MongoDB...');
  const client = getMongoClient(MONGODB_URI);
  await client.connect();

  const db = await client.getDb();
  if (!db) {
    console.error('Failed to get database');
    process.exit(1);
  }

  // ── design_projects collection ───────────────────────────────────
  // User designs (kind='design') + order-generated designs (kind='order_design').
  // Indexes:
  //   - id (unique) — used by every findOne({ id }) lookup
  //   - userId + updatedAt — used by GET /api/projects (user's designs)
  //   - kind + updatedAt — used by GET /api/projects?source=order and ?kind=design
  console.log('\nCreating indexes on "design_projects" collection...');

  await db.collection('design_projects').createIndex({ id: 1 }, { unique: true, name: 'idx_id_unique' });
  console.log('  ✓ idx_id_unique (id, unique)');

  await db.collection('design_projects').createIndex(
    { userId: 1, updatedAt: -1 },
    { name: 'idx_userId_updatedAt' },
  );
  console.log('  ✓ idx_userId_updatedAt (userId, updatedAt)');

  await db.collection('design_projects').createIndex(
    { kind: 1, updatedAt: -1 },
    { name: 'idx_kind_updatedAt' },
  );
  console.log('  ✓ idx_kind_updatedAt (kind, updatedAt)');

  // Index for name search (regex queries can't use indexes efficiently,
  // but this helps with case-insensitive prefix matches)
  await db.collection('design_projects').createIndex(
    { name: 1 },
    { name: 'idx_name' },
  );
  console.log('  ✓ idx_name (name)');

  // ── design_booking_templates collection ──────────────────────────
  // Booking templates (kind='booking_template').
  console.log('\nCreating indexes on "design_booking_templates" collection...');

  await db.collection('design_booking_templates').createIndex({ id: 1 }, { unique: true, name: 'idx_id_unique' });
  console.log('  ✓ idx_id_unique (id, unique)');

  await db.collection('design_booking_templates').createIndex(
    { kind: 1, updatedAt: -1 },
    { name: 'idx_kind_updatedAt' },
  );
  console.log('  ✓ idx_kind_updatedAt (kind, updatedAt)');

  await db.collection('design_booking_templates').createIndex(
    { userId: 1, updatedAt: -1 },
    { name: 'idx_userId_updatedAt' },
  );
  console.log('  ✓ idx_userId_updatedAt (userId, updatedAt)');

  // ── design_booking_products collection ───────────────────────────
  // Indexes:
  //   - id (unique) — used by findOne({ id })
  //   - backendProductId + sizeIndex — used by generate-design route
  //   - updatedAt — used by GET /api/booking-products sort
  console.log('\nCreating indexes on "design_booking_products" collection...');

  await db.collection('design_booking_products').createIndex({ id: 1 }, { unique: true, name: 'idx_id_unique' });
  console.log('  ✓ idx_id_unique (id, unique)');

  await db.collection('design_booking_products').createIndex(
    { backendProductId: 1, sizeIndex: 1 },
    { name: 'idx_backendProductId_sizeIndex' },
  );
  console.log('  ✓ idx_backendProductId_sizeIndex (backendProductId, sizeIndex)');

  await db.collection('design_booking_products').createIndex(
    { updatedAt: -1 },
    { name: 'idx_updatedAt' },
  );
  console.log('  ✓ idx_updatedAt (updatedAt)');

  // ── design_pdf_projects collection ───────────────────────────────
  console.log('\nCreating indexes on "design_pdf_projects" collection...');

  await db.collection('design_pdf_projects').createIndex({ id: 1 }, { unique: true, name: 'idx_id_unique' });
  console.log('  ✓ idx_id_unique (id, unique)');

  await db.collection('design_pdf_projects').createIndex(
    { userId: 1, updatedAt: -1 },
    { name: 'idx_userId_updatedAt' },
  );
  console.log('  ✓ idx_userId_updatedAt (userId, updatedAt)');

  // ── design_user_fonts collection ─────────────────────────────────
  // BUG FIX: setup-indexes.ts was referencing 'fonts' instead of
  // 'design_user_fonts'. Indexes were being created on the wrong
  // collection. This is now fixed.
  console.log('\nCreating indexes on "design_user_fonts" collection...');

  await db.collection('design_user_fonts').createIndex({ id: 1 }, { unique: true, name: 'idx_id_unique' });
  console.log('  ✓ idx_id_unique (id, unique)');

  await db.collection('design_user_fonts').createIndex(
    { userId: 1 },
    { name: 'idx_userId' },
  );
  console.log('  ✓ idx_userId (userId)');

  // ── design_user_shapes collection ────────────────────────────────
  // BUG FIX: was 'shapes', now 'design_user_shapes'.
  console.log('\nCreating indexes on "design_user_shapes" collection...');

  await db.collection('design_user_shapes').createIndex({ id: 1 }, { unique: true, name: 'idx_id_unique' });
  console.log('  ✓ idx_id_unique (id, unique)');

  await db.collection('design_user_shapes').createIndex(
    { userId: 1 },
    { name: 'idx_userId' },
  );
  console.log('  ✓ idx_userId (userId)');

  // ── design_saved_colors collection ───────────────────────────────
  // BUG FIX: was 'saved_colors', now 'design_saved_colors'.
  console.log('\nCreating indexes on "design_saved_colors" collection...');

  await db.collection('design_saved_colors').createIndex(
    { userId: 1 },
    { unique: true, name: 'idx_userId_unique' },
  );
  console.log('  ✓ idx_userId_unique (userId, unique)');

  console.log('\n✅ All indexes created successfully!\n');
  console.log('Note: This script is idempotent — safe to run again.');
  console.log('For new deployments, run this once after the first deploy.');
  console.log('After renaming collections, run the migration script first,');
  console.log('then run this script to create indexes on the new collections.\n');

  await closeMongoClient();
}

main().catch((error) => {
  console.error('Index setup failed:', error);
  process.exit(1);
});
