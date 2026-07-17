'use client';

import { useState, useRef } from 'react';
import { useTranslations } from '@/lib/i18n/strings';
import { cn } from '@/lib/utils/cn';
import { LuPlus, LuX, LuSave } from 'react-icons/lu';
import ThemeToggle from '@/components/shared/ThemeToggle';
import ColorPickerDrawer from '@/components/ui/ColorPickerDrawer';
import { useSavedColors } from '@/lib/hooks/useSavedColors';

export default function SettingsPage() {
    const t = useTranslations('settings');
    const colorT = useTranslations('editor.colorPicker');
    const { savedColors, addColor, removeColor, saveColors, hasUnsavedChanges } = useSavedColors();
    const [pickerOpen, setPickerOpen] = useState(false);
    const [pickerValue, setPickerValue] = useState('#000000');
    const eyeDropperReopenRef = useRef(false);

    const handleOpenPicker = () => {
        setPickerValue('#000000');
        setPickerOpen(true);
    };

    // Eye dropper: close drawer → pick color from screen → reopen drawer with picked color
    const handleEyeDropper = async () => {
        const EyeDropperAPI = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
        if (!EyeDropperAPI) return;

        eyeDropperReopenRef.current = true;
        setPickerOpen(false);

        try {
            const eyeDropper = new EyeDropperAPI();
            const result = await eyeDropper.open();
            setPickerValue(result.sRGBHex.toUpperCase());
        } catch {
            // User cancelled
        } finally {
            eyeDropperReopenRef.current = false;
            setPickerOpen(true);
        }
    };

    return (
        <div className="mx-auto max-w-2xl space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
                <p className="mt-1 text-sm text-secondary">{t('subtitle')}</p>
            </div>

            {/* Theme selection */}
            <section className="rounded-2xl border border-stroke bg-card-bg p-6 space-y-4">
                <h2 className="text-lg font-semibold text-foreground">{t('themeSection')}</h2>
                <div className="flex items-center justify-between">
                    <span className="shrink-0 text-sm font-medium text-secondary">{t('themeSection')}</span>
                    <ThemeToggle className="flex-1 max-w-xs [&_select]:w-full" />
                </div>
            </section>

            {/* Saved colors */}
            <section className="rounded-2xl border border-stroke bg-card-bg p-6 space-y-4">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <h2 className="text-lg font-semibold text-foreground">{t('savedColorsSection')}</h2>
                        <p className="text-sm text-secondary">{t('savedColorsSectionDesc')}</p>
                    </div>
                    <button
                        type="button"
                        onClick={saveColors}
                        disabled={!hasUnsavedChanges}
                        className={cn(
                            'flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                            hasUnsavedChanges
                                ? 'bg-brand-primary text-primary-text hover:bg-brand-primary-dark'
                                : 'bg-muted text-secondary cursor-default'
                        )}
                    >
                        <LuSave className="h-4 w-4" />
                        {t('saveColors')}
                    </button>
                </div>

                {/* Add color button */}
                <button
                    type="button"
                    onClick={handleOpenPicker}
                    className="flex items-center gap-1.5 rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-primary-text transition-colors hover:bg-brand-primary-dark"
                >
                    <LuPlus className="h-4 w-4" />
                    {t('addColor')}
                </button>

                {/* Saved colors grid */}
                {savedColors.length > 0 ? (
                    <div className="flex flex-wrap gap-3">
                        {savedColors.map((color, index) => (
                            <div key={`${color}-${index}`} className="group relative">
                                <div
                                    className="h-12 w-12 rounded-lg border-2 border-stroke"
                                    style={{ backgroundColor: color }}
                                    title={color}
                                />
                                <button
                                    onClick={() => removeColor(color)}
                                    className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-error text-white opacity-0 transition-opacity group-hover:opacity-100"
                                    aria-label={colorT('removeColor')}
                                >
                                    <LuX className="h-3 w-3" />
                                </button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-secondary">{colorT('savedColorsEmpty')}</p>
                )}
            </section>

            {/* Color picker drawer — for adding new saved colors */}
            <ColorPickerDrawer
                isOpen={pickerOpen}
                onClose={() => {
                    addColor(pickerValue.toUpperCase());
                    setPickerOpen(false);
                }}
                onEyeDropper={handleEyeDropper}
                value={pickerValue}
                onChange={(c) => setPickerValue(c)}
                title={t('addColor')}
                savedColors={savedColors}
            />
        </div>
    );
}
