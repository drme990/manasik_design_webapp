'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { LuArrowLeft, LuPlus, LuPencil } from 'react-icons/lu';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import ProjectCardPreview from '@/components/projects/ProjectCardPreview';
import { getBookingProduct, getOrCreateTemplateProject } from '@/lib/store/booking-templates';
import { getProject } from '@/lib/store/projects';
import type { BookingProduct, BookingModel, BookingVariant, Project } from '@/types';

const MODELS: BookingModel[] = ['withImage', 'withoutImage'];
const VARIANTS: BookingVariant[] = ['single', 'double', 'multiple'];

export default function ProductTemplatesPage() {
    const t = useTranslations('templates');
    const router = useRouter();
    const { productId } = useParams<{ productId: string }>();
    const [product, setProduct] = useState<BookingProduct | null>(null);
    const [projects, setProjects] = useState<Record<string, Project | null>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            const p = await getBookingProduct(productId);
            setProduct(p);
            if (p) {
                const map: Record<string, Project | null> = {};
                for (const model of MODELS) {
                    for (const variant of VARIANTS) {
                        const id = p.templates[model][variant];
                        if (id) {
                            map[`${model}-${variant}`] = await getProject(id);
                        }
                    }
                }
                setProjects(map);
            }
            setLoading(false);
        };
        load();
    }, [productId]);

    const handleOpenSlot = async (model: BookingModel, variant: BookingVariant) => {
        const project = await getOrCreateTemplateProject(productId, model, variant);
        router.push(`/editor/${project.id}`);
    };

    if (loading) {
        return (
            <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-6xl">
                    <div className="mb-8 h-8 w-48 animate-pulse rounded bg-muted" />
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {[...Array(6)].map((_, i) => (
                            <Card key={i} className="aspect-4/3 animate-pulse bg-muted" />
                        ))}
                    </div>
                </div>
            </main>
        );
    }

    if (!product) {
        return (
            <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-6xl">
                    <EmptyState
                        title={t('productNotFound')}
                        description={t('productNotFoundDesc')}
                        action={
                            <Link
                                href="/templates"
                                className="inline-flex items-center justify-center rounded-lg bg-brand-primary px-4 py-2 text-base font-medium text-primary-text transition-all duration-200 hover:bg-brand-primary-dark focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2"
                            >
                                {t('backToTemplates')}
                            </Link>
                        }
                    />
                </div>
            </main>
        );
    }

    return (
        <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-6xl">
                <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <Link
                            href="/templates"
                            className="mb-2 -ml-2 inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                        >
                            <LuArrowLeft className="h-4 w-4" />
                            {t('backToTemplates')}
                        </Link>
                        <h1 className="text-3xl font-bold text-foreground">{product.name}</h1>
                        <p className="mt-1 text-secondary">
                            {product.defaultCanvas.width} × {product.defaultCanvas.height}
                        </p>
                    </div>
                </div>

                <div className="space-y-8">
                    {MODELS.map((model) => (
                        <section key={model}>
                            <h2 className="mb-4 text-xl font-semibold text-foreground">
                                {t(`model.${model}`)}
                            </h2>
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                {VARIANTS.map((variant) => {
                                    const key = `${model}-${variant}`;
                                    const project = projects[key];
                                    return (
                                        <Card
                                            key={variant}
                                            className="group relative overflow-hidden border-stroke bg-card-bg p-0 transition-colors hover:border-brand-primary"
                                            style={{
                                                aspectRatio: product.defaultCanvas.width / product.defaultCanvas.height,
                                            }}
                                        >
                                            {project ? (
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenSlot(model, variant)}
                                                    className="relative block h-full w-full"
                                                >
                                                    <ProjectCardPreview
                                                        project={project}
                                                        className="h-full w-full"
                                                    />
                                                    <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent p-4">
                                                        <p className="truncate font-medium text-white">
                                                            {t(`variant.${variant}`)}
                                                        </p>
                                                        <p className="text-xs text-white/80">{t('editTemplate')}</p>
                                                    </div>
                                                    <div className="absolute right-2 top-2 rounded-full bg-white/90 p-1.5 text-foreground opacity-0 transition-opacity group-hover:opacity-100">
                                                        <LuPencil className="h-4 w-4" />
                                                    </div>
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenSlot(model, variant)}
                                                    className="flex h-full w-full flex-col items-center justify-center gap-2 border-2 border-dashed border-stroke p-4 text-secondary transition-colors hover:border-brand-primary hover:text-brand-primary"
                                                >
                                                    <LuPlus className="h-8 w-8" />
                                                    <span className="font-medium">{t(`variant.${variant}`)}</span>
                                                    <span className="text-sm">{t('createTemplate')}</span>
                                                </button>
                                            )}
                                        </Card>
                                    );
                                })}
                            </div>
                        </section>
                    ))}
                </div>
            </div>
        </main>
    );
}
