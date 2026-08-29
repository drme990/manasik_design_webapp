import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '';
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const BUCKET_NAME = process.env.R2_BUCKET_NAME || '';
const PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');

let client: S3Client | null = null;

function getClient(): S3Client {
  if (client) return client;
  if (!ACCOUNT_ID || !ACCESS_KEY_ID || !SECRET_ACCESS_KEY) {
    throw new Error('R2 credentials are not configured. Check R2_* env vars.');
  }
  client = new S3Client({
    region: 'auto',
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    credentials: {
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: SECRET_ACCESS_KEY,
    },
    // Match the backend's checksum setting — flexible mode adds extra
    // checksum headers that can cause signature mismatches with R2.
    requestChecksumCalculation: 'WHEN_REQUIRED',
  });
  return client;
}

export interface UploadResult {
  key: string;
  url: string;
  size: number;
  contentType: string;
}

export async function uploadToR2(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
  options?: {
    /** Cache-Control header value. Defaults to long-lived immutable cache. Use 'no-cache' for files that get overwritten at the same key (e.g. order designs). */
    cacheControl?: string;
  }
): Promise<UploadResult> {
  if (!BUCKET_NAME) {
    throw new Error('R2 bucket name is not configured. Check R2_BUCKET_NAME.');
  }
  const s3 = getClient();
  const buffer = body instanceof Buffer ? body : Buffer.from(body);

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      // Default to long cache for static files; allow override for
      // files that get overwritten at the same key (order designs).
      CacheControl: options?.cacheControl ?? 'public, max-age=31536000, immutable',
    })
  );

  return {
    key,
    url: `${PUBLIC_URL}/${key}`,
    size: buffer.length,
    contentType,
  };
}

/**
 * Generate an R2 key for a user-uploaded layer image.
 *
 * Tier 1 — Immutable asset. Every upload gets a unique key
 * ({timestamp}-{rand}). Old images stay in R2 until explicitly deleted.
 */
export function generateImageKey(file: File | { name: string; type: string }): string {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const rand = Math.random().toString(36).slice(2, 10);
  const safeExt = ext && /^[a-z0-9]+$/.test(ext) ? ext : 'bin';
  return `design/projects-images/${Date.now()}-${rand}.${safeExt}`;
}

/**
 * Generate an R2 key for a project/template background image.
 *
 * Stored under `design/template-bg/{templateId}/` with the project ID as
 * a subfolder so all bg images for a template are grouped together and
 * easy to list/delete. This separates background images from regular
 * layer images (`design/projects-images/`) so that design-instance
 * deletion (which shares the template's bg URL) can be handled safely —
 * the bg is only deleted when the TEMPLATE is deleted, never when a
 * design instance is deleted.
 *
 * Tier 1 — Immutable asset. Every upload gets a unique key
 * ({timestamp}-{rand}). Old bg images stay in R2 until explicitly deleted.
 *
 * @param projectId The project (template or design) that owns this bg
 * @param file      The uploaded file (used for the extension)
 */
export function generateBackgroundKey(
  projectId: string,
  file: File | { name: string; type: string },
): string {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const rand = Math.random().toString(36).slice(2, 8);
  const safeExt = ext && /^[a-z0-9]+$/.test(ext) ? ext : 'jpg';
  const safeId = projectId.replace(/[^a-zA-Z0-9-_]/g, '-').slice(0, 40) || 'unknown';
  return `design/template-bg/${safeId}/${Date.now()}-${rand}.${safeExt}`;
}

/**
 * Generate an S3 key for a user-uploaded font file under `design/fonts/`.
 * The filename is sanitized to a safe family-id slug; the original extension
 * is preserved so browsers can sniff the format.
 * Fonts are global (shared across all projects) — no per-user subfolder.
 *
 * Tier 1 — Immutable asset. Every upload gets a unique key
 * ({slug}-{rand}).
 */
export function generateFontKey(file: File | { name: string; type: string }): string {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const baseName = file.name.replace(/\.[^.]+$/, '');
  // Slugify the base name: keep letters/digits, replace others with hyphen
  const slug = baseName
    .normalize('NFKD')
    .replace(/[^\w\u0600-\u06FF-]/g, '-') // keep arabic range + word chars
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 40) || 'font';
  const rand = Math.random().toString(36).slice(2, 8);
  const safeExt = ext && /^[a-z0-9]+$/.test(ext) ? ext : 'ttf';
  return `design/fonts/${slug}-${rand}.${safeExt}`;
}

/**
 * Generate an R2 key for a user-uploaded PNG shape.
 * Stored under `design/shapes/` so all custom shapes are grouped together.
 *
 * Tier 1 — Immutable asset. Every upload gets a unique key
 * ({slug}-{rand}).
 */
export function generateShapeKey(file: File | { name: string; type: string }): string {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const baseName = file.name.replace(/\.[^.]+$/, '');
  const slug = baseName
    .normalize('NFKD')
    .replace(/[^\w\u0600-\u06FF-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 40) || 'shape';
  const rand = Math.random().toString(36).slice(2, 8);
  const safeExt = ext && /^[a-z0-9]+$/.test(ext) ? ext : 'png';
  return `design/shapes/${slug}-${rand}.${safeExt}`;
}

/**
 * Generate an R2 key for a project thumbnail.
 * Stored under `design/thumbnails/` with the project ID as the filename.
 *
 * Tier 2 — Mutable asset. Uses a stable key so the URL never changes.
 * Replacement is explicit: delete old + upload new with same key
 * (see thumbnail route for the delete-then-readd flow).
 * Cache-busting is handled via `?v={timestamp}` query param in the DB.
 */
export function generateThumbnailKey(projectId: string): string {
  return `design/thumbnails/${projectId}.webp`;
}

/**
 * Generate the R2 key for an order design JPG.
 *
 * Path layout:
 *   - Single item:  `design/orders-design/{orderNumber}.jpg`
 *   - Multiple items: `design/orders-design/{orderNumber}-{itemIndex}.jpg`
 *
 * Tier 2 — Mutable asset. Uses a stable key so the URL never changes.
 * Replacement is explicit: delete old + upload new with same key.
 * The `no-cache` Cache-Control header ensures the CDN always fetches fresh.
 *
 * The order number is sanitized so it only contains characters that are
 * safe in R2/S3 keys (alphanumeric, dash, underscore).
 */
export function generateOrderDesignKey(orderNumber: string, itemIndex?: number): string {
  const safe = orderNumber
    .trim()
    .replace(/[^a-zA-Z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'unknown';

  if (itemIndex && itemIndex > 1) {
    return `design/orders-design/${safe}-${itemIndex}.jpg`;
  }
  return `design/orders-design/${safe}.jpg`;
}

/**
 * Extract the R2 key from a full public URL.
 * Returns null if the URL doesn't start with the configured PUBLIC_URL.
 */
export function extractKeyFromUrl(url: string): string | null {
  if (!PUBLIC_URL) return null;
  if (!url.startsWith(PUBLIC_URL)) return null;
  // Strip query params and fragments (e.g. ?v=123 for cache-busting)
  const path = url.slice(PUBLIC_URL.length + 1); // +1 for the '/'
  const queryIndex = path.search(/[?#]/);
  return queryIndex === -1 ? path : path.slice(0, queryIndex);
}

/**
 * Delete a single object from R2 by its key.
 * Silently ignores errors (best-effort cleanup).
 */
export async function deleteFromR2(key: string): Promise<void> {
  if (!BUCKET_NAME) return;
  try {
    const s3 = getClient();
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
  } catch (error) {
    console.error(`[R2] Failed to delete key "${key}":`, error);
  }
}

/**
 * List all object keys in R2 under a given prefix.
 * Used to find all assets belonging to a project for bulk deletion.
 */
export async function listR2KeysByPrefix(prefix: string): Promise<string[]> {
  if (!BUCKET_NAME) return [];
  try {
    const s3 = getClient();
    const keys: string[] = [];
    let continuationToken: string | undefined;
    do {
      const response = await s3.send(
        new ListObjectsV2Command({
          Bucket: BUCKET_NAME,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        })
      );
      if (response.Contents) {
        for (const obj of response.Contents) {
          if (obj.Key) keys.push(obj.Key);
        }
      }
      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);
    return keys;
  } catch (error) {
    console.error(`[R2] Failed to list keys with prefix "${prefix}":`, error);
    return [];
  }
}

/**
 * Delete multiple objects from R2 by their keys.
 * Silently ignores errors (best-effort cleanup).
 */
export async function deleteMultipleFromR2(keys: string[]): Promise<void> {
  if (!BUCKET_NAME || keys.length === 0) return;
  // Delete one by one — R2/S3 batch delete has a 1000-object limit,
  // and individual deletes are simpler and good enough for project cleanup.
  await Promise.all(keys.map((key) => deleteFromR2(key)));
}

/**
 * Download an object from R2 by its key. Returns the Buffer, or null if
 * the download fails. Used by the server-side renderer to fetch images
 * directly from R2 (bypassing Cloudflare CDN) when HTTP fetch to the
 * public URL fails — e.g. on Vercel serverless where the CDN may block
 * or 404 server-side requests.
 */
export async function downloadFromR2(key: string): Promise<Buffer | null> {
  if (!BUCKET_NAME) return null;
  try {
    const s3 = getClient();
    const response = await s3.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
    if (!response.Body) return null;
    const bytes = await response.Body.transformToByteArray();
    return Buffer.from(bytes);
  } catch (error) {
    console.error(`[R2] Failed to download key "${key}":`, error);
    return null;
  }
}

export { PUBLIC_URL, BUCKET_NAME };
