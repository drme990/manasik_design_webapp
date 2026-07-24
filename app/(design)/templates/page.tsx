'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useTranslations } from '@/lib/i18n/strings';
import { LuPlus, LuPencil, LuTrash2, LuImage, LuBoxes } from 'react-icons/lu';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import Drawer from '@/components/ui/Drawer';
import AlertDialog from '@/components/ui/AlertDialog';
import ProjectCardPreview from '@/components/projects/ProjectCardPreview';
import { useProjectStore } from '@/lib/store/use-project-store';
import { listBookingProducts } from '@/lib/store/booking-templates';
import { ASPECT_RATIOS } from '@/lib/constants/presets';
import type { BookingProduct } from '@/types';

export default function TemplatesPage() {
    const t = useTranslations('templates');
    // Subscribe to the zustand store — templates list is always in sync
    const templates = useProjectStore((s) => s.templates);
    const templatesLoading = useProjectStore((s) => s.templatesLoading);
    const fetchTemplates = useProjectStore((s) => s.fetchTemplates);
    const storeCreateProject = useProjectStore((s) => s.createProject);
    const storeDeleteProject = useProjectStore((s) => s.deleteProject);
    // loading is true only on the very first fetch (no data yet)
    const loading = templatesLoading && templates.length === 0;
    const [bookingProducts, setBookingProducts] = useState<BookingProduct[]>([]);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [customWidth, setCustomWidth] = useState('1080');
    const [customHeight, setCustomHeight] = useState('1080');
    const [deleteTemplateId, setDeleteTemplateId] = useState<string | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const galleryInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const load = async () => {
            fetchTemplates();
            const products = await listBookingProducts();
            setBookingProducts(products);
        };
        load();
    }, [fetchTemplates]);

    // Count how many products are assigned to a template
    const getProductCount = (templateId: string): number =>
        bookingProducts.filter((bp) => bp.templateId === templateId).length;

    const handleCreate = async (preset: typeof ASPECT_RATIOS[number]) => {
        const project = await storeCreateProject({
            name: `${preset.label} ${preset.name} — ${new Date().toLocaleDateString()}`,
            kind: 'booking_template',
            canvasWidth: preset.width,
            canvasHeight: preset.height,
        });
        setDrawerOpen(false);
        window.location.assign(`/editor/${project.id}`);
    };

    const handleCreateCustom = async () => {
        const width = Number(customWidth);
        const height = Number(customHeight);
        if (width <= 0 || height <= 0) return;
        const project = await storeCreateProject({
            name: `${t('newTemplate')} — ${width}×${height}`,
            kind: 'booking_template',
            canvasWidth: width,
            canvasHeight: height,
        });
        setDrawerOpen(false);
        window.location.assign(`/editor/${project.id}`);
    };

    const handleDelete = async () => {
        if (!deleteTemplateId) return;
        setDeleteLoading(true);
        try {
            // Optimistic: store removes from the list immediately
            await storeDeleteProject(deleteTemplateId);
        } catch (err) {
            console.error('Failed to delete template:', err);
        }
        setDeleteLoading(false);
        setDeleteTemplateId(null);
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
                            <div
                                key={i}
                                className="flex flex-col overflow-hidden rounded-2xl border border-stroke bg-card-bg p-0 shadow-sm"
                            >
                                <div className="aspect-square w-full animate-pulse bg-muted" />
                                <div className="p-4">
                                    <div className="mb-2 h-5 w-2/3 animate-pulse rounded bg-muted" />
                                    <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : templates.length === 0 ? (
                    <EmptyState
                        title={t('emptyTitle')}
                        description={t('emptyDescription')}
                    />
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {templates.map((template) => {
                            const productCount = getProductCount(template.id);
                            return (
                                <div
                                    key={template.id}
                                    className="group relative flex flex-col overflow-hidden rounded-2xl border border-stroke bg-card-bg p-0 shadow-sm transition-shadow hover:shadow-md hover:border-brand-primary"
                                >
                                    {/* Preview — click opens editor */}
                                    <Link
                                        href={`/editor/${template.id}`}
                                        className="block"
                                    >
                                        <div
                                            className="relative w-full overflow-hidden bg-muted"
                                            style={{
                                                aspectRatio: `${template.canvasWidth} / ${template.canvasHeight}`,
                                                backgroundColor: template.backgroundColor ?? '#ffffff',
                                            }}
                                        >
                                            <ProjectCardPreview project={template} className="h-full w-full" />
                                        </div>
                                    </Link>

                                    {/* Info + actions */}
                                    <div className="flex flex-1 flex-col p-4">
                                        <h3 className="mb-1 line-clamp-1 text-lg font-semibold text-foreground">
                                            {template.name}
                                        </h3>
                                        <div className="mb-3 flex items-center gap-1.5 text-sm text-secondary">
                                            <LuBoxes className="h-4 w-4" />
                                            {productCount > 0
                                                ? t('assignedProductsCount').replace('{count}', String(productCount))
                                                : t('noProductsAssigned')}
                                        </div>

                                        <div className="mt-auto flex items-center gap-2">
                                            <Link
                                                href={`/templates/${template.id}`}
                                                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-stroke px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-brand-primary hover:bg-brand-primary-light/10"
                                            >
                                                <LuBoxes className="h-4 w-4" />
                                                {t('assignProducts')}
                                            </Link>
                                            <Link
                                                href={`/editor/${template.id}`}
                                                className="flex items-center justify-center rounded-lg border border-stroke p-2 text-foreground transition-colors hover:border-brand-primary hover:bg-brand-primary-light/10"
                                                aria-label={t('editTemplate')}
                                            >
                                                <LuPencil className="h-4 w-4" />
                                            </Link>
                                            <button
                                                type="button"
                                                onClick={() => setDeleteTemplateId(template.id)}
                                                className="flex items-center justify-center rounded-lg border border-stroke p-2 text-error transition-colors hover:border-error hover:bg-error/10"
                                                aria-label={t('delete')}
                                            >
                                                <LuTrash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Floating + button — same as projects page */}
            <button
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="fixed bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-brand-primary text-primary-text shadow-xl transition-transform hover:scale-105 active:scale-95"
                aria-label={t('newTemplate')}
            >
                <LuPlus className="h-7 w-7" />
            </button>

            {/* New template drawer — same size/structure as projects page */}
            <Drawer
                isOpen={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                title={t('newTemplate')}
                height="twoThirds"
                footer={
                    <Button variant="primary" onClick={handleCreateCustom} className="w-full">
                        <LuPlus className="ms-2 h-5 w-5" />
                        {t('create')}
                    </Button>
                }
            >
                {/* Pick from gallery — creates a template with the image's aspect ratio */}
                <div className="mb-6">
                    <input
                        ref={galleryInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                    />
                    <button
                        type="button"
                        onClick={() => galleryInputRef.current?.click()}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-stroke bg-card-bg px-4 py-4 text-sm font-medium text-foreground transition-colors hover:border-brand-primary hover:bg-brand-primary-light/10"
                    >
                        <LuImage className="h-5 w-5 text-brand-primary" />
                        {t('pickFromGallery')}
                    </button>
                </div>

                {/* Preset sizes — horizontal scroll */}
                <div className="mb-6">
                    <h3 className="mb-3 text-sm font-medium text-secondary">{t('newTemplate')}</h3>
                    <div className="no-scrollbar flex gap-3 overflow-x-auto pb-2">
                        {ASPECT_RATIOS.map((preset) => {
                            const ratio = preset.width / preset.height;
                            const boxW = ratio >= 1 ? 48 : Math.round(48 * ratio);
                            const boxH = ratio >= 1 ? Math.round(48 / ratio) : 48;
                            return (
                                <button
                                    key={preset.label}
                                    onClick={() => handleCreate(preset)}
                                    className="flex w-20 shrink-0 flex-col items-center gap-2 rounded-xl border border-stroke bg-card-bg p-3 text-center transition-colors hover:border-brand-primary hover:bg-brand-primary-light/10"
                                >
                                    <div className="flex h-12 items-center justify-center">
                                        <div
                                            className="rounded border-2 border-foreground/40 bg-foreground/5"
                                            style={{ width: boxW, height: boxH }}
                                        />
                                    </div>
                                    <p className="text-xs font-semibold text-foreground">{preset.label}</p>
                                    <p className="text-xs text-secondary">{preset.name}</p>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Custom size */}
                <div>
                    <h3 className="mb-3 text-sm font-medium text-secondary">{t('customSize')}</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            label={t('width')}
                            type="text"
                            inputMode="numeric"
                            value={customWidth}
                            onChange={(e) => setCustomWidth(e.target.value)}
                        />
                        <Input
                            label={t('height')}
                            type="text"
                            inputMode="numeric"
                            value={customHeight}
                            onChange={(e) => setCustomHeight(e.target.value)}
                        />
                    </div>
                </div>
            </Drawer>

            {/* Delete confirmation */}
            <AlertDialog
                isOpen={!!deleteTemplateId}
                onClose={() => setDeleteTemplateId(null)}
                title={t('deleteTitle')}
                description={t('deleteDescription')}
                confirmLabel={t('delete')}
                cancelLabel={t('cancel')}
                onConfirm={handleDelete}
                loading={deleteLoading}
                variant="danger"
            />
        </main>
    );
}
