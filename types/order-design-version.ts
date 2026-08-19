/**
 * Order Design Version — shared types.
 *
 * An "order design version" is an immutable snapshot of a design that was
 * generated, edited, uploaded, restored, or deleted for a specific
 * (orderNumber, productId, itemIndex) identity. Versions are append-only:
 * existing versions are never edited, deleted, or reordered. A rollback is
 * itself a new version (`trigger: 'admin_restore'`).
 *
 * The `order_design_versions` collection lives in the shared MongoDB and is
 * written by both the design app (which creates snapshots) and the backend
 * (which writes restore/delete events). The backend owns the read/restore/
 * delete APIs and authorization.
 *
 * Identity rules (see `order-history-enhanced.md` §4):
 *   - Versions are grouped by `(orderNumber, productId, itemIndex)`.
 *   - `projectId` is metadata identifying the source design instance — it
 *     changes when a design is regenerated, so it must NEVER determine the
 *     version sequence.
 *   - `itemIndex` is optional for single-item products but required for
 *     multi-item orders. When omitted, it is normalized to `null` so it
 *     participates consistently in unique indexes and queries.
 */

import type { AnyLayer } from './layer';

/**
 * What triggered a version to be created.
 *
 * - `auto`              — automatic generation (payment webhook / admin
 *                         status change → design app callback).
 * - `admin_regenerate`  — admin clicked "Regenerate" in the admin panel,
 *                         producing a new design instance (new projectId).
 * - `admin_edit`        — admin opened the editor, changed layers, and
 *                         saved. The same projectId is re-rendered.
 * - `admin_upload`      — admin uploaded a replacement JPG directly.
 * - `admin_restore`     — admin restored a previous version. The new
 *                         version copies the restored version's snapshot
 *                         but is itself a brand-new history entry.
 * - `admin_delete`      — admin deleted the design. The new version
 *                         preserves the last valid snapshot and marks the
 *                         design as deleted (`isDeletedEvent: true`).
 */
export type OrderDesignVersionTrigger =
  | 'auto'
  | 'admin_regenerate'
  | 'admin_edit'
  | 'admin_upload'
  | 'admin_restore'
  | 'admin_delete';

/**
 * Stable identity for a single design within an order. This is the
 * grouping key for the version sequence — NOT `projectId`.
 */
export interface DesignVersionIdentity {
  orderNumber: string;
  productId: string;
  /** 1-based item index for multi-item orders. Omit for single-item. */
  itemIndex?: number;
}

/**
 * The design state captured in a version snapshot. Used for hashing and
 * for restore (the snapshot is copied verbatim into the new version).
 */
export interface DesignSnapshot {
  layers: AnyLayer[];
  canvasWidth: number;
  canvasHeight: number;
  backgroundColor?: string;
  backgroundUri?: string;
}

/**
 * Audit information for the actor that created the version. For `auto`
 * triggers this is a synthetic system actor. For admin triggers this is
 * derived from the authenticated admin session on the backend — the
 * client never sends these values.
 */
export interface DesignVersionActor {
  userId: string;
  userName: string;
  userRole: string;
}

/**
 * A single immutable version document in `order_design_versions`.
 */
export interface OrderDesignVersion extends DesignVersionIdentity, DesignSnapshot, DesignVersionActor {
  /** MongoDB `_id` (string) — assigned on insert. */
  _id?: string;

  /** Monotonically increasing version number, atomically allocated. */
  version: number;

  /**
   * ID of the design-app project (design instance) that produced this
   * snapshot. This is metadata only — it changes on regeneration and
   * must NOT be used as the history grouping key.
   */
  projectId: string;

  /** Public R2 URL of the immutable archived JPG for this version. */
  archivedUrl: string;
  /** R2 object key for the archived JPG. */
  archivedKey: string;

  /** What created this version. */
  trigger: OrderDesignVersionTrigger;

  /** Unix timestamp (ms) when the version was created. */
  createdAt: number;

  /**
   * Only populated for `admin_restore` events — the version number that
   * was restored. The new version's snapshot is a copy of that version's
   * snapshot.
   */
  restoredFromVersion?: number;

  /**
   * Only populated for `admin_delete` events. Marks this version as a
   * deletion event: the previous snapshot is preserved, but the order's
   * current design pointer is cleared (`currentVersion = null`).
   */
  isDeletedEvent?: boolean;

  /**
   * Stable hash of the design snapshot (`layers + canvas + background`).
   * Used for no-op detection on editor saves: if the latest version's
   * hash equals the current state's hash, no new version is created.
   */
  designHash: string;

  /**
   * Idempotency key. If two requests carry the same `operationId`, only
   * one version is created and the existing one is returned. Used for
   * webhook retries, admin double-clicks, and worker retries.
   */
  operationId: string;
}

/**
 * Result returned by `createVersion`. `created` is `false` when the
 * save was a no-op (the design hash matched the latest version) or when
 * the operation was deduplicated by `operationId`.
 */
export interface CreateVersionResult {
  saved: boolean;
  reason?: 'no_changes' | 'duplicate_operation';
  version?: OrderDesignVersion;
}

/**
 * The atomic counter document in `order_design_version_counters`.
 * One document per `(orderNumber, productId, itemIndex)` identity.
 */
export interface OrderDesignVersionCounter extends DesignVersionIdentity {
  /** The next version number to allocate. */
  nextVersion: number;
}
