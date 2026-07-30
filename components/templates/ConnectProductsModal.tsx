'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from '@/lib/i18n/strings';
import { LuImage, LuCheck, LuType, LuSearch } from 'react-icons/lu';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import ProjectCardPreview from '@/components/projects/ProjectCardPreview';
import {
    listBookingProducts,
    updateBookingProduct,
    createBookingProduct,
} from '@/lib/store/booking-templates';
import { listBackendProducts, type BackendProduct } from '@/lib/store/backend-products';
import type { BookingProduct, BookingProductUpdateInput, Project } from '@/types';

interface ConnectProductsModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** The template to assign products to. */
    template: Project | null;
    /** Called after a successful save with the refreshed booking products. */
    onSaved?: (products: BookingProduct[]) => void;
}

/**
 * Modal for connecting a template to backend products.
 *
 * Each product has two template slots:
 *   - `templateId`       → text (no-image) template
 *   - `imageTemplateId`  → image template
 *
 * This modal figures out which slot to use based on the template's
 * `templateType` and lets the admin toggle products on/off. Changes are
 * staged locally and only persisted when the Save button is clicked —
 * this avoids a network round-trip on every toggle.
 *
 * Constraint: a product can have at most ONE text template and ONE image
 * template. If a product already has a different template in the same
 * slot, it's shown as disabled with a "already assigned" hint.
 */
export default function ConnectProductsModal({
    isOpen,
    onClose,
    template,
    onSaved,
}: ConnectProductsModalProps) {
    const t = useTranslations('templates');
    const ui = useTranslations('ui');

    const [bookingProducts, setBookingProducts] = useState<BookingProduct[]>([]);
    const [backendProducts, setBackendProducts] = useState<BackendProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [search, setSearch] = useState('');
    // Staged changes: map of bookingProductId → new slot value
    // (only contains entries that differ from the original)
    const [stagedChanges, setStagedChanges] = useState<Record<string, string | null>>({});
    // Newly created booking products (not yet persisted) keyed by backendProductId
    const [pendingCreates, setPendingCreates] = useState<Record<string, BookingProduct>>({});

    const templateType = template?.templateType ?? 'text';
    const slotKey = templateType === 'image' ? 'imageTemplateId' : 'templateId';
    const otherSlotKey = templateType === 'image' ? 'templateId' : 'imageTemplateId';

    // Load data when modal opens
    useEffect(() => {
        if (!isOpen || !template) return;
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            setStagedChanges({});
            setPendingCreates({});
            setSearch('');
            const [products, backend] = await Promise.all([
                listBookingProducts(),
                listBackendProducts(),
            ]);
            if (cancelled) return;
            setBookingProducts(products);
            setBackendProducts(backend);
            setLoading(false);
        };
        load();
        return () => {
            cancelled = true;
        };
    }, [isOpen, template]);

    // Find the booking product for a backend product (incl. pending creates)
    const getBookingForBackend = (backendId: string): BookingProduct | undefined => {
        if (pendingCreates[backendId]) return pendingCreates[backendId];
        return bookingProducts.find((bp) => bp.backendProductId === backendId);
    };

    // The current effective value of the slot for a product (incl. staged)
    const getEffectiveSlotValue = (backendId: string): string | null | undefined => {
        const bp = getBookingForBackend(backendId);
        if (!bp) return undefined;
        if (bp.id in stagedChanges) return stagedChanges[bp.id];
        return bp[slotKey as 'templateId'];
    };

    // Is this product selected (assigned to THIS template)?
    const isSelected = (backendId: string): boolean => {
        return getEffectiveSlotValue(backendId) === template?.id;
    };

    // Is this product blocked (has a DIFFERENT template in the same slot)?
    const isBlocked = (backendId: string): boolean => {
        const val = getEffectiveSlotValue(backendId);
        return !!val && val !== template?.id;
    };

    // Does this product have a template in the OTHER slot?
    const hasOtherSlot = (backendId: string): boolean => {
        const bp = getBookingForBackend(backendId);
        if (!bp) return false;
        // Read the original (non-staged) value for the other slot — we
        // don't stage changes to the other slot in this modal.
        return !!bp[otherSlotKey as 'templateId'];
    };

    const handleToggle = async (backend: BackendProduct) => {
        if (!template) return;
        let bp = getBookingForBackend(backend.id);
        // Auto-create the booking product if it doesn't exist yet.
        // We create it immediately so we have an ID to stage changes against.
        if (!bp) {
            try {
                bp = await createBookingProduct({
                    backendProductId: backend.id,
                    backendSlug: backend.slug,
                    name: backend.name,
                    imageUri: backend.imageUri,
                    defaultCanvas: { width: 1080, height: 1080 },
                });
                setPendingCreates((prev) => ({ ...prev, [backend.id]: bp! }));
                setBookingProducts((prev) => [...prev, bp!]);
            } catch (err) {
                console.error('Failed to create booking product:', err);
                return;
            }
        }
        const currentVal = getEffectiveSlotValue(backend.id);
        const newVal = currentVal === template.id ? null : template.id;
        setStagedChanges((prev) => ({ ...prev, [bp!.id]: newVal }));
    };

    // Filtered + searched backend products
    const filteredBackend = useMemo(() => {
        if (!search.trim()) return backendProducts;
        const q = search.trim().toLowerCase();
        return backendProducts.filter((p) => p.name.toLowerCase().includes(q));
    }, [backendProducts, search]);

    const selectedCount = backendProducts.filter((b) => isSelected(b.id)).length;
    const hasChanges = Object.keys(stagedChanges).length > 0;

    const handleSave = async () => {
        if (!template || !hasChanges) {
            onClose();
            return;
        }
        setSaving(true);
        try {
            // Apply all staged changes in parallel
            const entries = Object.entries(stagedChanges);
            const results = await Promise.all(
                entries.map(([bpId, newSlotValue]) =>
                    updateBookingProduct(bpId, {
                        [slotKey]: newSlotValue,
                    } as Partial<BookingProductUpdateInput>).then(
                        (updated) => ({ bpId, updated }),
                    ),
                ),
            );
            // Merge results back into bookingProducts state
            const updatedMap = new Map<string, BookingProduct>();
            for (const { bpId, updated } of results) {
                if (updated) updatedMap.set(bpId, updated);
            }
            const refreshed = bookingProducts.map((bp) =>
                updatedMap.get(bp.id) ?? bp,
            );
            setBookingProducts(refreshed);
            setStagedChanges({});
            setPendingCreates({});
            onSaved?.(refreshed);
            onClose();
        } catch (err) {
            console.error('Failed to save product assignments:', err);
        } finally {
            setSaving(false);
        }
    };

    const handleClose = () => {
        if (saving) return;
        // Discard staged changes on close
        setStagedChanges({});
        setPendingCreates({});
        onClose();
    };

    const templateTypeLabel =
        templateType === 'image' ? t('imageTemplate') : t('textTemplate');

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title={template?.name ?? ''}
            description={
                template
                    ? `${templateTypeLabel} · ${template.canvasWidth} × ${template.canvasHeight}`
                    : undefined
            }
            size="lg"
            footer={
                <>
                    <Button
                        variant="ghost"
                        onClick={handleClose}
                        disabled={saving}
                    >
                        {ui('cancel')}
                    </Button>
                    <Button
                        variant="primary"
                        onClick={handleSave}
                        loading={saving}
                        disabled={!hasChanges}
                    >
                        {ui('save')}
                        {hasChanges && (
                            <span className="ms-1.5 rounded-full bg-primary-text/20 px-1.5 py-0.5 text-xs">
                                {Object.keys(stagedChanges).length}
                            </span>
                        )}
                    </Button>
                </>
            }
        >
            {/* Template preview + type badge */}
            {template && (
                <div className="mb-5 flex gap-4">
                    <div
                        className="h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-stroke bg-muted"
                        style={{
                            aspectRatio: `${template.canvasWidth} / ${template.canvasHeight}`,
                        }}
                    >
                        <ProjectCardPreview project={template} className="h-full w-full" />
                    </div>
                    <div className="flex flex-col justify-center gap-1">
                        <span
                            className={`inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${templateType === 'image'
                                ? 'bg-blue-500/10 text-blue-600'
                                : 'bg-emerald-500/10 text-emerald-600'
                                }`}
                        >
                            {templateType === 'image' ? (
                                <LuImage className="h-3.5 w-3.5" />
                            ) : (
                                <LuType className="h-3.5 w-3.5" />
                            )}
                            {templateTypeLabel}
                        </span>
                        <p className="text-xs text-secondary">
                            {selectedCount > 0
                                ? t('assignedProductsCount').replace(
                                    '{count}',
                                    String(selectedCount),
                                )
                                : t('noProductsAssigned')}
                        </p>
                    </div>
                </div>
            )}

            {/* Constraint hint */}
            <p className="mb-4 rounded-lg bg-muted/50 p-3 text-xs text-secondary">
                {templateType === 'image'
                    ? t('imageTemplateAssignHint')
                    : t('textTemplateAssignHint')}
            </p>

            {/* Search */}
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-stroke bg-card-bg px-3 py-2">
                <LuSearch className="h-4 w-4 text-secondary" />
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t('searchProducts')}
                    className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-secondary"
                />
            </div>

            {/* Product list */}
            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
                </div>
            ) : filteredBackend.length === 0 ? (
                <p className="py-8 text-center text-sm text-secondary">
                    {search ? t('noSearchResults') : t('emptyDescription')}
                </p>
            ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                    {filteredBackend.map((backend) => {
                        const selected = isSelected(backend.id);
                        const blocked = isBlocked(backend.id);
                        const otherSlot = hasOtherSlot(backend.id);
                        return (
                            <button
                                key={backend.id}
                                type="button"
                                onClick={() => handleToggle(backend)}
                                disabled={blocked}
                                className={`flex items-center gap-3 rounded-xl border-2 p-3 text-start transition-colors ${selected
                                    ? 'border-brand-primary bg-brand-primary-light/10'
                                    : blocked
                                        ? 'border-stroke bg-card-bg opacity-60'
                                        : 'border-stroke bg-card-bg hover:border-brand-primary hover:bg-brand-primary-light/5'
                                    }`}
                            >
                                {/* Product image */}
                                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-muted">
                                    {backend.imageUri ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={backend.imageUri}
                                            alt={backend.name}
                                            className="h-full w-full object-cover"
                                        />
                                    ) : (
                                        <div className="flex h-full w-full items-center justify-center">
                                            <LuImage className="h-5 w-5 text-secondary/40" />
                                        </div>
                                    )}
                                </div>

                                {/* Name + status */}
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium text-foreground">
                                        {backend.name}
                                    </p>
                                    {blocked && (
                                        <p className="text-xs text-secondary">
                                            {t('productAlreadyAssigned')}
                                        </p>
                                    )}
                                    {otherSlot && !blocked && (
                                        <p className="text-xs text-emerald-600">
                                            {templateType === 'image'
                                                ? t('hasTextTemplate')
                                                : t('hasImageTemplate')}
                                        </p>
                                    )}
                                </div>

                                {/* Check indicator */}
                                <div
                                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors ${selected
                                        ? 'bg-brand-primary text-primary-text'
                                        : 'border-2 border-stroke'
                                        }`}
                                >
                                    {selected && <LuCheck className="h-4 w-4" />}
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}
        </Modal>
    );
}
