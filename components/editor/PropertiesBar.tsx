'use client';

import { RefObject } from 'react';
import { useTranslations } from '@/lib/i18n/strings';
import {
    LuType,
    LuImage,
    LuTrash2,
    LuCopy,
    LuPencil,
    LuCrop,
    LuFlipHorizontal,
    LuFlipVertical,
    LuLayoutGrid,
    LuColumns3,
    LuPalette,
    LuDroplet,
    LuBold,
    LuItalic,
    LuSquare,
    LuPenLine,
    LuCircle,
    LuAlignVerticalJustifyCenter,
    LuAlignLeft,
    LuAlignCenter,
    LuAlignRight,
    LuAlignStartVertical,
    LuAlignCenterVertical,
    LuAlignEndVertical,
    LuALargeSmall,
    LuArrowLeftRight,
    LuArrowRightLeft,
    LuLanguages,
    LuPipette,
    LuRectangleHorizontal,
} from 'react-icons/lu';
import { TbBorderCorners } from 'react-icons/tb';
import type { AnyLayer, TextLayer, ImageLayer, ShapeLayer, DynamicFieldLayer } from '@/types';

/* --- Prop button components --- */

export function PropButton({
    label,
    value,
    swatch,
    icon,
    active,
    onClick,
}: {
    label: string;
    value?: string | number;
    swatch?: string;
    icon: React.ReactNode;
    active?: boolean;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={`flex w-16 shrink-0 flex-col items-center rounded-xl border px-1 py-2 transition-colors ${active
                ? 'border-brand-primary bg-brand-primary text-primary-text'
                : 'border-transparent text-foreground hover:bg-muted'
                }`}
        >
            <div className="relative flex h-6 w-6 items-center justify-center mb-1.5">
                {icon}
                {swatch && (
                    <span
                        className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full border border-stroke rtl:right-auto rtl:-left-1"
                        style={{ backgroundColor: swatch }}
                    />
                )}
            </div>
            <span className="text-[10px] font-medium leading-tight">{label}</span>
        </button>
    );
}

export function PropToggle({
    label,
    icon,
    active,
    onClick,
}: {
    label: string;
    icon: React.ReactNode;
    active: boolean;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={`flex w-16 shrink-0 flex-col items-center rounded-xl border px-1 py-2 transition-colors ${active
                ? 'border-brand-primary bg-brand-primary text-primary-text'
                : 'border-transparent text-foreground hover:bg-muted'
                }`}
        >
            <div className="relative flex h-6 w-6 items-center justify-center mb-1.5">
                {icon}
            </div>
            <span className="text-[10px] font-medium leading-tight">{label}</span>
        </button>
    );
}

/* --- Properties bar --- */

export interface PropertiesBarProps {
    selectedLayer: AnyLayer;
    bottomBarRef?: (el: HTMLDivElement | null) => void;
    onLayerChange: (id: string, updates: Partial<AnyLayer>, recordHistory?: boolean) => void;
    activeProp: string | null;
    setActiveProp: (v: string | null) => void;
    colorPickerProp: string | null;
    setColorPickerProp: (v: string | null) => void;
    fontDrawerOpen: boolean;
    setFontDrawerOpen: (v: boolean) => void;
    textEditDrawerOpen: boolean;
    setTextEditDrawerOpen: (v: boolean) => void;
    setCollageEditOpen: (v: boolean) => void;
    setIsCropOpen: (v: boolean) => void;
    replaceImageInputRef: RefObject<HTMLInputElement | null>;
    onDuplicateLayer: (id: string) => void;
    onDeleteLayer: (id: string) => void;
    onEyeDropper?: () => void;
}

export default function PropertiesBar({
    selectedLayer,
    bottomBarRef,
    onLayerChange,
    activeProp,
    setActiveProp,
    colorPickerProp,
    setColorPickerProp,
    fontDrawerOpen,
    setFontDrawerOpen,
    textEditDrawerOpen,
    setTextEditDrawerOpen,
    setCollageEditOpen,
    setIsCropOpen,
    replaceImageInputRef,
    onDuplicateLayer,
    onDeleteLayer,
    onEyeDropper,
}: PropertiesBarProps) {
    const t = useTranslations('editor');

    return (
        <div ref={bottomBarRef} className="absolute bottom-0 left-0 right-0 z-20 border-t border-stroke bg-toolbar-bg" dir='ltr'>
            <div className="no-scrollbar flex h-20 items-center gap-1 overflow-x-auto px-2 py-1.5">

                {/* Text layer */}
                {selectedLayer.type === 'text' && (() => {
                    const l = selectedLayer as TextLayer;
                    const alignIcons = { left: LuAlignLeft, center: LuAlignCenter, right: LuAlignRight };
                    const vAlignIcons = { top: LuAlignStartVertical, middle: LuAlignCenterVertical, bottom: LuAlignEndVertical };
                    const AlignIcon = alignIcons[l.align];
                    const VAlignIcon = vAlignIcons[l.verticalAlign];
                    const nextAlign: TextLayer['align'] = l.align === 'right' ? 'center' : l.align === 'center' ? 'left' : 'right';
                    const nextVAlign: TextLayer['verticalAlign'] = l.verticalAlign === 'bottom' ? 'middle' : l.verticalAlign === 'middle' ? 'top' : 'bottom';
                    return (
                        <>
                            <PropToggle
                                label={t('toolbars.text.text')}
                                icon={<LuPencil className="h-5 w-5" />}
                                active={textEditDrawerOpen}
                                onClick={() => setTextEditDrawerOpen(true)}
                            />
                            <PropButton
                                label={t('toolbars.text.font')}
                                value={l.fontFamily}
                                icon={<LuType className="h-5 w-5" />}
                                active={fontDrawerOpen}
                                onClick={() => setFontDrawerOpen(!fontDrawerOpen)}
                            />
                            <PropButton
                                label={t('toolbars.text.size')}
                                value={l.fontSize}
                                icon={<LuALargeSmall className="h-5 w-5" />}
                                active={activeProp === 'text.fontSize'}
                                onClick={() => setActiveProp(activeProp === 'text.fontSize' ? null : 'text.fontSize')}
                            />
                            <PropButton
                                label={t('toolbars.text.color')}
                                swatch={l.color}
                                icon={<LuPalette className="h-5 w-5" />}
                                active={colorPickerProp === 'text.color'}
                                onClick={() => setColorPickerProp(colorPickerProp === 'text.color' ? null : 'text.color')}
                            />
                            {onEyeDropper && (
                                <PropToggle
                                    label={t('toolbars.text.eyeDropper')}
                                    icon={<LuPipette className="h-5 w-5" />}
                                    active={false}
                                    onClick={onEyeDropper}
                                />
                            )}
                            <PropToggle
                                label={t('toolbars.text.bold')}
                                icon={<LuBold className="h-5 w-5" />}
                                active={l.bold}
                                onClick={() => onLayerChange(l.id, { bold: !l.bold } as Partial<AnyLayer>)}
                            />
                            <PropToggle
                                label={t('toolbars.text.italic')}
                                icon={<LuItalic className="h-5 w-5" />}
                                active={l.italic}
                                onClick={() => onLayerChange(l.id, { italic: !l.italic } as Partial<AnyLayer>)}
                            />
                            <PropButton
                                label={t('toolbars.text.lineHeight')}
                                value={l.lineHeight}
                                icon={<LuAlignVerticalJustifyCenter className="h-5 w-5" />}
                                active={activeProp === 'text.lineHeight'}
                                onClick={() => setActiveProp(activeProp === 'text.lineHeight' ? null : 'text.lineHeight')}
                            />
                            <PropToggle
                                label={t('toolbars.text.align')}
                                icon={<AlignIcon className="h-5 w-5" />}
                                active={false}
                                onClick={() => onLayerChange(l.id, { align: nextAlign } as Partial<AnyLayer>)}
                            />
                            <PropToggle
                                label={t('toolbars.text.vAlign')}
                                icon={<VAlignIcon className="h-5 w-5" />}
                                active={false}
                                onClick={() => onLayerChange(l.id, { verticalAlign: nextVAlign } as Partial<AnyLayer>)}
                            />
                            <PropToggle
                                label={t('toolbars.text.direction')}
                                icon={
                                    l.direction === 'rtl' ? <LuArrowRightLeft className="h-5 w-5" /> :
                                        l.direction === 'ltr' ? <LuArrowLeftRight className="h-5 w-5" /> :
                                            <LuLanguages className="h-5 w-5" />
                                }
                                active={false}
                                onClick={() => {
                                    const next = l.direction === 'auto' ? 'rtl' : l.direction === 'rtl' ? 'ltr' : 'auto';
                                    onLayerChange(l.id, { direction: next } as Partial<AnyLayer>);
                                }}
                            />
                            <PropButton
                                label={t('toolbars.text.opacity')}
                                value={`${Math.round(l.opacity * 100)}%`}
                                icon={<LuDroplet className="h-5 w-5" />}
                                active={activeProp === 'text.opacity'}
                                onClick={() => setActiveProp(activeProp === 'text.opacity' ? null : 'text.opacity')}
                            />
                        </>
                    );
                })()}

                {/* Image layer */}
                {selectedLayer.type === 'image' && (() => {
                    const l = selectedLayer as ImageLayer;
                    const isCollage = !!l.collage;
                    return (
                        <>
                            {isCollage ? (
                                <>
                                    <PropToggle
                                        label={t('toolbars.image.collageEdit')}
                                        icon={<LuPencil className="h-5 w-5" />}
                                        active={false}
                                        onClick={() => setCollageEditOpen(true)}
                                    />
                                    <PropButton
                                        label={t('toolbars.image.aspectRatio')}
                                        icon={<LuRectangleHorizontal className="h-5 w-5" />}
                                        active={activeProp === 'image.aspectRatio'}
                                        onClick={() => setActiveProp(activeProp === 'image.aspectRatio' ? null : 'image.aspectRatio')}
                                    />
                                    <PropButton
                                        label={t('toolbars.image.collageLayout')}
                                        icon={<LuLayoutGrid className="h-5 w-5" />}
                                        active={activeProp === 'image.collageLayout'}
                                        onClick={() => setActiveProp(activeProp === 'image.collageLayout' ? null : 'image.collageLayout')}
                                    />
                                    <PropButton
                                        label={t('toolbars.image.collageGap')}
                                        value={l.collage?.gap ?? 4}
                                        icon={<LuColumns3 className="h-5 w-5" />}
                                        active={activeProp === 'image.collageGap'}
                                        onClick={() => setActiveProp(activeProp === 'image.collageGap' ? null : 'image.collageGap')}
                                    />
                                    <PropButton
                                        label={t('toolbars.image.collageBg')}
                                        swatch={l.collage?.bgColor ?? '#000000'}
                                        icon={<LuPalette className="h-5 w-5" />}
                                        active={colorPickerProp === 'image.collageBg'}
                                        onClick={() => setColorPickerProp(colorPickerProp === 'image.collageBg' ? null : 'image.collageBg')}
                                    />
                                    <PropButton
                                        label={t('toolbars.image.collageRounded')}
                                        value={l.collage?.containerRadius ?? 0}
                                        icon={<TbBorderCorners className="h-5 w-5" />}
                                        active={activeProp === 'image.collageRounded'}
                                        onClick={() => setActiveProp(activeProp === 'image.collageRounded' ? null : 'image.collageRounded')}
                                    />
                                </>
                            ) : (
                                <>
                                    <PropToggle
                                        label={t('toolbars.image.replace')}
                                        icon={<LuImage className="h-5 w-5" />}
                                        active={false}
                                        onClick={() => replaceImageInputRef.current?.click()}
                                    />
                                    <PropButton
                                        label={t('toolbars.image.aspectRatio')}
                                        icon={<LuRectangleHorizontal className="h-5 w-5" />}
                                        active={activeProp === 'image.aspectRatio'}
                                        onClick={() => setActiveProp(activeProp === 'image.aspectRatio' ? null : 'image.aspectRatio')}
                                    />
                                    <PropToggle
                                        label={t('toolbars.image.crop')}
                                        icon={<LuCrop className="h-5 w-5" />}
                                        active={false}
                                        onClick={() => setIsCropOpen(true)}
                                    />
                                </>
                            )}
                            {!isCollage && (
                                <>
                                    <PropToggle
                                        label={t('toolbars.image.flipHorizontal')}
                                        icon={<LuFlipHorizontal className="h-5 w-5" />}
                                        active={l.flipX}
                                        onClick={() => onLayerChange(l.id, { flipX: !l.flipX } as Partial<AnyLayer>)}
                                    />
                                    <PropToggle
                                        label={t('toolbars.image.flipVertical')}
                                        icon={<LuFlipVertical className="h-5 w-5" />}
                                        active={l.flipY}
                                        onClick={() => onLayerChange(l.id, { flipY: !l.flipY } as Partial<AnyLayer>)}
                                    />
                                </>
                            )}
                            <PropButton
                                label={t('toolbars.image.borderRadius')}
                                value={l.borderRadius}
                                icon={<TbBorderCorners className="h-5 w-5" />}
                                active={activeProp === 'image.borderRadius'}
                                onClick={() => setActiveProp(activeProp === 'image.borderRadius' ? null : 'image.borderRadius')}
                            />
                            {!isCollage && (
                                <>
                                    <PropButton
                                        label={t('toolbars.image.borderWidth')}
                                        value={l.borderWidth}
                                        icon={<LuSquare className="h-5 w-5" />}
                                        active={activeProp === 'image.borderWidth'}
                                        onClick={() => setActiveProp(activeProp === 'image.borderWidth' ? null : 'image.borderWidth')}
                                    />
                                    <PropButton
                                        label={t('toolbars.image.borderColor')}
                                        swatch={l.borderColor}
                                        icon={<LuPalette className="h-5 w-5" />}
                                        active={colorPickerProp === 'image.borderColor'}
                                        onClick={() => setColorPickerProp(colorPickerProp === 'image.borderColor' ? null : 'image.borderColor')}
                                    />
                                </>
                            )}
                            <PropButton
                                label={t('toolbars.image.opacity')}
                                value={`${Math.round(l.opacity * 100)}%`}
                                icon={<LuDroplet className="h-5 w-5" />}
                                active={activeProp === 'image.opacity'}
                                onClick={() => setActiveProp(activeProp === 'image.opacity' ? null : 'image.opacity')}
                            />
                        </>
                    );
                })()}

                {/* Shape layer */}
                {selectedLayer.type === 'shape' && (() => {
                    const l = selectedLayer as ShapeLayer;
                    const filled = l.filled ?? true;
                    // PNG shapes only show opacity (no fill/stroke controls)
                    if (l.shape === 'png') {
                        return (
                            <>
                                <PropButton
                                    label={t('toolbars.shape.opacity')}
                                    value={`${Math.round(l.opacity * 100)}%`}
                                    icon={<LuDroplet className="h-5 w-5" />}
                                    active={activeProp === 'shape.opacity'}
                                    onClick={() => setActiveProp(activeProp === 'shape.opacity' ? null : 'shape.opacity')}
                                />
                            </>
                        );
                    }
                    return (
                        <>
                            <PropToggle
                                label={t('toolbars.shape.filled')}
                                icon={
                                    <LuCircle
                                        className="h-5 w-5"
                                        fill={filled ? 'currentColor' : 'none'}
                                        strokeWidth={2}
                                    />
                                }
                                active={filled}
                                onClick={() => onLayerChange(l.id, { filled: !filled } as Partial<AnyLayer>)}
                            />
                            <PropButton
                                label={t('toolbars.shape.fillColor')}
                                swatch={l.fillColor}
                                icon={<LuPalette className="h-5 w-5" />}
                                active={colorPickerProp === 'shape.fillColor'}
                                onClick={() => setColorPickerProp(colorPickerProp === 'shape.fillColor' ? null : 'shape.fillColor')}
                            />
                            <PropButton
                                label={t('toolbars.shape.strokeColor')}
                                swatch={l.strokeColor}
                                icon={<LuPenLine className="h-5 w-5" />}
                                active={colorPickerProp === 'shape.strokeColor'}
                                onClick={() => setColorPickerProp(colorPickerProp === 'shape.strokeColor' ? null : 'shape.strokeColor')}
                            />
                            <PropButton
                                label={t('toolbars.shape.strokeWidth')}
                                value={l.strokeWidth}
                                icon={<LuSquare className="h-5 w-5" />}
                                active={activeProp === 'shape.strokeWidth'}
                                onClick={() => setActiveProp(activeProp === 'shape.strokeWidth' ? null : 'shape.strokeWidth')}
                            />
                            <PropButton
                                label={t('toolbars.shape.opacity')}
                                value={`${Math.round(l.opacity * 100)}%`}
                                icon={<LuDroplet className="h-5 w-5" />}
                                active={activeProp === 'shape.opacity'}
                                onClick={() => setActiveProp(activeProp === 'shape.opacity' ? null : 'shape.opacity')}
                            />
                            {(l.shape === 'rectangle') && (
                                <PropButton
                                    label={t('toolbars.shape.cornerRadius')}
                                    value={l.cornerRadius || 0}
                                    icon={<TbBorderCorners className="h-5 w-5" />}
                                    active={activeProp === 'shape.cornerRadius'}
                                    onClick={() => setActiveProp(activeProp === 'shape.cornerRadius' ? null : 'shape.cornerRadius')}
                                />
                            )}
                        </>
                    );
                })()}

                {/* Dynamic field layer */}
                {selectedLayer.type === 'dynamic_field' && (() => {
                    const l = selectedLayer as DynamicFieldLayer;
                    return (
                        <>
                            <PropButton
                                label={t('toolbars.dynamicField.opacity')}
                                value={`${Math.round(l.opacity * 100)}%`}
                                icon={<LuDroplet className="h-5 w-5" />}
                                active={activeProp === 'df.opacity'}
                                onClick={() => setActiveProp(activeProp === 'df.opacity' ? null : 'df.opacity')}
                            />
                            <PropButton
                                label={t('toolbars.dynamicField.strokeWidth')}
                                value={l.borderWidth ?? 0}
                                icon={<LuSquare className="h-5 w-5" />}
                                active={activeProp === 'df.strokeWidth'}
                                onClick={() => setActiveProp(activeProp === 'df.strokeWidth' ? null : 'df.strokeWidth')}
                            />
                            <PropButton
                                label={t('toolbars.dynamicField.strokeColor')}
                                swatch={l.borderColor ?? '#cccccc'}
                                icon={<LuPalette className="h-5 w-5" />}
                                active={colorPickerProp === 'df.strokeColor'}
                                onClick={() => setColorPickerProp(colorPickerProp === 'df.strokeColor' ? null : 'df.strokeColor')}
                            />
                        </>
                    );
                })()}

                <div className="h-10 w-px shrink-0 bg-stroke" />

                {/* Actions */}
                <PropToggle
                    label={t('duplicate')}
                    icon={<LuCopy className="h-5 w-5" />}
                    active={false}
                    onClick={() => onDuplicateLayer(selectedLayer.id)}
                />
                <PropToggle
                    label={t('delete')}
                    icon={<LuTrash2 className="h-5 w-5 text-error" />}
                    active={false}
                    onClick={() => onDeleteLayer(selectedLayer.id)}
                />
            </div>
        </div>
    );
}
