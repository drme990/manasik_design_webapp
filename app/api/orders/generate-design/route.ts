import { NextRequest, NextResponse } from 'next/server';
import { getMongoClient } from '@/lib/db/mongodb';
import { uploadToR2 } from '@/lib/storage/r2';
import { renderTemplateToJpg } from '@/lib/render/canvas-renderer';
import { inflateTemplateToDesign } from '@/lib/render/inflate-template';
import type { BookingProduct, Project, TemplateType } from '@/types';

const BOOKING_COLLECTION = 'booking_products';
const PROJECTS_COLLECTION = 'projects';

/**
 * Shared secret for callback authentication.
 * The external backend must send this in the `x-callback-secret` header.
 * Configured via the CALLBACK_SECRET env var. If the env var is not set,
 * the route refuses all requests (fail-closed).
 */
function getCallbackSecret(): string | null {
  return process.env.CALLBACK_SECRET || null;
}

/**
 * Verify the callback request is from an authorized caller.
 * Checks the `x-callback-secret` header against the configured secret.
 */
function verifyCallback(request: NextRequest): boolean {
  const secret = getCallbackSecret();
  if (!secret) return false; // fail-closed if not configured
  const provided = request.headers.get('x-callback-secret');
  if (!provided) return false;
  // Constant-time-ish comparison to avoid timing attacks
  if (provided.length !== secret.length) return false;
  return provided === secret;
}

async function getBookingCollection() {
  const client = getMongoClient();
  if (!client.isConnected()) {
    await client.connect();
  }
  const collection = client.getCollection<BookingProduct>(BOOKING_COLLECTION);
  if (!collection) {
    throw new Error('Booking products collection not available');
  }
  return collection;
}

async function getProjectsCollection() {
  const client = getMongoClient();
  if (!client.isConnected()) {
    await client.connect();
  }
  const collection = client.getCollection<Project>(PROJECTS_COLLECTION);
  if (!collection) {
    throw new Error('Projects collection not available');
  }
  return collection;
}

/**
 * Generate the R2 key for an order design.
 *
 * Path layout:
 *   - Single item:  `design/orders-design/{orderNumber}.jpg`
 *   - Multiple items: `design/orders-design/{orderNumber}-{itemIndex}.jpg`
 *
 * The order number is sanitized so it only contains characters that are
 * safe in R2/S3 keys (alphanumeric, dash, underscore). Anything else is
 * replaced with a dash. Leading/trailing dashes are stripped.
 */
function generateOrderDesignKey(orderNumber: string, itemIndex?: number): string {
  const safe = orderNumber
    .trim()
    .replace(/[^a-zA-Z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'unknown';

  // For multi-item orders, append the 1-based item index.
  // itemIndex=1 or undefined → just {orderNumber}.jpg (backward compat)
  // itemIndex>1 → {orderNumber}-{itemIndex}.jpg
  if (itemIndex && itemIndex > 1) {
    return `design/orders-design/${safe}-${itemIndex}.jpg`;
  }
  return `design/orders-design/${safe}.jpg`;
}

/**
 * Extract the current item's product name from the order data payload.
 * Used to give the design instance a human-readable name.
 */
function resolveProductName(
  orderData: Record<string, unknown>,
): string | undefined {
  const item = (orderData as { item?: { productName?: { ar?: string; en?: string } } }).item;
  if (!item?.productName) return undefined;
  return item.productName.ar || item.productName.en;
}

/**
 * Expected request body from the backend callback.
 *
 * The backend sends one request per product in the order (it loops
 * over items). Each request targets a single product.
 *
 * - `productId`           : the backend product's `_id` (string). Used
 *                           to look up the booking product → its
 *                           template(s).
 * - `orderNumber`         : the order's number/ID. Used as the filename
 *                           in R2.
 * - `hasReservationPhoto` : whether the order has a `reservation.photo`
 *                           value. When true, the design app prefers the
 *                           image template (`imageTemplateId`); when
 *                           false, it falls back to the text template
 *                           (`templateId`).
 * - `itemIndex`           : 1-based index of this item within the order.
 *                           Used to generate unique filenames for
 *                           multi-item orders
 *                           ({orderNumber}-1.jpg, {orderNumber}-2.jpg).
 * - `orderData`           : the full order payload (billing, items,
 *                           reservation data, etc.) used to inflate the
 *                           template's dynamic fields at render time.
 *                           The backend sets `orderData.item` to the
 *                           current item so `item.*` dynamic fields
 *                           resolve to the right product.
 */
interface GenerateDesignRequest {
  productId: string;
  orderNumber: string;
  hasReservationPhoto: boolean;
  itemIndex?: number;
  orderData: Record<string, unknown>;
}

/**
 * POST /api/orders/generate-design
 *
 * Callback endpoint triggered by the external backend when an order needs
 * a design generated from a booking template. The backend sends one
 * request per product; products without a template are reported back as
 * `noTemplate` so the backend can skip them and try the next product.
 *
 * Flow:
 *   1. Authenticate via `x-callback-secret` header.
 *   2. Look up the booking product by `backendProductId`.
 *   3. If no booking product exists → respond with `noBookingProduct`.
 *   4. Pick the right template based on `hasReservationPhoto`:
 *        - hasReservationPhoto=true  → image template (imageTemplateId)
 *        - hasReservationPhoto=false → text template (templateId)
 *      STRICT matching — no fallback between types. If the required
 *      template slot is empty → respond with `noTemplate`.
 *   5. Load the template project.
 *   6. Inflate the template's dynamic fields with the order data and
 *      render to JPG via @napi-rs/canvas (native canvas engine).
 *   7. Upload the rendered JPG to R2 at
 *      `design/orders-design/{orderNumber}[-{itemIndex}].jpg`.
 *   8. Return the public URL + which template variant was used.
 *
 * Responses:
 *   200 — success, design generated and uploaded
 *         { success: true, data: { url, orderNumber, templateId, templateType } }
 *   400 — missing/invalid request body
 *   401 — missing or wrong callback secret
 *   404 — booking product or template not found
 *   409 — product exists but has no template assigned (`noTemplate`)
 *   500 — server error (rendering failure, R2 upload failure, etc.)
 */
export async function POST(request: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────
    if (!verifyCallback(request)) {
      return NextResponse.json(
        { success: false, error: 'unauthorized' },
        { status: 401 },
      );
    }

    // ── Parse body ────────────────────────────────────────────────────
    let body: GenerateDesignRequest;
    try {
      body = (await request.json()) as GenerateDesignRequest;
    } catch {
      return NextResponse.json(
        { success: false, error: 'invalidBody' },
        { status: 400 },
      );
    }

    if (!body.productId || typeof body.productId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'missingProductId' },
        { status: 400 },
      );
    }
    if (!body.orderNumber || typeof body.orderNumber !== 'string') {
      return NextResponse.json(
        { success: false, error: 'missingOrderNumber' },
        { status: 400 },
      );
    }

    // ── Look up the booking product by backendProductId ───────────────
    const bookingCollection = await getBookingCollection();
    const bookingProduct = await bookingCollection.findOne({
      backendProductId: body.productId,
    });

    if (!bookingProduct) {
      // No booking product exists for this backend product — the design
      // app has never been told about this product. The caller should
      // surface this to the user.
      return NextResponse.json(
        {
          success: false,
          error: 'noBookingProduct',
          message: 'No booking product found for this product ID. The product must be imported into the design app first.',
          productId: body.productId,
        },
        { status: 404 },
      );
    }

    // ── Pick the right template based on reservation photo ───────────
    // STRICT matching — no fallback between template types:
    //   hasReservationPhoto=true  → MUST use imageTemplateId (image template)
    //   hasReservationPhoto=false → MUST use templateId (text template)
    //
    // We never use an image template for an order without a photo, and
    // we never use a text template for an order WITH a photo. If the
    // required template slot is empty, we return `noTemplate` so the
    // admin knows they need to create the right template variant.
    let templateId: string | null | undefined;
    let templateType: TemplateType;

    if (body.hasReservationPhoto) {
      // Order HAS a reservation photo → must use the image template
      templateId = bookingProduct.imageTemplateId ?? null;
      templateType = 'image';
    } else {
      // Order has NO reservation photo → must use the text template
      templateId = bookingProduct.templateId;
      templateType = 'text';
    }

    if (!templateId) {
      // The required template slot is empty — the admin hasn't created
      // the right template variant for this product yet.
      const needed = templateType === 'image'
        ? 'image template (for orders with a reservation photo)'
        : 'text template (for orders without a reservation photo)';
      return NextResponse.json(
        {
          success: false,
          error: 'noTemplate',
          message: `No ${needed} has been assigned to this product. An admin must create one in the design app before designs can be generated for this order.`,
          productId: body.productId,
          bookingProductId: bookingProduct.id,
          templateType,
          hasReservationPhoto: body.hasReservationPhoto,
        },
        { status: 409 },
      );
    }

    // ── Load the template project ─────────────────────────────────────
    const projectsCollection = await getProjectsCollection();
    const template = await projectsCollection.findOne({
      id: templateId,
      kind: 'booking_template',
    });

    if (!template) {
      // The booking product references a template that no longer exists
      // (was deleted). Clear the stale reference so the caller gets a
      // consistent `noTemplate` response next time.
      const clearField =
        templateType === 'image' ? 'imageTemplateId' : 'templateId';
      await bookingCollection.updateOne(
        { id: bookingProduct.id },
        { $set: { [clearField]: null, updatedAt: Date.now() } },
      );
      return NextResponse.json(
        {
          success: false,
          error: 'templateNotFound',
          message: 'The template assigned to this product no longer exists. It may have been deleted. Please assign a new template.',
          productId: body.productId,
          bookingProductId: bookingProduct.id,
          templateType,
        },
        { status: 404 },
      );
    }

    // ── Create a design instance from the template ────────────────────
    // We don't render the template directly — instead we create a COPY
    // of the template as a new `kind: 'design'` project, with all
    // dynamic field layers inflated with the order's actual data
    // (customer name, reservation photo, etc.).
    //
    // This design instance is what gets:
    //   1. Saved to MongoDB as a standalone project
    //   2. Rendered to JPG via @napi-rs/canvas
    //   3. Uploaded to R2
    //   4. Opened in the editor when the admin clicks "edit design"
    //
    // The template itself is never modified — editing the design
    // instance doesn't affect future orders. The template only changes
    // when the user explicitly edits it in the design app's templates
    // section.
    const productName = resolveProductName(body.orderData);
    const designInstance = inflateTemplateToDesign(template, body.orderData, {
      orderNumber: body.orderNumber,
      productName,
      itemIndex: body.itemIndex,
    });

    // ── Render the design instance to JPG ─────────────────────────────
    // The renderer uses @napi-rs/canvas (native Rust canvas engine) to
    // draw each layer directly — no browser, no HTML, no Puppeteer.
    // Dynamic fields have already been inflated to concrete text/image
    // layers by inflateTemplateToDesign above.
    const jpgBuffer = await renderTemplateToJpg(designInstance, body.orderData);

    // ── Upload to R2 ──────────────────────────────────────────────────
    // Path: design/orders-design/{orderNumber}[-{itemIndex}].jpg
    const key = generateOrderDesignKey(body.orderNumber, body.itemIndex);
    // Use no-cache since this key gets overwritten when the admin
    // edits + saves the design (re-render endpoint). Without this,
    // Cloudflare CDN serves the stale cached version after overwrite.
    const result = await uploadToR2(key, jpgBuffer, 'image/jpeg', {
      cacheControl: 'no-cache',
    });

    // Store the R2 URL on the design instance so the re-render endpoint
    // (triggered when the admin edits + saves) can overwrite the same key.
    designInstance.orderDesignUrl = result.url;

    // Save the design instance to MongoDB (with the R2 URL)
    await projectsCollection.insertOne(designInstance);

    return NextResponse.json({
      success: true,
      data: {
        url: result.url,
        key: result.key,
        orderNumber: body.orderNumber,
        itemIndex: body.itemIndex,
        // The design instance's project ID — the admin panel opens
        // /editor/d/{projectId} to edit THIS design, not the template.
        projectId: designInstance.id,
        designName: designInstance.name,
        // Keep the template ID for reference (e.g. logging)
        templateId: template.id,
        templateName: template.name,
        templateType,
      },
    });
  } catch (error) {
    console.error('[POST /api/orders/generate-design]', error);
    const message = error instanceof Error ? error.message : 'serverError';
    return NextResponse.json(
      { success: false, error: 'serverError', message },
      { status: 500 },
    );
  }
}
