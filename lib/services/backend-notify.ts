/**
 * Backend notification helper.
 *
 * The design app calls these functions to tell the backend about events
 * that happen on the design-app side (e.g. "I just re-rendered a design
 * and created a new version — update the order's URL").
 *
 * All calls use the shared `x-callback-secret` header for authentication
 * (same secret as the generate-design flow). No user JWT is needed —
 * these are server-to-server calls.
 *
 * All calls are best-effort: errors are logged but not thrown. The
 * caller's primary operation (render, save, etc.) should not fail just
 * because the backend notification failed.
 */

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
 * Get the backend's base URL. The design app calls the backend's internal
 * endpoints (e.g. `/api/internal/update-design-url`) using this URL.
 *
 * Env var: `BACKEND_URL` (e.g. https://api.manasik.net)
 */
function getBackendUrl(): string {
  return (process.env.BACKEND_URL || '').replace(/\/$/, '');
}

/**
 * Get the shared callback secret. Must match `DESIGN_APP_CALLBACK_SECRET`
 * on the backend.
 *
 * Env var: `CALLBACK_SECRET`
 */
function getCallbackSecret(): string | null {
  return process.env.CALLBACK_SECRET || null;
}

/**
 * Notify the backend that a new saved version was created for an order's
 * design. The backend updates the order's `designUrls[].url` to point to
 * the new immutable archived URL, so the admin panel loads the new image
 * instantly.
 *
 * Best-effort: errors are logged but not thrown.
 */
export async function notifyBackendOfDesignUrlUpdate(
  params: UpdateDesignUrlParams,
): Promise<void> {
  const baseUrl = getBackendUrl();
  if (!baseUrl) {
    return;
  }

  const secret = getCallbackSecret();
  if (!secret) {
    return;
  }

  try {
    const response = await fetch(`${baseUrl}/api/internal/update-design-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-callback-secret': secret,
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      await response.text().catch(() => '');
    }
  } catch {
    // Best-effort — the sync-designs endpoint will catch up
  }
}
