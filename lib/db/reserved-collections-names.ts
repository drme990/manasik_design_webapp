/**
 * Reserved MongoDB collection names used by the existing apps.
 *
 * Purpose:
 * - `reservedCollections`: collections already owned by the Manasik / Ghadaq
 *   customer apps and the admin-panel backend. The design app must NOT create
 *   collections with these names to avoid collisions in the shared `manasik`
 *   database.
 * - `designAppCollections`: collections created and used by THIS design app.
 *   Add every new collection name here as soon as it is introduced so we can
 *   keep track of what is safe for the design app to use.
 */

/**
 * Collections already used by Manasik, Ghadaq, and the admin panel backend.
 * Sorted alphabetically.
 */
export const reservedCollections: readonly string[] = [
    'accounts',
    'activitylogs',
    'appearances',
    'banned_ips',
    'bookings',
    'categories',
    'countries',
    'coupons',
    'cronlogs',
    'customercountryhistories',
    'customerhistories',
    'customerrefhistories',
    'orderchangehistories',
    'ordersequences',
    'orders',
    'partialpaymentguardlocks',
    'passwordresets',
    'passwordresettokens',
    'paymentlinks',
    'products',
    'ratelimits',
    'ref_tracker_events',
    'referrals',
    'supplierorders',
    'supplierpayouts',
    'suppliers',
    'terminallogs',
    'transactions',
    'usertiers',
    'users_admin_panel',
    'users_ghadaq',
    'users_manasik',
    'webhookevents',
];

/**
 * Collections used by this design webapp.
 * Add any new collection name here when it is introduced.
 */
export const designAppCollections: string[] = [
    'design_saved_colors',
];
