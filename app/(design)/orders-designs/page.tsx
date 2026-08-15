import { redirect } from 'next/navigation';

/**
 * This page has been moved to the admin panel.
 * Redirect to the admin panel's order-designs page.
 */
export default function OrdersDesignsPage() {
  redirect('/');
}
