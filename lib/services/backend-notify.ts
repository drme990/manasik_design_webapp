/**
 * Order design URL updater.
 *
 * The design app calls this after creating a new saved version of an
 * order's design (e.g. after the admin edits + saves in the editor).
 * It updates the order's `designUrls[].url` and `currentVersion` to
 * point to the new immutable archived URL — directly in the shared
 * MongoDB.
 *
 * Both the design app and the backend share the same MongoDB instance
 * (via `DATA_BASE_URL`). The design app uses the raw `mongodb` driver,
 * the backend uses Mongoose — both target the same database. So the
 * design app can update the `orders` collection directly without making
 * an HTTP call to the backend.
 *
 * This eliminates the failure modes of the previous HTTP-based approach:
 *   - No `BACKEND_URL` env var needed on the design app
 *   - No `CALLBACK_SECRET` needed for this flow
 *   - No network round-trip (faster, no DNS/TLS/timeout failures)
 *
 * All calls are best-effort: errors are logged but not thrown. The
 * caller's primary operation (render, save, etc.) should not fail just
 * because the order URL update failed. The backend's `sync-designs`
 * endpoint is a safety net that will catch up on the next window focus.
 */

import { getMongoClient } from '@/lib/db/mongodb';
import type { Document, Filter, UpdateFilter } from 'mongodb';

interface UpdateDesignUrlParams {
  orderNumber: string;
  productId: string;
  itemIndex?: number;
  /** The new immutable archived URL for the version */
  url: string;
  /** The new version number */
  version: number;
}

/**
 * Minimal shape of the `orders` collection documents we need to query
 * and update. We only touch `designUrls` and `statusUpdateTime` — the
 * rest of the order document is left untouched.
 */
interface OrderDocument extends Document {
  orderNumber: string;
  designUrls?: Array<{
    productId: string;
    url: string;
    currentVersion?: number;
  }>;
  statusUpdateTime: Date;
}

const ORDERS_COLLECTION = 'orders';

/**
 * Update the order's `designUrls[].url` and `currentVersion` to point
 * to the new immutable archived URL, directly in MongoDB.
 *
 * If the design entry exists, its `url` and `currentVersion` are updated.
 * If it doesn't exist (e.g. the design was deleted but the admin restored
 * it from history), a new entry is added.
 *
 * Best-effort: errors are logged but not thrown.
 */
export async function notifyBackendOfDesignUrlUpdate(
  params: UpdateDesignUrlParams,
): Promise<void> {
  const { orderNumber, productId, url, version } = params;

  try {
    const client = getMongoClient();
    if (!client.isConnected()) {
      await client.connect();
    }

    const collection = client.getCollection<OrderDocument>(ORDERS_COLLECTION);
    if (!collection) {
      console.error(
        `[order-design-url] orders collection not available — cannot update order ${orderNumber}`,
      );
      return;
    }

    // ── Check if the design entry already exists ──────────────────────
    // We use a string comparison for productId because the backend's
    // Order schema defines productId as a String, but legacy orders may
    // store it as an ObjectId. String() normalizes both sides.
    const order = await collection.findOne({ orderNumber } as Filter<OrderDocument>);
    if (!order) {
      console.warn(
        `[order-design-url] Order not found: ${orderNumber} (productId=${productId}, v${version})`,
      );
      return;
    }

    const existingDesign = (order.designUrls || []).find(
      (d) => String(d.productId) === String(productId),
    );

    if (existingDesign) {
      // ── Update the existing designUrls entry ─────────────────────────
      // Use the positional operator ($set.designUrls.$) to update only
      // the matching array element.
      const filter: Filter<OrderDocument> = {
        _id: order._id,
        'designUrls.productId': productId,
      } as Filter<OrderDocument>;

      const update: UpdateFilter<OrderDocument> = {
        $set: {
          'designUrls.$.url': url,
          'designUrls.$.currentVersion': version,
          statusUpdateTime: new Date(),
        },
      };

      const result = await collection.updateOne(filter, update);

      if (result.matchedCount === 0) {
        // The productId query didn't match — possible type mismatch
        // (string vs ObjectId). Try matching by string-cast.
        console.warn(
          `[order-design-url] designUrls.productId exact match failed — trying string match for order ${orderNumber}, productId=${productId}`,
        );
        // Fetch the order again and find the entry by string comparison
        const freshOrder = await collection.findOne({ orderNumber } as Filter<OrderDocument>);
        const designEntry = (freshOrder?.designUrls || []).find(
          (d) => String(d.productId) === String(productId),
        );
        if (designEntry && freshOrder) {
          // Update by _id + the original productId value (whatever type it is)
          const retryFilter = {
            _id: freshOrder._id,
            'designUrls.productId': designEntry.productId,
          };
          const retryResult = await collection.updateOne(retryFilter as Filter<OrderDocument>, update);
          if (retryResult.matchedCount > 0) {
            console.log(
              `[order-design-url] Updated order ${orderNumber} design productId=${productId} → v${version} (string match fallback)`,
            );
          } else {
            console.error(
              `[order-design-url] Failed to update order ${orderNumber} — could not match designUrls entry for productId=${productId}`,
            );
          }
        }
      } else {
        console.log(
          `[order-design-url] Updated order ${orderNumber} design productId=${productId} → v${version}`,
        );
      }
    } else {
      // ── Add a new designUrls entry ───────────────────────────────────
      // The design entry was missing (e.g. after a delete). Re-add it
      // pointing to the new version's archived URL.
      console.log(
        `[order-design-url] Adding missing designUrls entry for order ${orderNumber}, productId=${productId}, v${version}`,
      );
      await collection.updateOne(
        { _id: order._id } as Filter<OrderDocument>,
        {
          $push: {
            designUrls: {
              productId,
              url,
              templateType: 'text',
              createdAt: new Date(),
              reviewed: false,
              currentVersion: version,
            },
          } as unknown as UpdateFilter<OrderDocument>['$push'],
          $set: { statusUpdateTime: new Date() },
        },
      );
    }
  } catch (error) {
    // Best-effort — the sync-designs endpoint on the backend will catch up.
    // But log the error so it's visible in the design app's server logs.
    console.error(
      `[order-design-url] Failed to update order design URL for order ${orderNumber}:`,
      error,
    );
  }
}
