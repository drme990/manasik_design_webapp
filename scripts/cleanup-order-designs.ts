/**
 * Cleanup script — removes all order-generated designs and clears the
 * `designUrls` array on every order.
 *
 * What it does:
 * 1. Finds all projects with `kind: 'order_design'` in the `design_projects` collection
 *    (these are the design instances created when the admin generates a
 *    design for an order).
 * 2. Deletes their rendered JPGs from R2 (keys under `design/orders-design/`).
 * 3. Deletes the project documents from MongoDB.
 * 4. Clears the `designUrls` array on every order in the `orders` collection.
 *
 * Usage:
 *   npx tsx scripts/cleanup-order-designs.ts
 *
 * Options:
 *   --dry-run   Show what would be deleted without actually deleting anything
 *   --keep-r2   Skip R2 deletion (only clean MongoDB)
 *
 * Requires R2_* env vars to be set for image deletion. The MongoDB URI
 * is hardcoded below (edit if your DB is elsewhere).
 */

import { getMongoClient, closeMongoClient } from '@/lib/db/mongodb';
import { listR2KeysByPrefix, deleteMultipleFromR2 } from '@/lib/storage/r2';
import type { Project } from '@/types';
import type { Filter } from 'mongodb';

// ─── Config ────────────────────────────────────────────────────────────
// Hardcoded MongoDB URI — tsx doesn't load .env.local automatically.
// Edit this if your database is elsewhere.
const MONGODB_URI = 'mongodb://localhost:27017/manasik';

const ORDERS_COLLECTION = 'orders';
const PROJECTS_COLLECTION = 'design_projects';
const R2_ORDER_DESIGN_PREFIX = 'design/orders-design/';

/** Minimal order shape needed by this script. */
interface OrderDoc {
  _id: unknown;
  orderNumber?: string;
  designUrls?: unknown[];
}

// Parse CLI flags
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const KEEP_R2 = args.includes('--keep-r2');

async function main() {
  const client = getMongoClient(MONGODB_URI);
  await client.connect();

  const projects = client.getCollection<Project>(PROJECTS_COLLECTION);
  const orders = client.getCollection<OrderDoc>(ORDERS_COLLECTION);
  if (!projects || !orders) {
    console.error('Failed to get MongoDB collections');
    process.exit(1);
  }

  // ── Step 1: Find all order-design projects ────────────────────────
  console.log('\n1. Finding order-design projects...');
  const orderDesigns = await projects.find({ kind: 'order_design' } as Filter<Project>).toArray();
  console.log(`   Found ${orderDesigns.length} order-design project(s)`);

  if (orderDesigns.length > 0) {
    // List them
    for (const design of orderDesigns) {
      const orderNum = design.orderMeta?.orderNumber || 'unknown';
      console.log(`   - ${design._id} | order: ${orderNum} | url: ${design.orderDesignUrl || '(none)'}`);
    }
  }

  // ── Step 2: Delete R2 images ──────────────────────────────────────
  if (!KEEP_R2) {
    console.log('\n2. Deleting R2 images...');

    // Strategy A: Delete the specific orderDesignUrl from each project
    const specificKeys: string[] = [];
    for (const design of orderDesigns) {
      if (design.orderDesignUrl) {
        const key = extractKeyFromUrl(design.orderDesignUrl);
        if (key) specificKeys.push(key);
      }
    }

    // Strategy B: List + delete everything under design/orders-design/
    // This catches orphaned images too (e.g. from deleted projects).
    console.log(`   Listing R2 objects under "${R2_ORDER_DESIGN_PREFIX}"...`);
    const allKeys = await listR2KeysByPrefix(R2_ORDER_DESIGN_PREFIX);
    console.log(`   Found ${allKeys.length} R2 object(s) under the prefix`);

    // Combine + dedupe
    const keysToDelete = Array.from(new Set([...specificKeys, ...allKeys]));

    if (keysToDelete.length === 0) {
      console.log('   No R2 objects to delete');
    } else if (DRY_RUN) {
      console.log(`   [DRY RUN] Would delete ${keysToDelete.length} R2 object(s):`);
      for (const key of keysToDelete) {
        console.log(`     - ${key}`);
      }
    } else {
      console.log(`   Deleting ${keysToDelete.length} R2 object(s)...`);
      await deleteMultipleFromR2(keysToDelete);
      console.log('   R2 deletion complete');
    }
  } else {
    console.log('\n2. Skipping R2 deletion (--keep-r2)');
  }

  // ── Step 3: Delete order-design projects from MongoDB ─────────────
  console.log('\n3. Deleting order-design projects from MongoDB...');
  if (orderDesigns.length === 0) {
    console.log('   No order-design projects to delete');
  } else if (DRY_RUN) {
    console.log(`   [DRY RUN] Would delete ${orderDesigns.length} project document(s)`);
  } else {
    const ids = orderDesigns.map((d) => d._id);
    const result = await projects.deleteMany({ _id: { $in: ids } } as Filter<Project>);
    console.log(`   Deleted ${result.deletedCount} project document(s)`);
  }

  // ── Step 4: Clear designUrls on all orders ────────────────────────
  console.log('\n4. Clearing designUrls on all orders...');

  // Count how many orders have designUrls
  const ordersWithDesigns = await orders.countDocuments({
    designUrls: { $exists: true, $ne: [] },
  } as Filter<OrderDoc>);
  console.log(`   Found ${ordersWithDesigns} order(s) with non-empty designUrls`);

  if (ordersWithDesigns === 0) {
    console.log('   No orders to update');
  } else if (DRY_RUN) {
    console.log(`   [DRY RUN] Would clear designUrls on ${ordersWithDesigns} order(s)`);
  } else {
    const result = await orders.updateMany(
      { designUrls: { $exists: true, $ne: [] } } as Filter<OrderDoc>,
      { $set: { designUrls: [] } },
    );
    console.log(`   Cleared designUrls on ${result.modifiedCount} order(s)`);
  }

  // ── Summary ───────────────────────────────────────────────────────
  console.log('\n── Summary ────────────────────────────────────────────');
  console.log(`  Order-design projects found: ${orderDesigns.length}`);
  console.log(`  R2 images deleted:          ${KEEP_R2 ? 'skipped (--keep-r2)' : DRY_RUN ? `${DRY_RUN ? '(dry run) ' : ''}would delete` : 'done'}`);
  console.log(`  MongoDB projects deleted:   ${DRY_RUN ? '(dry run)' : orderDesigns.length}`);
  console.log(`  Orders updated:             ${DRY_RUN ? '(dry run)' : ordersWithDesigns}`);
  console.log(`  Mode:                       ${DRY_RUN ? 'DRY RUN (nothing was deleted)' : 'LIVE (changes applied)'}`);
  console.log('───────────────────────────────────────────────────────\n');

  await closeMongoClient();
}

/**
 * Extract the R2 key from a full public URL.
 * e.g. "https://storage.manasik.net/design/orders-design/GHD-001.jpg"
 *      → "design/orders-design/GHD-001.jpg"
 */
function extractKeyFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    // Remove leading slash from pathname
    return u.pathname.replace(/^\//, '') || null;
  } catch {
    return null;
  }
}

main().catch((error) => {
  console.error('Cleanup failed:', error);
  process.exit(1);
});
