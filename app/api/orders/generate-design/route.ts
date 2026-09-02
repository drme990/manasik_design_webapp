import { NextRequest, NextResponse } from 'next/server';
import { getMongoClient } from '@/lib/db/mongodb';
import { getProjectCollection, DESIGN_PROJECTS_COLLECTION, BOOKING_TEMPLATES_COLLECTION } from '@/lib/db/project-collections';
import { uploadToR2, deleteFromR2, generateOrderDesignKey, generateBackgroundKey, extractKeyFromUrl, copyR2Object } from '@/lib/storage/r2';
import { renderTemplateToJpg } from '@/lib/render/canvas-renderer';
import { inflateTemplateToDesign } from '@/lib/render/inflate-template';
import { renderLimiter } from '@/lib/utils/concurrency-limiter';
import { createVersion, AUTO_ACTOR } from '@/lib/services/design-version-service';
import type { BookingProduct, TemplateType } from '@/types';

const BOOKING_COLLECTION = 'design_booking_products';

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

/**
 * Check if a size name is a "default" placeholder that should be ignored
 * in favor of the product name. Matches "default", "الافتراضي" (and
 * common variants) case-insensitively.
 */
function isDefaultSizeName(name: string): boolean {
  const n = name.trim().toLowerCase();
  return n === 'default' || n === 'الافتراضي' || n === 'الافتراضى';
}

/**
 * Extract the current item's design name from the order data payload.
 * Used to give the design instance a human-readable name.
 *
 * Priority: sizeDesignName → sizeName → productName.
 * The size design name is always used (even for the default size) so
 * each size can have its own design-specific label.
 * "default"/"الافتراضي" size names are skipped — product name is used.
 */
function resolveProductName(
  orderData: Record<string, unknown>,
): string | undefined {
  const item = (orderData as {
    item?: {
      productName?: { ar?: string; en?: string };
      sizeIndex?: number;
      sizeName?: { ar?: string; en?: string };
      sizeDesignName?: string;
    };
  }).item;
  if (!item) return undefined;
  // Priority: sizeDesignName → sizeName (skip "default") → productName
  if (item.sizeDesignName) return item.sizeDesignName;
  if (item.sizeName) {
    const sn = item.sizeName.ar || item.sizeName.en;
    if (sn && !isDefaultSizeName(sn)) return sn;
  }
  if (!item.productName) return undefined;
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
  /**
   * History trigger (see `order-history-enhanced.md` §7). The backend
   * knows whether this is an auto generation (webhook / status change)
   * or an admin regeneration (admin button). Defaults to 'auto' for
   * backward compatibility with older backends that don't send this.
   */
  trigger?: 'auto' | 'admin_regenerate';
  /**
   * Idempotency key for the saved version. When provided, the design app
   * uses it as the `operationId` so retries don't create duplicate
   * versions. When omitted, the design app derives a stable one from
   * (orderNumber, productId, itemIndex).
   */
  operationId?: string;
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
 *   4. Pick the right template based on `orderData.source` + `hasReservationPhoto`:
 *        - manasik + photo=true  → imageTemplateId
 *        - manasik + photo=false → templateId
 *        - ghadaq  + photo=true  → ghadaqImageTemplateId
 *        - ghadaq  + photo=false → ghadaqTemplateId
 *      STRICT matching — no fallback between types or apps. If the
 *      required template slot is empty → respond with `noTemplate`.
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

    // ── Look up the booking product by (backendProductId, sizeIndex) ──
    // The order's item includes sizeIndex (0 for the default size).
    // We try to find a booking product for the exact (product, size)
    // pair. If none exists for that specific size, we fall back to
    // sizeIndex=0 (the default size) for backward compatibility.
    const orderItem = (body.orderData as { item?: { sizeIndex?: number } }).item;
    const orderSizeIndex = orderItem?.sizeIndex ?? 0;

    const bookingCollection = await getBookingCollection();
    let bookingProduct = orderSizeIndex > 0
      ? await bookingCollection.findOne({
        backendProductId: body.productId,
        sizeIndex: orderSizeIndex,
      })
      : null;

    // Fallback to sizeIndex=0 if no size-specific booking product found
    if (!bookingProduct) {
      bookingProduct = await bookingCollection.findOne({
        backendProductId: body.productId,
        sizeIndex: 0,
      });
    }
    // Last resort: legacy booking products without sizeIndex (treated as 0)
    if (!bookingProduct) {
      bookingProduct = await bookingCollection.findOne({
        backendProductId: body.productId,
        sizeIndex: { $in: [null, undefined] } as Record<string, unknown>,
      } as Record<string, unknown>);
    }

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

    // ── Pick the right template based on order source + photo ────────
    // STRICT matching — no fallback between template types or apps:
    //   source='manasik' + hasPhoto=true  → imageTemplateId
    //   source='manasik' + hasPhoto=false → templateId
    //   source='ghadaq'  + hasPhoto=true  → ghadaqImageTemplateId
    //   source='ghadaq'  + hasPhoto=false → ghadaqTemplateId
    //
    // We never use an image template for an order without a photo, and
    // we never use a text template for an order WITH a photo. We also
    // never cross apps — a ghadaq order uses ghadaq templates only.
    // If the required slot is empty, we return `noTemplate`.
    const orderSource = (body.orderData as { source?: string }).source === 'ghadaq' ? 'ghadaq' : 'manasik';
    let templateId: string | null | undefined;
    let templateType: TemplateType;

    if (orderSource === 'ghadaq') {
      if (body.hasReservationPhoto) {
        templateId = bookingProduct.ghadaqImageTemplateId ?? null;
        templateType = 'image';
      } else {
        templateId = bookingProduct.ghadaqTemplateId ?? null;
        templateType = 'text';
      }
    } else {
      if (body.hasReservationPhoto) {
        templateId = bookingProduct.imageTemplateId ?? null;
        templateType = 'image';
      } else {
        templateId = bookingProduct.templateId;
        templateType = 'text';
      }
    }

    if (!templateId) {
      // The required template slot is empty — the admin hasn't created
      // the right template variant for this product + app yet.
      const needed = `${orderSource} ${templateType === 'image' ? 'image' : 'text'} template (for orders ${body.hasReservationPhoto ? 'with' : 'without'} a reservation photo)`;
      return NextResponse.json(
        {
          success: false,
          error: 'noTemplate',
          message: `No ${needed} has been assigned to this product. An admin must create one in the design app before designs can be generated for this order.`,
          productId: body.productId,
          bookingProductId: bookingProduct.id,
          templateType,
          appSource: orderSource,
          hasReservationPhoto: body.hasReservationPhoto,
        },
        { status: 409 },
      );
    }

    // ── Load the template project ─────────────────────────────────────
    // Exclude soft-deleted templates — they should not be used to
    // generate new order designs.
    const templatesCollection = await getProjectCollection(BOOKING_TEMPLATES_COLLECTION);
    const template = await templatesCollection.findOne({
      id: templateId,
      kind: 'booking_template',
      isDeleted: { $ne: true },
    });

    if (!template) {
      // The booking product references a template that no longer exists
      // (was deleted). Clear the stale reference so the caller gets a
      // consistent `noTemplate` response next time.
      const clearField =
        orderSource === 'ghadaq'
          ? (templateType === 'image' ? 'ghadaqImageTemplateId' : 'ghadaqTemplateId')
          : (templateType === 'image' ? 'imageTemplateId' : 'templateId');
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

    // ── Render + upload (concurrency-limited) ─────────────────────────
    // Canvas rendering via @napi-rs/canvas is CPU-bound. The
    // renderLimiter caps how many renders run in parallel so a burst
    // of paid orders doesn't overload the VPS CPU. Excess requests
    // queue up and process when a slot frees.
    //
    // The template lookup above is NOT limited (it's a fast DB read),
    // but everything from inflation onward is CPU/IO-heavy.
    return await renderLimiter.run(async () => {
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

      // ── Copy the template's BG to a per-design R2 key ─────────────────
      // This makes each order design self-contained — deleting the
      // template (or editing its BG) won't affect existing order designs.
      // The design instance's backgroundUri is updated to point to the
      // new copy. If the copy fails (e.g. R2 error), we fall back to the
      // template's original URL — the design still renders, it just
      // shares the template's BG (which is the pre-fix behavior).
      if (designInstance.backgroundUri) {
        const bgUrl = designInstance.backgroundUri;
        if (!bgUrl.startsWith('data:') && !bgUrl.startsWith('blob:')) {
          const sourceKey = extractKeyFromUrl(bgUrl);
          if (sourceKey) {
            const ext = sourceKey.split('.').pop() || 'jpg';
            const fakeFile = { name: `bg.${ext}`, type: 'image/jpeg' };
            const targetKey = generateBackgroundKey(designInstance.id, fakeFile);
            const copied = await copyR2Object(sourceKey, targetKey);
            if (copied) {
              designInstance.backgroundUri = copied.url;
            }
          }
        }
      }

      // ── Render the design instance to JPG ─────────────────────────────
      // The renderer uses @napi-rs/canvas (native Rust canvas engine) to
      // draw each layer directly — no browser, no HTML, no Puppeteer.
      // Dynamic fields have already been inflated to concrete text/image
      // layers by inflateTemplateToDesign above.
      const jpgBuffer = await renderTemplateToJpg(designInstance, body.orderData);

      // ── Upload to R2 ──────────────────────────────────────────────────
      // Path: design/orders-design/{orderNumber}[-{itemIndex}].jpg
      // Tier 2 — explicit delete + re-add with the same key.
      const key = generateOrderDesignKey(body.orderNumber, body.itemIndex);
      // Delete old (best-effort — may not exist on first generation)
      try { await deleteFromR2(key); } catch { /* first generation — fine */ }
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
      const designsCollection = await getProjectCollection(DESIGN_PROJECTS_COLLECTION);
      await designsCollection.insertOne(designInstance);

      // ── Save an immutable version snapshot ─────────────────────────────
      // Every generation creates an append-only version. The trigger is
      // determined by the backend ('auto' for webhook / status change,
      // 'admin_regenerate' for the admin "Regenerate" button). The
      // archived JPG is uploaded to a separate immutable R2 key (never
      // overwritten) so historical previews stay correct even after the
      // design is edited or regenerated.
      //
      // The archived URL is returned to the backend as the order's design
      // URL — every version has a unique URL, so the admin panel always
      // loads the correct image for the current version (no cache-busting
      // needed, no stale CDN entries).
      //
      // Idempotency: the backend sends a stable operationId for auto
      // generation (derived from the webhook event / order identity) so
      // retries don't create duplicate versions. For admin regeneration,
      // the backend sends a fresh operationId per request.
      const versionTrigger = body.trigger === 'admin_regenerate' ? 'admin_regenerate' : 'auto';
      const versionOperationId =
        body.operationId ||
        `auto:${body.orderNumber}:${body.productId}:${body.itemIndex ?? 1}`;
      let versionResult;
      try {
        versionResult = await createVersion({
          orderNumber: body.orderNumber,
          productId: body.productId,
          itemIndex: body.itemIndex,
          projectId: designInstance.id,
          jpgBuffer,
          project: designInstance,
          trigger: versionTrigger,
          actor: AUTO_ACTOR,
          operationId: versionOperationId,
        });
      } catch (versionError) {
        // Version creation is best-effort — the design itself was
        // generated and uploaded successfully. Don't fail the whole
        // request if history recording fails.
        console.error('[generate-design] createVersion failed:', versionError);
        versionResult = undefined;
      }

      // Use the archived (immutable) URL as the order's design URL when a
      // version was created. Fall back to the mutable URL if version
      // creation failed (best-effort — the design is still usable).
      const orderDesignUrl = versionResult?.version?.archivedUrl || result.url;

      return NextResponse.json({
        success: true,
        data: {
          // Return the archived (immutable) URL — every version has a
          // unique URL so the admin panel loads the right image instantly.
          url: orderDesignUrl,
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
          // The newly-created version number (or the existing one if this
          // was a duplicate operation). The backend uses this to set
          // `designUrls[].currentVersion` so the admin panel can mark the
          // current version in the history UI.
          version: versionResult?.version?.version,
        },
      });
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
