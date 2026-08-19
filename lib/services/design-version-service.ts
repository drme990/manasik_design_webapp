/**
 * Design version service.
 *
 * Single source of truth for creating immutable saved-version snapshots
 * of an order's design. The design app calls `createVersion` after:
 *   - automatic generation (`trigger: 'auto'`)
 *   - admin regeneration (`trigger: 'admin_regenerate'`)
 *   - admin editor save (`trigger: 'admin_edit'`)
 *   - admin upload (`trigger: 'admin_upload'`)
 *
 * The backend separately writes `admin_restore` and `admin_delete` events
 * via its own model — those flows do not go through this service because
 * they require backend authorization and order-pointer updates.
 *
 * Responsibilities (see `order-history-enhanced.md` §28):
 *   - normalize + hash the design state for no-op detection
 *   - allocate a monotonically increasing version number atomically
 *   - upload an immutable archived JPG to R2 (never overwritten)
 *   - insert the version document into `order_design_versions`
 *   - deduplicate by `operationId` (idempotency for retries)
 *
 * This service writes to the shared MongoDB directly (the design app uses
 * the raw `mongodb` driver, the backend uses Mongoose — both target the
 * same database via `DATA_BASE_URL`).
 */

import crypto from 'node:crypto';
import { getMongoClient } from '@/lib/db/mongodb';
import { uploadToR2 } from '@/lib/storage/r2';
import type { AnyLayer } from '@/types/layer';
import type { Project } from '@/types/project';
import type {
  CreateVersionResult,
  DesignSnapshot,
  DesignVersionActor,
  DesignVersionIdentity,
  OrderDesignVersion,
  OrderDesignVersionCounter,
} from '@/types/order-design-version';

const VERSIONS_COLLECTION = 'order_design_versions';
const COUNTERS_COLLECTION = 'order_design_version_counters';

/**
 * Synthetic actor used for automatic generation. The backend's webhook
 * has no admin session, so we record a system actor. The admin panel UI
 * renders this as "Auto-generation".
 */
export const AUTO_ACTOR: DesignVersionActor = Object.freeze({
  userId: 'system',
  userName: 'Auto-generation',
  userRole: 'system',
});

// ─── Normalization ───────────────────────────────────────────────────────

/**
 * Transient layer fields that must NOT participate in the design hash.
 * These are UI/editor-only state (e.g. "needs initial fit-to-view") and
 * do not affect the rendered output.
 */
const TRANSIENT_LAYER_KEYS = new Set([
  '_needsInitialFit',
  '_pendingUpload',
  '_uploadError',
]);

/**
 * Strip transient fields from a layer. Returns a shallow copy with only
 * the transient keys removed — nested data is preserved by reference
 * (it's not mutated, and the hash serializer handles ordering).
 */
function normalizeLayer<T extends Record<string, unknown>>(layer: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(layer)) {
    if (TRANSIENT_LAYER_KEYS.has(key)) continue;
    out[key] = layer[key];
  }
  return out;
}

function normalizeLayers(layers: AnyLayer[]): AnyLayer[] {
  return layers.map((l) => normalizeLayer(l as unknown as Record<string, unknown>) as unknown as AnyLayer);
}

/**
 * Build a deterministic snapshot object for hashing. The keys are emitted
 * in a fixed order so the hash is stable regardless of property insertion
 * order in the original layer objects.
 */
function buildSnapshot(project: Pick<Project, 'layers' | 'canvasWidth' | 'canvasHeight' | 'backgroundColor' | 'backgroundUri'>): DesignSnapshot {
  return {
    layers: normalizeLayers(project.layers),
    canvasWidth: project.canvasWidth,
    canvasHeight: project.canvasHeight,
    backgroundColor: project.backgroundColor,
    backgroundUri: project.backgroundUri,
  };
}

/**
 * Deterministically serialize a value to a string for hashing.
 *
 * `JSON.stringify` is NOT deterministic on its own — property insertion
 * order varies. This walks the value recursively and emits keys in sorted
 * order, so two objects with the same content but different key orders
 * produce the same string.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    const parts = value.map((v) => stableStringify(v));
    return `[${parts.join(',')}]`;
  }

  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
  return `{${parts.join(',')}}`;
}

/**
 * Compute a stable SHA-256 hash of a design snapshot.
 *
 * Used for no-op detection on editor saves: if the latest version's hash
 * equals the current state's hash, no new version is created.
 */
export function hashDesignState(snapshot: DesignSnapshot): string {
  const payload = stableStringify({
    layers: snapshot.layers,
    canvasWidth: snapshot.canvasWidth,
    canvasHeight: snapshot.canvasHeight,
    backgroundColor: snapshot.backgroundColor ?? null,
    backgroundUri: snapshot.backgroundUri ?? null,
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

// ─── Identity helpers ────────────────────────────────────────────────────

/**
 * Build a stable MongoDB filter for a history identity.
 *
 * `itemIndex` is normalized to `null` when omitted so it participates
 * consistently in unique indexes and queries (MongoDB treats `null` and
 * missing as equivalent for sparse lookups, but explicit `null` makes
 * the unique index behavior predictable).
 */
export function identityFilter(identity: DesignVersionIdentity): Record<string, unknown> {
  return {
    orderNumber: identity.orderNumber,
    productId: identity.productId,
    itemIndex: identity.itemIndex ?? null,
  };
}

// ─── Collection access ───────────────────────────────────────────────────

async function getVersionsCollection() {
  const client = getMongoClient();
  if (!client.isConnected()) await client.connect();
  const collection = client.getCollection<OrderDesignVersion>(VERSIONS_COLLECTION);
  if (!collection) throw new Error('order_design_versions collection not available');
  return collection;
}

async function getCountersCollection() {
  const client = getMongoClient();
  if (!client.isConnected()) await client.connect();
  const collection = client.getCollection<OrderDesignVersionCounter>(COUNTERS_COLLECTION);
  if (!collection) throw new Error('order_design_version_counters collection not available');
  return collection;
}

// ─── Version allocation ──────────────────────────────────────────────────

/**
 * Atomically allocate the next version number for a history identity.
 *
 * Uses `findOneAndUpdate` with `$inc` on a per-identity counter document.
 * Combined with the unique index on `(orderNumber, productId, itemIndex,
 * version)`, this guarantees two concurrent saves cannot both become
 * `vN`.
 */
export async function allocateVersionNumber(identity: DesignVersionIdentity): Promise<number> {
  const counters = await getCountersCollection();
  const filter = identityFilter(identity);
  // mongodb v6's `findOneAndUpdate` returns `ModifyResult<T> | null` where
  // the updated document is in `.value`. Some driver type definitions
  // resolve the return as `WithId<T> | null` directly (the document itself,
  // not wrapped in ModifyResult). Handle both shapes defensively.
  const result = await counters.findOneAndUpdate(
    filter,
    { $inc: { nextVersion: 1 } },
    { upsert: true, returnDocument: 'after' },
  ) as unknown as { value?: { nextVersion?: number }; nextVersion?: number } | null;
  const doc = result?.value ?? result;
  if (!doc?.nextVersion) {
    // Should never happen with upsert + returnDocument:'after', but
    // guard anyway — initialize then allocate.
    await counters.updateOne(filter, { $setOnInsert: { nextVersion: 1 } }, { upsert: true });
    const retry = await counters.findOneAndUpdate(
      filter,
      { $inc: { nextVersion: 1 } },
      { returnDocument: 'after' },
    ) as unknown as { value?: { nextVersion?: number }; nextVersion?: number } | null;
    const retryDoc = retry?.value ?? retry;
    return retryDoc?.nextVersion ?? 1;
  }
  return doc.nextVersion;
}

// ─── Archive upload ──────────────────────────────────────────────────────

/**
 * Sanitize a string for use in an R2 key segment. Keeps alphanumerics,
 * dashes, and underscores; replaces anything else with a dash; collapses
 * consecutive dashes; trims leading/trailing dashes.
 */
function sanitizeKeySegment(value: string): string {
  return (
    value
      .trim()
      .replace(/[^a-zA-Z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'unknown'
  );
}

/**
 * Build the immutable R2 key for a version archive.
 *
 * Layout (see `order-history-enhanced.md` §16):
 *   design/orders-design/versions/{orderNumber}/{productId}/{itemIndex}/v{version}.jpg
 *
 * `itemIndex` defaults to `1` for single-item products so the path is
 * always well-formed.
 */
export function buildArchivedKey(identity: DesignVersionIdentity, version: number): string {
  const order = sanitizeKeySegment(identity.orderNumber);
  const product = sanitizeKeySegment(identity.productId);
  const item = sanitizeKeySegment(String(identity.itemIndex ?? 1));
  return `design/orders-design/versions/${order}/${product}/${item}/v${version}.jpg`;
}

/**
 * Construct the public URL for an R2 key. Mirrors the URL construction
 * in `uploadToR2` (`${PUBLIC_URL}/${key}`) so we can predict the URL
 * before the image is actually uploaded.
 */
function buildPublicUrlFromKey(key: string): string {
  const publicUrl = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
  return `${publicUrl}/${key}`;
}

/**
 * Upload an immutable archived JPG for a version.
 *
 * Uses long-lived immutable cache control — version archives are never
 * overwritten, so the CDN can cache them forever.
 */
export async function uploadArchivedImage(
  identity: DesignVersionIdentity,
  version: number,
  jpgBuffer: Buffer,
): Promise<{ url: string; key: string }> {
  const key = buildArchivedKey(identity, version);
  const result = await uploadToR2(key, jpgBuffer, 'image/jpeg', {
    // Immutable — never overwritten, so cache forever.
    cacheControl: 'public, max-age=31536000, immutable',
  });
  return { url: result.url, key: result.key };
}

// ─── Lookups ─────────────────────────────────────────────────────────────

/**
 * Find the latest version for a history identity (highest version number).
 * Returns null if no versions exist yet.
 */
export async function findLatestVersion(
  identity: DesignVersionIdentity,
): Promise<OrderDesignVersion | null> {
  const versions = await getVersionsCollection();
  const filter = identityFilter(identity);
  const cursor = versions.find(filter).sort({ version: -1 }).limit(1);
  const docs = await cursor.toArray();
  return docs[0] ?? null;
}

/**
 * Find an existing version by its `operationId`. Used for idempotency:
 * if a retry carries the same operationId, return the existing version
 * instead of creating a duplicate.
 */
export async function findVersionByOperationId(
  operationId: string,
): Promise<OrderDesignVersion | null> {
  if (!operationId) return null;
  const versions = await getVersionsCollection();
  const doc = await versions.findOne({ operationId });
  return doc ?? null;
}

// ─── createVersion ───────────────────────────────────────────────────────

export interface CreateVersionInput extends DesignVersionIdentity {
  /** The design instance project that produced this snapshot. */
  projectId: string;
  /** The rendered JPG buffer to archive. */
  jpgBuffer: Buffer;
  /** The project to snapshot (layers + canvas + background). */
  project: Pick<Project, 'layers' | 'canvasWidth' | 'canvasHeight' | 'backgroundColor' | 'backgroundUri'>;
  trigger: OrderDesignVersion['trigger'];
  actor: DesignVersionActor;
  /**
   * Idempotency key. If a version with this operationId already exists,
   * it is returned without creating a new one. Use a stable key for
   * webhook retries (e.g. the webhook event ID) and a fresh key per
   * admin save request.
   */
  operationId: string;
  /**
   * When true, compare the current design hash against the latest
   * version's hash and skip creation if they match (no-op save). Only
   * meaningful for `admin_edit` triggers — auto/regenerate/upload always
   * produce a new version.
   */
  skipIfUnchanged?: boolean;
}

/**
 * Create an immutable saved version of a design.
 *
 * Flow:
 *   1. Idempotency check — if `operationId` already exists, return it.
 *   2. No-op check — if `skipIfUnchanged` and the hash matches the
 *      latest version, return without creating.
 *   3. Allocate the next version number atomically.
 *   4. Upload the immutable archived JPG to R2.
 *   5. Insert the version document.
 *
 * Returns `{ saved: false, reason }` for no-op / duplicate, or
 * `{ saved: true, version }` for a newly created version.
 */
export async function createVersion(input: CreateVersionInput): Promise<CreateVersionResult> {
  // ── Idempotency: duplicate operation ──────────────────────────────
  if (input.operationId) {
    const existing = await findVersionByOperationId(input.operationId);
    if (existing) {
      return { saved: false, reason: 'duplicate_operation', version: existing };
    }
  }

  // ── No-op: unchanged design state ─────────────────────────────────
  const snapshot = buildSnapshot(input.project);
  const currentHash = hashDesignState(snapshot);

  if (input.skipIfUnchanged) {
    const latest = await findLatestVersion(input);
    if (latest && latest.designHash === currentHash && !latest.isDeletedEvent) {
      return { saved: false, reason: 'no_changes', version: latest };
    }
  }

  // ── Allocate + upload + insert ────────────────────────────────────
  const version = await allocateVersionNumber(input);
  const archive = await uploadArchivedImage(input, version, input.jpgBuffer);

  const document: OrderDesignVersion = {
    orderNumber: input.orderNumber,
    productId: input.productId,
    itemIndex: input.itemIndex,
    projectId: input.projectId,
    version,
    archivedUrl: archive.url,
    archivedKey: archive.key,
    layers: snapshot.layers,
    canvasWidth: snapshot.canvasWidth,
    canvasHeight: snapshot.canvasHeight,
    backgroundColor: snapshot.backgroundColor,
    backgroundUri: snapshot.backgroundUri,
    userId: input.actor.userId,
    userName: input.actor.userName,
    userRole: input.actor.userRole,
    trigger: input.trigger,
    designHash: currentHash,
    operationId: input.operationId,
    createdAt: Date.now(),
  };

  const versions = await getVersionsCollection();
  await versions.insertOne(document as unknown as OrderDesignVersion & { _id?: unknown });

  return { saved: true, version: document };
}

// ─── Optimistic version creation ─────────────────────────────────────────

/**
 * Result of an optimistic version creation. The version document is
 * inserted immediately (so the backend can be notified with the new
 * URL), and the image upload happens separately via {@link uploadVersionImage}.
 *
 * If the upload fails, call {@link deleteVersion} to roll back.
 */
export interface OptimisticVersionResult {
  version: OrderDesignVersion;
  /** The R2 key where the image should be uploaded. */
  archivedKey: string;
  /** The public URL where the image will be available after upload. */
  archivedUrl: string;
}

/**
 * Allocate a version number, construct the archived URL/key, and insert
 * the version document — WITHOUT uploading the image yet.
 *
 * This is the "optimistic" path: the version exists in the database
 * immediately, the backend can be notified with the new URL, and the
 * image upload happens afterwards. If the upload fails, call
 * {@link deleteVersion} to remove the version document.
 *
 * Every save creates a new version — there is no hash-based skip. Even
 * a single-character text change produces a new version.
 */
export async function createVersionOptimistic(
  input: CreateVersionInput,
): Promise<OptimisticVersionResult> {
  // ── Idempotency: duplicate operation ──────────────────────────────
  if (input.operationId) {
    const existing = await findVersionByOperationId(input.operationId);
    if (existing) {
      return {
        version: existing,
        archivedKey: existing.archivedKey,
        archivedUrl: existing.archivedUrl,
      };
    }
  }

  // ── Build snapshot + hash ─────────────────────────────────────────
  const snapshot = buildSnapshot(input.project);
  const currentHash = hashDesignState(snapshot);

  // ── Allocate version number ───────────────────────────────────────
  const version = await allocateVersionNumber(input);

  // ── Construct archived URL + key (deterministic) ──────────────────
  const key = buildArchivedKey(input, version);
  const url = buildPublicUrlFromKey(key);

  // ── Insert the version document (image not uploaded yet) ──────────
  const document: OrderDesignVersion = {
    orderNumber: input.orderNumber,
    productId: input.productId,
    itemIndex: input.itemIndex,
    projectId: input.projectId,
    version,
    archivedUrl: url,
    archivedKey: key,
    layers: snapshot.layers,
    canvasWidth: snapshot.canvasWidth,
    canvasHeight: snapshot.canvasHeight,
    backgroundColor: snapshot.backgroundColor,
    backgroundUri: snapshot.backgroundUri,
    userId: input.actor.userId,
    userName: input.actor.userName,
    userRole: input.actor.userRole,
    trigger: input.trigger,
    designHash: currentHash,
    operationId: input.operationId,
    createdAt: Date.now(),
  };

  const versions = await getVersionsCollection();
  await versions.insertOne(document as unknown as OrderDesignVersion & { _id?: unknown });

  return { version: document, archivedKey: key, archivedUrl: url };
}

/**
 * Upload the image for a version created via {@link createVersionOptimistic}.
 *
 * This is the slow part (R2 upload). It runs AFTER the version document
 * is inserted and the backend is notified, so the admin panel can pick
 * up the new version URL quickly.
 *
 * If this fails, call {@link deleteVersion} to roll back.
 */
export async function uploadVersionImage(
  archivedKey: string,
  jpgBuffer: Buffer,
): Promise<void> {
  await uploadToR2(archivedKey, jpgBuffer, 'image/jpeg', {
    // Immutable — never overwritten, so cache forever.
    cacheControl: 'public, max-age=31536000, immutable',
  });
}

/**
 * Delete a version document. Used to roll back a failed optimistic
 * version creation (image upload failed).
 *
 * Also decrements the version counter so the next save reuses the
 * same version number (avoids gaps in the history).
 */
export async function deleteVersion(
  identity: DesignVersionIdentity,
  version: number,
): Promise<void> {
  const versions = await getVersionsCollection();
  await versions.deleteOne({
    ...identityFilter(identity),
    version,
  } as Record<string, unknown>);

  // Decrement the counter so the next save reuses this version number.
  // This avoids gaps in the history (e.g. v4, v5-deleted, v5).
  const counters = await getCountersCollection();
  await counters.updateOne(
    identityFilter(identity),
    { $inc: { nextVersion: -1 } },
  );
}

/**
 * Generate a fresh operation ID. Used by callers that don't have a
 * natural idempotency key (e.g. admin editor saves — each save request
 * gets a unique ID).
 */
export function generateOperationId(): string {
  return crypto.randomUUID();
}
