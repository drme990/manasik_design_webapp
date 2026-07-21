import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

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

export { PUBLIC_URL, BUCKET_NAME };
