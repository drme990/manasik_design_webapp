/**
 * Shared SSO cookie name — MUST match the backend's admin panel cookie
 * name (`admin_panel-token`) so that a user logged into either app is
 * automatically authenticated on the other.
 *
 * Both apps are on subdomains of the same root domain (e.g.
 * admin.manasik.net and design.manasik.net). The cookie is scoped to
 * the parent domain via the COOKIE_DOMAIN env var so it's sent to both.
 */
export const AUTH_COOKIE_NAME = 'admin_panel-token';
export const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

/**
 * Parent domain for the SSO cookie (e.g. '.manasik.net').
 * When set, the cookie is scoped to the parent domain so both
 * admin.manasik.net and design.manasik.net receive it.
 * When unset (local dev), the cookie is scoped to the current host.
 */
export function getCookieDomain(): string | undefined {
    // Only scope the cookie to the parent domain in production.
    // In local dev (localhost), setting Domain=.manasik.net causes the
    // browser to silently reject the cookie, breaking login.
    if (process.env.NODE_ENV !== 'production') return undefined;
    return process.env.COOKIE_DOMAIN || undefined;
}
