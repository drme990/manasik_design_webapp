'use client';

import { useTranslations } from '@/lib/i18n/strings';
import { LuGlobe, LuRotateCcw } from 'react-icons/lu';
import type { DynamicFieldLayer } from '@/types';
import { ORDER_FIELD_MAP } from '@/lib/constants/order-fields';
import { resolveFontFamily } from '@/lib/constants/fonts';

export interface CombineFieldsBottomBarProps {
    layer: DynamicFieldLayer;
    /** Currently selected field ID: null = global, string = specific field */
    selectedFieldId: string | null;
    /** Called when the user selects a field (or null for global) */
    onSelectField: (varId: string | null) => void;
    /** Reset a field's individual style overrides */
    onResetField: (varId: string) => void;
}

export default function CombineFieldsBottomBar({
    layer,
    selectedFieldId,
    onSelectField,
    onResetField,
}: CombineFieldsBottomBarProps) {
    const t = useTranslations('editor');

    if (!layer.combinedFields || layer.combinedFields.length === 0) return null;

    const allFieldIds = [layer.variableId, ...layer.combinedFields];
    const styles = layer.combinedFieldStyles ?? {};

    return (
        <div className="absolute bottom-20 left-0 right-0 z-10 border-t border-stroke bg-toolbar-bg/95 backdrop-blur-sm" dir="ltr">
            <div className="no-scrollbar flex h-12 items-center gap-1 overflow-x-auto px-2 py-1">
                {/* Global tab */}
                <button
                    onClick={() => onSelectField(null)}
                    className={`flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 transition-colors ${selectedFieldId === null
                        ? 'border-brand-primary bg-brand-primary text-primary-text'
                        : 'border-transparent text-foreground hover:bg-muted'
                        }`}
                >
                    <LuGlobe className="h-4 w-4" />
                    <span className="text-xs font-medium">{t('toolbars.dynamicField.combineFieldGlobal')}</span>
                </button>

                <div className="h-6 w-px shrink-0 bg-stroke" />

                {/* Individual field tabs */}
                {allFieldIds.map((varId) => {
                    const fieldInfo = ORDER_FIELD_MAP[varId];
                    const fieldLabel = fieldInfo?.label || fieldInfo?.placeholder || varId;
                    const fieldStyle = styles[varId] ?? {};
                    const effectiveFont = fieldStyle.fontFamily ?? layer.fontFamily ?? 'Expo Arabic';
                    const effectiveBold = fieldStyle.bold ?? layer.bold ?? true;
                    const effectiveItalic = fieldStyle.italic ?? layer.italic ?? false;
                    const hasOverride = varId in styles;
                    const isSelected = selectedFieldId === varId;

                    return (
                        <button
                            key={varId}
                            onClick={() => onSelectField(varId)}
                            className={`flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 transition-colors ${isSelected
                                ? 'border-brand-primary bg-brand-primary text-primary-text'
                                : 'border-transparent text-foreground hover:bg-muted'
                                }`}
                        >
                            <span
                                className="text-xs font-medium"
                                style={{
                                    fontFamily: resolveFontFamily(effectiveFont),
                                    fontWeight: effectiveBold ? 700 : 400,
                                    fontStyle: effectiveItalic ? 'italic' : 'normal',
                                }}
                            >
                                {fieldLabel}
                            </span>
                            {hasOverride && !isSelected && (
                                <span
                                    className="flex h-4 w-4 items-center justify-center rounded-full bg-brand-primary/10"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onResetField(varId);
                                    }}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.stopPropagation();
                                            onResetField(varId);
                                        }
                                    }}
                                >
                                    <LuRotateCcw className="h-3 w-3 text-brand-primary" />
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
