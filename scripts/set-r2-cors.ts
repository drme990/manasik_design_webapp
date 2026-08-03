/**
 * Set CORS rules on the R2 bucket so that images served from
 * storage.manasik.net can be fetched cross-origin from the design app
 * (and admin panel). This fixes html-to-image thumbnail capture and
 * any other client-side fetch of R2-hosted assets.
 *
 * Usage: npx tsx scripts/set-r2-cors.ts
 *
 * CORS rules allow:
 *   - GET requests from any origin (for image loading + fetch)
 *   - Methods: GET, HEAD, PUT, POST, DELETE
 *   - Headers: *
 *   - Max age: 1 hour (browser cache preflight)
 */
import { S3Client, PutBucketCorsCommand } from '@aws-sdk/client-s3';

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '';
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const BUCKET_NAME = process.env.R2_BUCKET_NAME || '';

async function main() {
  if (!ACCOUNT_ID || !ACCESS_KEY_ID || !SECRET_ACCESS_KEY || !BUCKET_NAME) {
    console.error('Missing R2 env vars. Check R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME.');
    process.exit(1);
  }

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: ACCESS_KEY_ID,
      secretAccessKey: SECRET_ACCESS_KEY,
    },
  });

  const corsRules = [
    {
      ID: 'AllowAllOriginsRead',
      AllowedOrigins: ['*'],
      AllowedMethods: ['GET', 'HEAD'],
      AllowedHeaders: ['*'],
      ExposeHeaders: ['ETag', 'Content-Length', 'Content-Type'],
      MaxAgeSeconds: 3600,
    },
    {
      ID: 'AllowAppOriginsWrite',
      AllowedOrigins: [
        'https://design.manasik.net',
        'https://admin.manasik.net',
        'http://localhost:3000',
        'http://localhost:3001',
      ],
      AllowedMethods: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE'],
      AllowedHeaders: ['*'],
      ExposeHeaders: ['ETag', 'Content-Length', 'Content-Type'],
      MaxAgeSeconds: 3600,
    },
  ];

  console.log(`Setting CORS on bucket "${BUCKET_NAME}"...`);
  await client.send(
    new PutBucketCorsCommand({
      Bucket: BUCKET_NAME,
      CORSConfiguration: {
        CORSRules: corsRules,
      },
    })
  );

  console.log('CORS rules set successfully:');
  console.log(JSON.stringify(corsRules, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to set CORS:', err);
  process.exit(1);
});
