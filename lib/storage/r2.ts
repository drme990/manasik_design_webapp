import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

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
    credentials: {
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: SECRET_ACCESS_KEY,
    },
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
  contentType: string
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
    })
  );

  return {
    key,
    url: `${PUBLIC_URL}/${key}`,
    size: buffer.length,
    contentType,
  };
}

export function generateImageKey(file: File | { name: string; type: string }): string {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const rand = Math.random().toString(36).slice(2, 10);
  const safeExt = ext && /^[a-z0-9]+$/.test(ext) ? ext : 'bin';
  return `design/projects-images/${Date.now()}-${rand}.${safeExt}`;
}

/**
 * Generate an S3 key for a user-uploaded font file under `design/fonts/`.
 * The filename is sanitized to a safe family-id slug; the original extension
 * is preserved so browsers can sniff the format.
 * Fonts are global (shared across all projects) — no per-user subfolder.
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
 */
export function generateThumbnailKey(projectId: string): string {
  return `design/thumbnails/${projectId}.webp`;
}

/**
 * Extract the R2 key from a full public URL.
 * Returns null if the URL doesn't start with the configured PUBLIC_URL.
 */
export function extractKeyFromUrl(url: string): string | null {
  if (!PUBLIC_URL) return null;
  if (!url.startsWith(PUBLIC_URL)) return null;
  return url.slice(PUBLIC_URL.length + 1); // +1 for the '/'
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

export { PUBLIC_URL, BUCKET_NAME };
