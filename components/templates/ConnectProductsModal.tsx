'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from '@/lib/i18n/strings';
import { LuImage, LuCheck, LuType, LuSearch } from 'react-icons/lu';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import ProjectCardPreview from '@/components/projects/ProjectCardPreview';
import {
    listBookingProducts,
    bulkUpdateBookingProducts,
    type BulkChangeInput,
} from '@/lib/store/booking-templates';
import { listBackendProducts, type BackendProduct } from '@/lib/store/backend-products';
import type { BookingProduct, Project } from '@/types';

interface ConnectProductsModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** The template to assign products to. */
    template: Project | null;
    /** Called after a successful save with the refreshed booking products. */
    onSaved?: (products: BookingProduct[]) => void;
}

/**
 * A connectable row — one (product, size) pair. Products with a single
 * size produce one row; products with multiple sizes produce one row
 * per size so the admin can connect each size to a different template.
 */
interface ConnectRow {
    /** Unique key: `${backendProductId}:${sizeIndex}` */
    key: string;
    backendProductId: string;
    sizeIndex: number;
    sizeName: string;
    /** Display name (product name + size name if multiple sizes) */
    label: string;
    productName: string;
    imageUri?: string;
    slug: string;
    /** True if the product has more than one size */
    hasMultipleSizes: boolean;
}

/**
 * Modal for connecting a template to backend product sizes.
 *
 * Each (product, size) pair has four template slots:
 *   - templateId              → manasik text template
 *   - imageTemplateId         → manasik image template
 *   - ghadaqTemplateId        → ghadaq text template
 *   - ghadaqImageTemplateId   → ghadaq image template
 *
 * This modal figures out which slot to use based on the template's
 * `templateType` + `appSource` and lets the admin toggle product sizes
 * on/off. Changes are staged locally and only persisted when Save is
 * clicked — no network calls on toggle.
 *
 * Constraint: each (product, size) slot can have at most ONE template.
 * If a size already has a different template in the same slot, it's
 * shown as disabled with an "already assigned" hint.
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
    // Staged changes keyed by row key (`${backendProductId}:${sizeIndex}`) →
    // new slot value (string | null). null = unassign, string = assign.
    const [stagedChanges, setStagedChanges] = useState<Record<string, string | null>>({});

    const templateType = template?.templateType ?? 'text';
    const appSource = template?.appSource ?? 'manasik';

    // Compute the slot key from templateType + appSource
    const slotKey =
        appSource === 'ghadaq'
            ? (templateType === 'image' ? 'ghadaqImageTemplateId' : 'ghadaqTemplateId')
            : (templateType === 'image' ? 'imageTemplateId' : 'templateId');
    const otherSlotKey =
        appSource === 'ghadaq'
            ? (templateType === 'image' ? 'ghadaqTemplateId' : 'ghadaqImageTemplateId')
            : (templateType === 'image' ? 'templateId' : 'imageTemplateId');

    // ── Build connectable rows from backend products ──────────────────
    // Each (product, size) pair becomes one row. Products with 1 size
    // produce a single row (no size suffix in the label). Products with
    // multiple sizes produce one row per size, with the size name shown.
    const rows = useMemo<ConnectRow[]>(() => {
        const result: ConnectRow[] = [];
        for (const p of backendProducts) {
            const hasMultipleSizes = p.sizes.length > 1;
            for (const size of p.sizes) {
                result.push({
                    key: `${p.id}:${size.index}`,
                    backendProductId: p.id,
                    sizeIndex: size.index,
                    sizeName: size.name,
                    label: hasMultipleSizes
                        ? `${p.name} — ${size.name}`
                        : p.name,
                    productName: p.name,
                    imageUri: p.imageUri,
                    slug: p.slug,
                    hasMultipleSizes,
                });
            }
        }
        return result;
    }, [backendProducts]);

    // Load data when modal opens
    useEffect(() => {
        if (!isOpen || !template) return;
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            setStagedChanges({});
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

    // Find the booking product for a (backendProductId, sizeIndex) pair
    const getBookingForRow = (
        backendId: string,
        sizeIndex: number,
    ): BookingProduct | undefined => {
        return bookingProducts.find(
            (bp) => bp.backendProductId === backendId && (bp.sizeIndex ?? 0) === sizeIndex,
        );
    };

    // The current effective value of the slot for a row (incl. staged)
    const getEffectiveSlotValue = (rowKey: string): string | null | undefined => {
        if (rowKey in stagedChanges) return stagedChanges[rowKey];
        const row = rows.find((r) => r.key === rowKey);
        if (!row) return undefined;
        const bp = getBookingForRow(row.backendProductId, row.sizeIndex);
        if (!bp) return undefined;
        return bp[slotKey as 'templateId'];
    };

    // Is this row selected (assigned to THIS template)?
    const isSelected = (rowKey: string): boolean => {
        return getEffectiveSlotValue(rowKey) === template?.id;
    };

    // Is this row blocked (has a DIFFERENT template in the same slot)?
    const isBlocked = (rowKey: string): boolean => {
        const val = getEffectiveSlotValue(rowKey);
        return !!val && val !== template?.id;
    };

    // Does this row have a template in the OTHER slot?
    const hasOtherSlot = (rowKey: string): boolean => {
        const row = rows.find((r) => r.key === rowKey);
        if (!row) return false;
        const bp = getBookingForRow(row.backendProductId, row.sizeIndex);
        if (!bp) return false;
        return !!bp[otherSlotKey as 'templateId'];
    };

    const handleToggle = (row: ConnectRow) => {
        if (!template) return;
        const currentVal = getEffectiveSlotValue(row.key);
        const newVal = currentVal === template.id ? null : template.id;
        setStagedChanges((prev) => ({ ...prev, [row.key]: newVal }));
    };

    // Filtered rows (search by product name or size name)
    const filteredRows = useMemo(() => {
        if (!search.trim()) return rows;
        const q = search.trim().toLowerCase();
        return rows.filter(
            (r) =>
                r.productName.toLowerCase().includes(q) ||
                r.sizeName.toLowerCase().includes(q),
        );
    }, [rows, search]);

    const selectedCount = rows.filter((r) => isSelected(r.key)).length;
    const hasChanges = Object.keys(stagedChanges).length > 0;

    const handleSave = async () => {
        if (!template || !hasChanges) {
            onClose();
            return;
        }
        setSaving(true);
        try {
            // Build bulk change list from staged changes (keyed by row key)
            const changes: BulkChangeInput[] = Object.entries(stagedChanges).map(
                ([rowKey, value]) => {
                    const row = rows.find((r) => r.key === rowKey);
                    if (!row) return { value } as BulkChangeInput;
                    const bp = getBookingForRow(row.backendProductId, row.sizeIndex);
                    return {
                        bookingProductId: bp?.id,
                        backendProductId: bp ? undefined : row.backendProductId,
                        sizeIndex: bp ? undefined : row.sizeIndex,
                        sizeName: bp ? undefined : row.sizeName,
                        backendSlug: bp ? undefined : row.slug,
                        name: bp ? undefined : row.productName,
                        imageUri: bp ? undefined : row.imageUri,
                        value,
                    };
                },
            );
            // Single request for all changes
            const updatedProducts = await bulkUpdateBookingProducts(slotKey, changes);
            // Merge returned products into state
            const updatedMap = new Map<string, BookingProduct>();
            for (const p of updatedProducts) updatedMap.set(p.id, p);
            const refreshed = [
                ...bookingProducts.map((bp) => updatedMap.get(bp.id) ?? bp),
                // Add newly created products not already in state
                ...updatedProducts.filter((p) => !bookingProducts.some((bp) => bp.id === p.id)),
            ];
            setBookingProducts(refreshed);
            setStagedChanges({});
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
        setStagedChanges({});
        onClose();
    };

    const templateTypeLabel =
        templateType === 'image' ? t('imageTemplate') : t('textTemplate');
    const appLabel = appSource === 'ghadaq' ? t('appGhadaq') : t('appManasik');

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title={template?.name ?? ''}
            description={
                template
                    ? `${templateTypeLabel} · ${appLabel} · ${template.canvasWidth} × ${template.canvasHeight}`
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

            {/* Product size list */}
            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
                </div>
            ) : filteredRows.length === 0 ? (
                <p className="py-8 text-center text-sm text-secondary">
                    {search ? t('noSearchResults') : t('emptyDescription')}
                </p>
            ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                    {filteredRows.map((row) => {
                        const selected = isSelected(row.key);
                        const blocked = isBlocked(row.key);
                        const otherSlot = hasOtherSlot(row.key);
                        return (
                            <button
                                key={row.key}
                                type="button"
                                onClick={() => handleToggle(row)}
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
                                    {row.imageUri ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={row.imageUri}
                                            alt={row.label}
                                            className="h-full w-full object-cover"
                                        />
                                    ) : (
                                        <div className="flex h-full w-full items-center justify-center">
                                            <LuImage className="h-5 w-5 text-secondary/40" />
                                        </div>
                                    )}
                                </div>

                                {/* Name + size + status */}
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium text-foreground">
                                        {row.label}
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
