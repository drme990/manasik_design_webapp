'use client';

import { useState } from 'react';
import { LuCheck, LuX, LuCombine } from 'react-icons/lu';
import Drawer from '@/components/ui/Drawer';
import { ORDER_FIELD_MAP, TEXT_ORDER_FIELDS, CATEGORY_LABELS } from '@/lib/constants/order-fields';
import type { OrderFieldCategory } from '@/lib/constants/order-fields';
import { useTranslations } from '@/lib/i18n/strings';

interface CombineFieldsDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    /** The primary field's variableId (already on the layer — can't be toggled off) */
    primaryFieldId: string;
    /** Currently combined field IDs (additional fields beyond the primary) */
    combinedFieldIds: string[];
    /** Called when the user saves their selection */
    onSave: (combinedIds: string[]) => void;
}

export default function CombineFieldsDrawer({
    isOpen,
    onClose,
    primaryFieldId,
    combinedFieldIds,
    onSave,
}: CombineFieldsDrawerProps) {
    const t = useTranslations('editor');

    // Local state — initialized from props. The parent passes a `key`
    // that changes each time the drawer opens, so this component remounts
    // and the initial state is always fresh — no useEffect needed.
    const [staged, setStaged] = useState<string[]>(combinedFieldIds);

    const toggle = (fieldId: string) => {
        setStaged((prev) =>
            prev.includes(fieldId)
                ? prev.filter((id) => id !== fieldId)
                : [...prev, fieldId]
        );
    };

    const handleSave = () => {
        onSave(staged);
        onClose();
    };

    const handleClear = () => {
        setStaged([]);
        onSave([]);
        onClose();
    };

    const primaryField = ORDER_FIELD_MAP[primaryFieldId];
    // Only text fields can be combined, and exclude the primary field
    const availableFields = TEXT_ORDER_FIELDS.filter((f) => f.id !== primaryFieldId);

    // Group available fields by category (same as DynamicFieldsDrawer)
    const categoryOrder: OrderFieldCategory[] = ['custom', 'reservation', 'order'];
    const groupedFields = categoryOrder
        .map((cat) => ({
            category: cat,
            label: CATEGORY_LABELS[cat],
            fields: availableFields.filter((f) => f.category === cat),
        }))
        .filter((g) => g.fields.length > 0);

    return (
        <Drawer
            isOpen={isOpen}
            onClose={onClose}
            title={t('toolbars.dynamicField.combineTitle')}
            height="twoThirds"
        >
            <div className="flex h-full flex-col">
                {/* Primary field — always shown, can't be removed */}
                <div className="mb-4">
                    <h3 className="mb-2 text-sm font-bold text-secondary">
                        {t('toolbars.dynamicField.combinePrimary')}
                    </h3>
                    <div className="flex items-center gap-2 rounded-xl border border-brand-primary bg-brand-primary-light/10 p-3">
                        <LuCombine className="h-5 w-5 shrink-0 text-brand-primary" />
                        <span className="text-sm font-medium text-foreground">
                            {primaryField?.label || primaryFieldId}
                        </span>
                        <span className="ms-auto text-xs text-secondary">
                            {t('toolbars.dynamicField.combinePrimaryHint')}
                        </span>
                    </div>
                </div>

                {/* Additional fields — toggle on/off, grouped by category */}
                <div className="flex-1 overflow-y-auto">
                    <h3 className="mb-2 text-sm font-bold text-secondary">
                        {t('toolbars.dynamicField.combineAdditional')}
                    </h3>
                    <p className="mb-3 text-xs text-secondary">
                        {t('toolbars.dynamicField.combineHint')}
                    </p>
                    <div className="space-y-5">
                        {groupedFields.map((group) => (
                            <div key={group.category}>
                                <h4 className="mb-2 text-xs font-bold text-secondary">
                                    {group.label}
                                </h4>
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                    {group.fields.map((field) => {
                                        const isSelected = staged.includes(field.id);
                                        return (
                                            <button
                                                key={field.id}
                                                onClick={() => toggle(field.id)}
                                                className={`flex items-center gap-2 rounded-xl border p-3 transition-colors ${isSelected
                                                    ? 'border-brand-primary bg-brand-primary text-primary-text'
                                                    : 'border-stroke bg-card-bg hover:border-brand-primary hover:bg-brand-primary-light/10'
                                                    }`}
                                            >
                                                {isSelected ? (
                                                    <LuCheck className="h-5 w-5 shrink-0" />
                                                ) : (
                                                    <LuCombine className="h-5 w-5 shrink-0 text-brand-primary" />
                                                )}
                                                <span className="truncate text-sm font-medium">{field.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer — Save / Clear */}
                <div className="flex gap-3 border-t border-stroke pt-4">
                    <button
                        onClick={handleSave}
                        className="flex-1 rounded-xl bg-brand-primary px-4 py-2.5 text-sm font-medium text-primary-text transition-colors hover:bg-brand-primary-dark"
                    >
                        {t('save')}
                    </button>
                    {combinedFieldIds.length > 0 && (
                        <button
                            onClick={handleClear}
                            className="flex items-center gap-1.5 rounded-xl border border-stroke px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                        >
                            <LuX className="h-4 w-4" />
                            {t('clear')}
                        </button>
                    )}
                </div>
            </div>
        </Drawer>
    );
}
