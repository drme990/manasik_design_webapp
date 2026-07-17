'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from '@/lib/i18n/strings';
import { LuPlus, LuTrash2, LuArrowRight } from 'react-icons/lu';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import Modal from '@/components/ui/Modal';
import AlertDialog from '@/components/ui/AlertDialog';
import {
    listBookingProducts,
    createBookingProduct,
    deleteBookingProduct,
    seedDefaultProducts,
} from '@/lib/store/booking-templates';
import type { BookingProduct } from '@/types';

export default function TemplatesPage() {
    const t = useTranslations('templates');
    const router = useRouter();
    const [products, setProducts] = useState<BookingProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [createOpen, setCreateOpen] = useState(false);
    const [newName, setNewName] = useState('');
    const [newWidth, setNewWidth] = useState('1080');
    const [newHeight, setNewHeight] = useState('1080');
    const [deleteProductId, setDeleteProductId] = useState<string | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);

    useEffect(() => {
        const load = async () => {
            await seedDefaultProducts();
            const data = await listBookingProducts();
            setProducts(data.sort((a, b) => b.updatedAt - a.updatedAt));
            setLoading(false);
        };
        load();
    }, []);

    const handleCreate = async () => {
        if (!newName.trim()) return;
        const width = Number(newWidth);
        const height = Number(newHeight);
        if (width <= 0 || height <= 0) return;

        const product = await createBookingProduct({
            name: newName.trim(),
            defaultCanvas: { width, height },
        });
        setProducts((prev) => [product, ...prev]);
        setCreateOpen(false);
        setNewName('');
        router.push(`/templates/${product.id}`);
    };

    const handleDelete = async () => {
        if (!deleteProductId) return;
        setDeleteLoading(true);
        await deleteBookingProduct(deleteProductId);
        setProducts((prev) => prev.filter((p) => p.id !== deleteProductId));
        setDeleteLoading(false);
        setDeleteProductId(null);
    };

    const filledCount = (product: BookingProduct) => {
        let count = 0;
        Object.values(product.templates).forEach((model) => {
            Object.values(model).forEach((id) => {
                if (id) count++;
            });
        });
        return count;
    };

    return (
        <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-6xl">
                <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-foreground">{t('title')}</h1>
                        <p className="mt-1 text-secondary">{t('subtitle')}</p>
                    </div>
                    <Button onClick={() => setCreateOpen(true)} className="gap-2">
                        <LuPlus className="h-4 w-4" />
                        {t('newProduct')}
                    </Button>
                </div>

                {loading ? (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {[...Array(6)].map((_, i) => (
                            <Card
                                key={i}
                                className="flex flex-col border-stroke bg-card-bg p-5"
                            >
                                <div className="mb-4 flex h-14 w-14 animate-pulse items-center justify-center rounded-xl bg-muted" />
                                <div className="mb-1 h-5 w-2/3 animate-pulse rounded bg-muted" />
                                <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
                                <div className="mt-4 h-4 w-1/2 animate-pulse rounded bg-muted" />
                                <div className="mt-auto h-4 w-1/3 animate-pulse rounded bg-muted" />
                            </Card>
                        ))}
                    </div>
                ) : products.length === 0 ? (
                    <EmptyState
                        title={t('emptyTitle')}
                        description={t('emptyDescription')}
                        action={
                            <Button onClick={() => setCreateOpen(true)}>{t('createFirst')}</Button>
                        }
                    />
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {products.map((product) => (
                            <Card
                                key={product.id}
                                className="group relative flex flex-col overflow-hidden border-stroke bg-card-bg p-0 transition-colors hover:border-brand-primary"
                            >
                                <button
                                    type="button"
                                    onClick={() => router.push(`/templates/${product.id}`)}
                                    className="flex flex-1 flex-col p-5 text-start"
                                >
                                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
                                        <span className="text-2xl font-bold">
                                            {filledCount(product)}
                                        </span>
                                        <span className="text-sm">/6</span>
                                    </div>
                                    <h3 className="mb-1 text-lg font-semibold text-foreground">
                                        {product.name}
                                    </h3>
                                    <p className="text-sm text-secondary">
                                        {product.defaultCanvas.width} × {product.defaultCanvas.height}
                                    </p>
                                    <p className="mt-4 text-sm text-secondary">
                                        {filledCount(product) === 0
                                            ? t('noTemplates')
                                            : t('templatesCount', { count: filledCount(product) })}
                                    </p>
                                    <div className="mt-auto flex items-center gap-1 text-sm font-medium text-brand-primary">
                                        {t('manageTemplates')}
                                        <LuArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" />
                                    </div>
                                </button>

                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setDeleteProductId(product.id);
                                    }}
                                    className="absolute right-3 top-3 rounded-full p-2 text-secondary opacity-0 transition-colors hover:bg-error/10 hover:text-error group-hover:opacity-100 rtl:right-auto rtl:left-3"
                                    aria-label={t('delete')}
                                >
                                    <LuTrash2 className="h-4 w-4" />
                                </button>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            <Modal
                isOpen={createOpen}
                onClose={() => setCreateOpen(false)}
                title={t('createProductTitle')}
            >
                <div className="space-y-4">
                    <div>
                        <label className="mb-1.5 block text-sm font-medium text-foreground">
                            {t('productName')}
                        </label>
                        <Input
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder={t('productNamePlaceholder')}
                            autoFocus
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="mb-1.5 block text-sm font-medium text-foreground">
                                {t('width')}
                            </label>
                            <Input
                                type="number"
                                value={newWidth}
                                onChange={(e) => setNewWidth(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="mb-1.5 block text-sm font-medium text-foreground">
                                {t('height')}
                            </label>
                            <Input
                                type="number"
                                value={newHeight}
                                onChange={(e) => setNewHeight(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => setCreateOpen(false)}>
                            {t('cancel')}
                        </Button>
                        <Button onClick={handleCreate} disabled={!newName.trim()}>
                            {t('create')}
                        </Button>
                    </div>
                </div>
            </Modal>

            <AlertDialog
                isOpen={!!deleteProductId}
                onClose={() => setDeleteProductId(null)}
                title={t('deleteTitle')}
                description={t('deleteDescription')}
                confirmLabel={t('delete')}
                onConfirm={handleDelete}
                loading={deleteLoading}
                variant="danger"
            />
        </main>
    );
}
