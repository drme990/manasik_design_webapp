'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from '@/lib/i18n/strings';
import { LuArrowRight, LuFilePen, LuFilePlus, LuImage } from 'react-icons/lu';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { listBackendProducts, type BackendProduct } from '@/lib/store/backend-products';
import { listBookingProducts, getOrCreateBookingProduct } from '@/lib/store/booking-templates';
import type { BookingProduct } from '@/types';

/** Merged view model: a backend product with its linked booking product (if any) */
interface ProductWithTemplate {
    backend: BackendProduct;
    booking: BookingProduct | null;
}

export default function TemplatesPage() {
    const t = useTranslations('templates');
    const router = useRouter();
    const [products, setProducts] = useState<ProductWithTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [openingId, setOpeningId] = useState<string | null>(null);

    useEffect(() => {
        const load = async () => {
            const [backendProducts, bookingProducts] = await Promise.all([
                listBackendProducts(),
                listBookingProducts(),
            ]);

            // Match booking products to backend products by backendProductId
            const bookingByBackendId = new Map(
                bookingProducts.map((bp) => [bp.backendProductId, bp]),
            );

            const merged: ProductWithTemplate[] = backendProducts.map((bp) => ({
                backend: bp,
                booking: bookingByBackendId.get(bp.id) ?? null,
            }));

            setProducts(merged);
            setLoading(false);
        };
        load();
    }, []);

    const handleOpenProduct = async (item: ProductWithTemplate) => {
        setOpeningId(item.backend.id);
        try {
            // Find or create the booking product that links to this backend product
            const booking = await getOrCreateBookingProduct(item.backend);
            // Navigate to the product detail page using the booking product's ID
            router.push(`/templates/${booking.id}`);
        } catch (err) {
            console.error('Failed to open product:', err);
            setOpeningId(null);
        }
    };

    return (
        <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-6xl">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-foreground">{t('title')}</h1>
                    <p className="mt-1 text-secondary">{t('subtitle')}</p>
                </div>

                {loading ? (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {[...Array(6)].map((_, i) => (
                            <Card
                                key={i}
                                className="flex flex-col border-stroke bg-card-bg p-5"
                            >
                                <div className="mb-4 h-32 w-full animate-pulse rounded-xl bg-muted" />
                                <div className="mb-1 h-5 w-2/3 animate-pulse rounded bg-muted" />
                                <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
                                <div className="mt-auto h-4 w-1/3 animate-pulse rounded bg-muted" />
                            </Card>
                        ))}
                    </div>
                ) : products.length === 0 ? (
                    <EmptyState
                        title={t('emptyTitle')}
                        description={t('emptyDescription')}
                    />
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {products.map((item) => {
                            const hasTemplate = !!item.booking?.templateId;
                            const isOpening = openingId === item.backend.id;
                            return (
                                <Card
                                    key={item.backend.id}
                                    className="group relative flex flex-col overflow-hidden border-stroke bg-card-bg p-0 transition-colors hover:border-brand-primary"
                                >
                                    <button
                                        type="button"
                                        onClick={() => handleOpenProduct(item)}
                                        disabled={isOpening}
                                        className="flex flex-1 flex-col text-start"
                                    >
                                        {/* Product image */}
                                        <div className="relative aspect-square w-full overflow-hidden bg-muted">
                                            {item.backend.imageUri ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img
                                                    src={item.backend.imageUri}
                                                    alt={item.backend.name}
                                                    className="h-full w-full object-cover"
                                                />
                                            ) : (
                                                <div className="flex h-full w-full items-center justify-center">
                                                    <LuImage className="h-12 w-12 text-secondary/40" />
                                                </div>
                                            )}
                                            {/* Template status badge */}
                                            <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-card-bg/90 px-2.5 py-1 text-xs font-medium shadow-sm backdrop-blur">
                                                {hasTemplate ? (
                                                    <>
                                                        <LuFilePen className="h-3.5 w-3.5 text-brand-primary" />
                                                        <span className="text-brand-primary">{t('templateReady')}</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <LuFilePlus className="h-3.5 w-3.5 text-secondary" />
                                                        <span className="text-secondary">{t('noTemplate')}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        {/* Product info */}
                                        <div className="flex flex-1 flex-col p-4">
                                            <h3 className="mb-1 text-lg font-semibold text-foreground">
                                                {item.backend.name}
                                            </h3>
                                            <div className="mt-auto flex items-center gap-1 text-sm font-medium text-brand-primary">
                                                {isOpening ? (
                                                    <span className="animate-pulse">...</span>
                                                ) : (
                                                    <>
                                                        {hasTemplate ? t('editTemplate') : t('createTemplate')}
                                                        <LuArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" />
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </button>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </div>
        </main>
    );
}
