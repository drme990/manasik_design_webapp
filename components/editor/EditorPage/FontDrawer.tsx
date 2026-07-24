'use client';

import { LuUpload, LuLoaderCircle, LuTrash2 } from 'react-icons/lu';
import Drawer from '@/components/ui/Drawer';
import { ARABIC_SAFE_FONTS } from '@/lib/constants/arabic-fonts';
import { resolveFontFamily } from '@/lib/constants/fonts';
import type { AnyLayer, TextLayer } from '@/types';

export interface UserFont {
    id: string;
    family: string;
    name: string;
    weight: number;
}

interface FontDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    selectedLayer: AnyLayer | null;
    onSelectFont: (family: string, weight: number) => void;
    userFonts: UserFont[];
    fontUploading: boolean;
    onUploadFont: () => void;
    onDeleteFont: (id: string) => void;
    fontFileInputRef: React.RefObject<HTMLInputElement | null>;
    onFontFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
    labels: {
        uploadFont: string;
        fontUploading: string;
        builtinFonts: string;
        myFonts: string;
        deleteFont: string;
    };
}

export default function FontDrawer({
    isOpen,
    onClose,
    title,
    selectedLayer,
    onSelectFont,
    userFonts,
    fontUploading,
    onUploadFont,
    onDeleteFont,
    fontFileInputRef,
    onFontFileSelect,
    labels,
}: FontDrawerProps) {
    return (
        <Drawer
            isOpen={isOpen}
            onClose={onClose}
            title={title}
            height="auto"
        >
            <div className="space-y-4">
                {/* Upload button */}
                <input
                    ref={fontFileInputRef}
                    type="file"
                    accept=".ttf,.otf,.woff,.woff2,.eot,font/ttf,font/otf,font/woff,font/woff2"
                    className="hidden"
                    onChange={onFontFileSelect}
                />
                <button
                    type="button"
                    onClick={onUploadFont}
                    disabled={fontUploading}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-brand-primary/40 bg-brand-primary-light/10 px-4 py-3 text-sm font-medium text-brand-primary transition-colors hover:border-brand-primary hover:bg-brand-primary-light/20 disabled:opacity-50"
                >
                    {fontUploading ? (
                        <LuLoaderCircle className="h-5 w-5 animate-spin" />
                    ) : (
                        <LuUpload className="h-5 w-5" />
                    )}
                    {fontUploading ? labels.fontUploading : labels.uploadFont}
                </button>

                {/* Built-in fonts */}
                <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-secondary">
                        {labels.builtinFonts}
                    </p>
                    {ARABIC_SAFE_FONTS.map((font) => (
                        <button
                            key={font.id}
                            onClick={() => onSelectFont(font.family, font.weight)}
                            className={`flex w-full items-center justify-center rounded-xl border px-4 py-3 text-base transition-colors ${selectedLayer && (selectedLayer as TextLayer).fontFamily === font.family && (selectedLayer as TextLayer).fontWeight === font.weight
                                ? 'border-brand-primary bg-brand-primary text-primary-text'
                                : 'border-stroke bg-background text-foreground hover:bg-muted'
                                }`}
                            style={{ fontFamily: resolveFontFamily(font.family), fontWeight: font.weight }}
                        >
                            {font.name}
                        </button>
                    ))}
                </div>

                {/* User-uploaded fonts */}
                {userFonts.length > 0 && (
                    <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-secondary">
                            {labels.myFonts}
                        </p>
                        {userFonts.map((font) => {
                            const isSelected = selectedLayer &&
                                (selectedLayer as TextLayer).fontFamily === font.family;
                            return (
                                <div
                                    key={font.id}
                                    className={`group flex items-center gap-2 rounded-xl border px-3 py-2 transition-colors ${isSelected
                                        ? 'border-brand-primary bg-brand-primary text-primary-text'
                                        : 'border-stroke bg-background text-foreground hover:bg-muted'
                                        }`}
                                >
                                    <button
                                        onClick={() => onSelectFont(font.family, font.weight)}
                                        className="flex flex-1 items-center justify-center truncate text-base"
                                        style={{ fontFamily: font.family, fontWeight: font.weight }}
                                        title={font.name}
                                    >
                                        {font.name}
                                    </button>
                                    <button
                                        onClick={() => onDeleteFont(font.id)}
                                        className={`shrink-0 rounded-lg p-1.5 transition-colors ${isSelected
                                            ? 'text-primary-text/80 hover:bg-white/20'
                                            : 'text-secondary hover:bg-muted hover:text-error'
                                            }`}
                                        aria-label={labels.deleteFont}
                                        title={labels.deleteFont}
                                    >
                                        <LuTrash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </Drawer>
    );
}
