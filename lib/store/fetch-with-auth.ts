/**
 * Shared authenticated-fetch helper used by all client-side data stores
 * (projects, PDF projects, booking products, ...).
 *
 * Centralizes the request defaults (same-origin credentials, JSON headers)
 * and error handling so every store doesn't redefine the same function.
 */
export async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'unknown' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}
