'use client';

import { LuImage, LuType } from 'react-icons/lu';
import Drawer from '@/components/ui/Drawer';

export interface OrderField {
    id: string;
    label: string;
    type: 'text' | 'image';
    placeholder: string;
}

interface DynamicFieldsDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    fields: OrderField[];
    onAddField: (field: OrderField) => void;
}

export default function DynamicFieldsDrawer({
    isOpen,
    onClose,
    title,
    fields,
    onAddField,
}: DynamicFieldsDrawerProps) {
    return (
        <Drawer
            isOpen={isOpen}
            onClose={onClose}
            title={title}
            height="twoThirds"
        >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {fields.map((field) => (
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
        </Drawer>
    );
}
