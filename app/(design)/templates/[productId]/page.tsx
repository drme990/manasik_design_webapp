'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from '@/lib/i18n/strings';
import Link from 'next/link';
import { LuArrowRight, LuPencil, LuBoxes, LuCheck, LuImage } from 'react-icons/lu';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import ProjectCardPreview from '@/components/projects/ProjectCardPreview';
import { useProjectStore } from '@/lib/store/use-project-store';
import { listBookingProducts, updateBookingProduct, createBookingProduct } from '@/lib/store/booking-templates';
import { listBackendProducts, type BackendProduct } from '@/lib/store/backend-products';
import type { Project, BookingProduct } from '@/types';

export default function TemplateDetailPage() {
    const t = useTranslations('templates');
    const { productId: templateId } = useParams<{ productId: string }>();
    const storeGetProject = useProjectStore((s) => s.getProject);
    const [template, setTemplate] = useState<Project | null>(null);
    const [bookingProducts, setBookingProducts] = useState<BookingProduct[]>([]);
    const [backendProducts, setBackendProducts] = useState<BackendProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [togglingId, setTogglingId] = useState<string | null>(null);

    useEffect(() => {
        const load = async () => {
            const [proj, products, backend] = await Promise.all([
                storeGetProject(templateId),
                listBookingProducts(),
                listBackendProducts(),
            ]);
            setTemplate(proj);
            setBookingProducts(products);
            setBackendProducts(backend);
            setLoading(false);
        };
        load();
    }, [templateId, storeGetProject]);

    // Find the booking product for a given backend product
    const getBookingForBackend = (backendId: string): BookingProduct | undefined =>
        bookingProducts.find((bp) => bp.backendProductId === backendId);

    // Is this backend product assigned to THIS template?
    const isAssignedToThis = (backendId: string): boolean => {
        const bp = getBookingForBackend(backendId);
        return bp?.templateId === templateId;
    };

    // Is this backend product assigned to a DIFFERENT template?
    const isAssignedToOther = (backendId: string): boolean => {
        const bp = getBookingForBackend(backendId);
        return !!bp?.templateId && bp.templateId !== templateId;
    };

    const handleToggleProduct = async (backendProduct: BackendProduct) => {
        let bp = getBookingForBackend(backendProduct.id);
        setTogglingId(backendProduct.id);
        try {
            // Auto-create the booking product if it doesn't exist yet
            if (!bp) {
                bp = await createBookingProduct({
                    backendProductId: backendProduct.id,
                    backendSlug: backendProduct.slug,
                    name: backendProduct.name,
                    imageUri: backendProduct.imageUri,
                    defaultCanvas: { width: 1080, height: 1080 },
                });
                setBookingProducts((prev) => [...prev, bp!]);
            }

            const currentlyAssigned = bp.templateId === templateId;
            if (currentlyAssigned) {
                // Unassign — set templateId to null
                const updated = await updateBookingProduct(bp.id, { templateId: null });
                if (updated) {
                    setBookingProducts((prev) =>
                        prev.map((p) => (p.id === bp!.id ? updated : p)),
                    );
                }
            } else {
                // Assign to this template
                const updated = await updateBookingProduct(bp.id, { templateId });
                if (updated) {
                    setBookingProducts((prev) =>
                        prev.map((p) => (p.id === bp!.id ? updated : p)),
                    );
                }
            }
        } catch (err) {
            console.error('Failed to toggle product assignment:', err);
        }
        setTogglingId(null);
    };

    if (loading) {
        return (
            <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-4xl">
                    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <div className="mb-2 h-4 w-32 animate-pulse rounded bg-muted" />
                            <div className="h-8 w-64 animate-pulse rounded bg-muted" />
                        </div>
                    </div>
                    <Card className="overflow-hidden border-stroke bg-card-bg p-0" style={{ aspectRatio: 1 }}>
                        <div className="flex h-full w-full items-center justify-center">
                            <div className="h-12 w-12 animate-pulse rounded-full bg-muted" />
                        </div>
                    </Card>
                </div>
            </main>
        );
    }

    if (!template) {
        return (
            <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-4xl">
                    <EmptyState
                        title={t('templateNotFound')}
                        description={t('templateNotFoundDesc')}
                        action={
                            <Link href="/templates">
                                <Button>{t('backToTemplates')}</Button>
                            </Link>
                        }
                    />
                </div>
            </main>
        );
    }

    const assignedCount = bookingProducts.filter((bp) => bp.templateId === templateId).length;

    return (
        <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-4xl">
                {/* Header */}
                <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <Link
                            href="/templates"
                            className="mb-2 inline-flex items-center gap-1 text-sm text-secondary transition-colors hover:text-foreground"
                        >
                            <LuArrowRight className="h-4 w-4 rtl:rotate-180" />
                            {t('backToTemplates')}
                        </Link>
                        <h1 className="text-3xl font-bold text-foreground">{template.name}</h1>
                        <p className="mt-1 text-secondary">
                            {template.canvasWidth} × {template.canvasHeight}
                            {' · '}
                            {assignedCount > 0
                                ? t('assignedProductsCount').replace('{count}', String(assignedCount))
                                : t('noProductsAssigned')}
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Link href={`/editor/${template.id}`}>
                            <Button variant="outline" className="gap-2">
                                <LuPencil className="h-4 w-4" />
                                {t('editTemplate')}
                            </Button>
                        </Link>
                    </div>
                </div>

                {/* Template preview */}
                <Card
                    className="mb-8 overflow-hidden border-stroke bg-card-bg p-0"
                    style={{ aspectRatio: template.canvasWidth / template.canvasHeight }}
                >
                    <ProjectCardPreview project={template} />
                </Card>

                {/* Product assignment section */}
                <div className="mb-4 flex items-center gap-2">
                    <LuBoxes className="h-5 w-5 text-brand-primary" />
                    <h2 className="text-xl font-semibold text-foreground">{t('assignedProducts')}</h2>
                </div>
                <p className="mb-4 text-sm text-secondary">{t('assignProductsHint')}</p>

                {backendProducts.length === 0 ? (
                    <EmptyState
                        title={t('emptyTitle')}
                        description={t('emptyDescription')}
                    />
                ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                        {backendProducts.map((backend) => {
                            const assigned = isAssignedToThis(backend.id);
                            const assignedToOther = isAssignedToOther(backend.id);
                            const isToggling = togglingId === backend.id;
                            return (
                                <button
                                    key={backend.id}
                                    type="button"
                                    onClick={() => handleToggleProduct(backend)}
                                    disabled={isToggling}
                                    className={`flex items-center gap-3 rounded-xl border-2 p-3 text-start transition-colors ${assigned
                                        ? 'border-brand-primary bg-brand-primary-light/10'
                                        : assignedToOther
                                            ? 'border-stroke bg-card-bg opacity-60'
                                            : 'border-stroke bg-card-bg hover:border-brand-primary hover:bg-brand-primary-light/5'
                                        }`}
                                >
                                    {/* Product image */}
                                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                                        {backend.imageUri ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={backend.imageUri}
                                                alt={backend.name}
                                                className="h-full w-full object-cover"
                                            />
                                        ) : (
                                            <div className="flex h-full w-full items-center justify-center">
                                                <LuImage className="h-6 w-6 text-secondary/40" />
                                            </div>
                                        )}
                                    </div>

                                    {/* Product name + status */}
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate font-medium text-foreground">
                                            {backend.name}
                                        </p>
                                        {assignedToOther && (
                                            <p className="text-xs text-secondary">
                                                {t('productAlreadyAssigned')}
                                            </p>
                                        )}
                                    </div>

                                    {/* Check / toggle indicator */}
                                    <div
                                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors ${assigned
                                            ? 'bg-brand-primary text-primary-text'
                                            : 'border-2 border-stroke'
                                            }`}
                                    >
                                        {assigned && <LuCheck className="h-4 w-4" />}
                                        {isToggling && (
                                            <div className="h-3 w-3 animate-pulse rounded-full bg-current" />
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </main>
    );
}
