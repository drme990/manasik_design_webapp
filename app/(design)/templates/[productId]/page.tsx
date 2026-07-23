'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useTranslations } from '@/lib/i18n/strings';
import Link from 'next/link';
import { LuArrowRight, LuFilePen, LuFilePlus, LuTrash2 } from 'react-icons/lu';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import AlertDialog from '@/components/ui/AlertDialog';
import ProjectCardPreview from '@/components/projects/ProjectCardPreview';
import { getBookingProduct, getOrCreateTemplateProject, deleteBookingProduct } from '@/lib/store/booking-templates';
import { getProject } from '@/lib/store/projects';
import type { BookingProduct, Project } from '@/types';

export default function ProductTemplatesPage() {
    const t = useTranslations('templates');
    const router = useRouter();
    const { productId } = useParams<{ productId: string }>();
    const [product, setProduct] = useState<BookingProduct | null>(null);
    const [templateProject, setTemplateProject] = useState<Project | null>(null);
    const [loading, setLoading] = useState(true);
    const [opening, setOpening] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deleteLoading, setDeleteLoading] = useState(false);

    useEffect(() => {
        const load = async () => {
            const p = await getBookingProduct(productId);
            setProduct(p);
            if (p?.templateId) {
                const proj = await getProject(p.templateId);
                setTemplateProject(proj);
            }
            setLoading(false);
        };
        load();
    }, [productId]);

    const handleOpenTemplate = async () => {
        setOpening(true);
        try {
            const project = await getOrCreateTemplateProject(productId);
            router.push(`/editor/${project.id}`);
        } catch (err) {
            console.error('Failed to open template:', err);
            setOpening(false);
        }
    };

    const handleDeleteProduct = async () => {
        setDeleteLoading(true);
        await deleteBookingProduct(productId);
        setDeleteLoading(false);
        setDeleteOpen(false);
        router.push('/templates');
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

    if (!product) {
        return (
            <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-4xl">
                    <EmptyState
                        title={t('productNotFound')}
                        description={t('productNotFoundDesc')}
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
                        <h1 className="text-3xl font-bold text-foreground">{product.name}</h1>
                        <p className="mt-1 text-secondary">
                            {product.defaultCanvas.width} × {product.defaultCanvas.height}
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant="ghost"
                            onClick={() => setDeleteOpen(true)}
                            className="gap-2 text-error hover:bg-error/10"
                        >
                            <LuTrash2 className="h-4 w-4" />
                            {t('delete')}
                        </Button>
                    </div>
                </div>

                {/* Single template card */}
                <div className="grid gap-6 md:grid-cols-2">
                    {/* Preview / empty state */}
                    <Card className="overflow-hidden border-stroke bg-card-bg p-0" style={{ aspectRatio: product.defaultCanvas.width / product.defaultCanvas.height }}>
                        {templateProject ? (
                            <ProjectCardPreview project={templateProject} />
                        ) : (
                            <div className="flex h-full w-full flex-col items-center justify-center gap-3 border-2 border-dashed border-stroke p-6">
                                <LuFilePlus className="h-12 w-12 text-secondary" />
                                <p className="text-center text-sm text-secondary">{t('noTemplate')}</p>
                            </div>
                        )}
                    </Card>

                    {/* Action panel */}
                    <div className="flex flex-col justify-center gap-4">
                        <div className="flex items-center gap-3">
                            {templateProject ? (
                                <LuFilePen className="h-8 w-8 text-brand-primary" />
                            ) : (
                                <LuFilePlus className="h-8 w-8 text-brand-primary" />
                            )}
                            <div>
                                <h2 className="text-xl font-semibold text-foreground">
                                    {templateProject ? t('templateReady') : t('noTemplate')}
                                </h2>
                                <p className="text-sm text-secondary">
                                    {templateProject ? t('editTemplate') : t('createTemplate')}
                                </p>
                            </div>
                        </div>

                        <Button
                            onClick={handleOpenTemplate}
                            disabled={opening}
                            className="w-full gap-2"
                            size="lg"
                        >
                            {opening ? (
                                <span className="animate-pulse">...</span>
                            ) : (
                                <>
                                    {templateProject ? <LuFilePen className="h-5 w-5" /> : <LuFilePlus className="h-5 w-5" />}
                                    {templateProject ? t('editTemplate') : t('createTemplate')}
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </div>

            <AlertDialog
                isOpen={deleteOpen}
                onClose={() => setDeleteOpen(false)}
                title={t('deleteTitle')}
                description={t('deleteDescription')}
                confirmLabel={t('delete')}
                cancelLabel={t('cancel')}
                onConfirm={handleDeleteProduct}
                loading={deleteLoading}
                variant="danger"
            />
        </main>
    );
}
