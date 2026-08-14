/**
 * Create database indexes for all collections used by the design app.
 *
 * This fixes the "Sort exceeded memory limit of 33554432 bytes" error
 * that occurs when the `projects` collection grows large and MongoDB
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

  // ── projects collection ──────────────────────────────────────────
  // This is the largest collection and the one causing the sort error.
  // Indexes:
  //   - id (unique) — used by every findOne({ id }) lookup
  //   - userId + updatedAt — used by GET /api/projects (user's designs)
  //   - source + kind + updatedAt — used by GET /api/projects?source=order
  //   - kind + updatedAt — used by GET /api/projects?kind=booking_template
  console.log('\nCreating indexes on "projects" collection...');

  await db.collection('projects').createIndex({ id: 1 }, { unique: true, name: 'idx_id_unique' });
  console.log('  ✓ idx_id_unique (id, unique)');

  await db.collection('projects').createIndex(
    { userId: 1, updatedAt: -1 },
    { name: 'idx_userId_updatedAt' },
  );
  console.log('  ✓ idx_userId_updatedAt (userId, updatedAt)');

  await db.collection('projects').createIndex(
    { source: 1, kind: 1, updatedAt: -1 },
    { name: 'idx_source_kind_updatedAt' },
  );
  console.log('  ✓ idx_source_kind_updatedAt (source, kind, updatedAt)');

  await db.collection('projects').createIndex(
    { kind: 1, updatedAt: -1 },
    { name: 'idx_kind_updatedAt' },
  );
  console.log('  ✓ idx_kind_updatedAt (kind, updatedAt)');

  // ── booking_products collection ──────────────────────────────────
  // Indexes:
  //   - id (unique) — used by findOne({ id })
  //   - backendProductId + sizeIndex — used by generate-design route
  //   - updatedAt — used by GET /api/booking-products sort
  console.log('\nCreating indexes on "booking_products" collection...');

  await db.collection('booking_products').createIndex({ id: 1 }, { unique: true, name: 'idx_id_unique' });
  console.log('  ✓ idx_id_unique (id, unique)');

  await db.collection('booking_products').createIndex(
    { backendProductId: 1, sizeIndex: 1 },
    { name: 'idx_backendProductId_sizeIndex' },
  );
  console.log('  ✓ idx_backendProductId_sizeIndex (backendProductId, sizeIndex)');

  await db.collection('booking_products').createIndex(
    { updatedAt: -1 },
    { name: 'idx_updatedAt' },
  );
  console.log('  ✓ idx_updatedAt (updatedAt)');

  // ── pdf_projects collection ──────────────────────────────────────
  console.log('\nCreating indexes on "pdf_projects" collection...');

  await db.collection('pdf_projects').createIndex({ id: 1 }, { unique: true, name: 'idx_id_unique' });
  console.log('  ✓ idx_id_unique (id, unique)');

  await db.collection('pdf_projects').createIndex(
    { userId: 1, updatedAt: -1 },
    { name: 'idx_userId_updatedAt' },
  );
  console.log('  ✓ idx_userId_updatedAt (userId, updatedAt)');

  // ── fonts collection ─────────────────────────────────────────────
  console.log('\nCreating indexes on "fonts" collection...');

  await db.collection('fonts').createIndex({ id: 1 }, { unique: true, name: 'idx_id_unique' });
  console.log('  ✓ idx_id_unique (id, unique)');

  await db.collection('fonts').createIndex(
    { userId: 1 },
    { name: 'idx_userId' },
  );
  console.log('  ✓ idx_userId (userId)');

  // ── shapes collection ────────────────────────────────────────────
  console.log('\nCreating indexes on "shapes" collection...');

  await db.collection('shapes').createIndex({ id: 1 }, { unique: true, name: 'idx_id_unique' });
  console.log('  ✓ idx_id_unique (id, unique)');

  await db.collection('shapes').createIndex(
    { userId: 1 },
    { name: 'idx_userId' },
  );
  console.log('  ✓ idx_userId (userId)');

  // ── saved_colors collection ──────────────────────────────────────
  console.log('\nCreating indexes on "saved_colors" collection...');

  await db.collection('saved_colors').createIndex(
    { userId: 1 },
    { unique: true, name: 'idx_userId_unique' },
  );
  console.log('  ✓ idx_userId_unique (userId, unique)');

  console.log('\n✅ All indexes created successfully!\n');
  console.log('Note: This script is idempotent — safe to run again.');
  console.log('For new deployments, run this once after the first deploy.\n');

  await closeMongoClient();
}

main().catch((error) => {
  console.error('Index setup failed:', error);
  process.exit(1);
});
