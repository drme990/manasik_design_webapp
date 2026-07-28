'use client';

import { LuImage, LuType } from 'react-icons/lu';
import Drawer from '@/components/ui/Drawer';
import { ORDER_FIELDS_BY_CATEGORY } from '@/lib/constants/order-fields';
import type { OrderField, OrderFieldCategory } from '@/lib/constants/order-fields';

export type { OrderField, OrderFieldCategory };

interface DynamicFieldsDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    /** Fields to display (already filtered by template type if needed).
     *  If provided, overrides the default grouped list. */
    fields?: OrderField[];
    onAddField: (field: OrderField) => void;
}

export default function DynamicFieldsDrawer({
    isOpen,
    onClose,
    title,
    fields,
    onAddField,
}: DynamicFieldsDrawerProps) {
    // If the caller provides a flat list, group it by category using the
    // canonical category labels. Otherwise use the pre-grouped list.
    const groups = fields
        ? groupFieldsByCategory(fields)
        : ORDER_FIELDS_BY_CATEGORY;

    return (
        <Drawer
            isOpen={isOpen}
            onClose={onClose}
            title={title}
            height="twoThirds"
        >
            <div className="space-y-6">
                {groups.map((group) => (
                    <div key={group.category}>
                        {/* Category header */}
                        <h3 className="mb-3 text-sm font-bold text-secondary">
                            {group.label}
                        </h3>
                        {/* Field buttons */}
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                            {group.fields.map((field) => (
                                <button
                                    key={field.id}
                                    onClick={() => onAddField(field)}
                                    className="flex items-center gap-2 rounded-xl border border-stroke bg-card-bg p-3 transition-colors hover:border-brand-primary hover:bg-brand-primary-light/10"
                                >
                                    {field.type === 'image' ? (
                                        <LuImage className="h-5 w-5 shrink-0 text-brand-primary" />
                                    ) : (
                                        <LuType className="h-5 w-5 shrink-0 text-brand-primary" />
                                    )}
                                    <span className="truncate text-sm font-medium text-foreground">{field.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </Drawer>
    );
}

/** Group a flat field list by category, preserving order */
function groupFieldsByCategory(
    fields: OrderField[],
): { category: OrderFieldCategory; label: string; fields: OrderField[] }[] {
    const order: OrderFieldCategory[] = ['order', 'reservation', 'custom'];
    const labels: Record<OrderFieldCategory, string> = {
        order: 'حقول الطلب',
        reservation: 'حقول الحجز',
        custom: 'حقول مخصصة',
    };
    return order
        .map((cat) => ({
            category: cat,
            label: labels[cat],
            fields: fields.filter((f) => f.category === cat),
        }))
        .filter((g) => g.fields.length > 0);
}
