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
 * Also includes OLD design-app collection names that have been renamed —
 * they're reserved so they're never accidentally reused.
 * Sorted alphabetically.
 */
export const reservedCollections: readonly string[] = [
    'accounts',
    'activitylogs',
    'appearances',
    'banned_ips',
    'booking_products',           // old name, now design_booking_products
    'bookings',
    'categories',
    'countries',
    'coupons',
    'cronlogs',
    'customercountryhistories',
    'customerhistories',
    'customerrefhistories',
    'order_design_versions',      // old name, now design_order_versions
    'order_design_version_counters', // old name, now design_order_version_counters
    'orderchangehistories',
    'ordersequences',
    'orders',
    'partialpaymentguardlocks',
    'passwordresets',
    'passwordresettokens',
    'paymentlinks',
    'pdf_projects',               // old name, now design_pdf_projects
    'products',
    'projects',                   // old name, now split into design_projects + design_booking_templates
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
 * All are prefixed with `design_` to avoid collisions with backend-owned
 * collections in the shared `manasik` database.
 */
export const designAppCollections: string[] = [
    'design_booking_products',
    'design_booking_templates',
    'design_order_version_counters',
    'design_order_versions',
    'design_pdf_projects',
    'design_projects',
    'design_saved_colors',
    'design_user_fonts',
    'design_user_shapes',
];
