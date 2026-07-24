'use client';

import {
    LuSquare,
    LuCheck,
    LuPencil,
    LuTrash2,
    LuUpload,
    LuLoaderCircle,
} from 'react-icons/lu';
import Drawer from '@/components/ui/Drawer';
import ShapeRenderer from '@/components/editor/ShapeRenderer';
import { cn } from '@/lib/utils/cn';
import type { ShapeLayer } from '@/types';

const SHAPES: { shape: ShapeLayer['shape']; labelKey: string }[] = [
    { shape: 'rectangle', labelKey: 'rectangle' },
    { shape: 'circle', labelKey: 'circle' },
    { shape: 'triangle', labelKey: 'triangle' },
    { shape: 'star_4', labelKey: 'star4' },
    { shape: 'star_5', labelKey: 'star5' },
    { shape: 'star_6', labelKey: 'star6' },
    { shape: 'star_8', labelKey: 'star8' },
    { shape: 'line', labelKey: 'line' },
];

export interface UserShape {
    id: string;
    name: string;
    url: string;
    naturalWidth: number;
    naturalHeight: number;
}

interface ShapesDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    shapeFilled: boolean;
    onSetShapeFilled: (filled: boolean) => void;
    editShapesMode: boolean;
    onToggleEditShapes: () => void;
    userShapes: UserShape[];
    onAddShape: (shape: ShapeLayer['shape'], filled: boolean) => void;
    onAddPngShape: (shape: UserShape) => void;
    onDeleteShape: (id: string) => void;
    onUploadShape: () => void;
    shapeUploading: boolean;
    labels: {
        shapeFilled: string;
        shapeOutline: string;
        addShape: string;
        editShapes: string;
        doneEditShapes: string;
        uploadShape: string;
        deleteShape: string;
    };
    /** Translation function for shape labels: t(`toolbars.shape.${labelKey}`) */
    shapeLabel: (labelKey: string) => string;
}

export default function ShapesDrawer({
    isOpen,
    onClose,
    title,
    shapeFilled,
    onSetShapeFilled,
    editShapesMode,
    onToggleEditShapes,
    userShapes,
    onAddShape,
    onAddPngShape,
    onDeleteShape,
    onUploadShape,
    shapeUploading,
    labels,
    shapeLabel,
}: ShapesDrawerProps) {
    return (
        <Drawer
            isOpen={isOpen}
            onClose={onClose}
            title={title}
            height="auto"
            footer={
                <div className="w-full grid grid-cols-2">
                    <button
                        onClick={() => onSetShapeFilled(true)}
                        className={cn(
                            'w-full flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors',
                            shapeFilled
                                ? 'border-brand-primary bg-brand-primary text-primary-text'
                                : 'border-stroke text-secondary hover:bg-muted'
                        )}
                    >
                        <LuSquare className="h-4 w-4 fill-current" />
                        {labels.shapeFilled}
                    </button>
                    <button
                        onClick={() => onSetShapeFilled(false)}
                        className={cn(
                            'flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors',
                            !shapeFilled
                                ? 'border-brand-primary bg-brand-primary text-primary-text'
                                : 'border-stroke text-secondary hover:bg-muted'
                        )}
                    >
                        <LuSquare className="h-4 w-4" />
                        {labels.shapeOutline}
                    </button>
                </div>
            }
        >
            <div className="space-y-6">
                {/* Built-in shapes — grid layout, scrollable on Y axis */}
                <div>
                    <div className="mb-3 flex items-center justify-between">
                        <h3 className="text-sm font-medium text-secondary">{labels.addShape}</h3>
                        {/* Edit shapes button — only visible when user has uploaded shapes */}
                        {userShapes.length > 0 && (
                            <button
                                onClick={onToggleEditShapes}
                                className={cn(
                                    'flex items-center gap-1 text-xs transition-colors',
                                    editShapesMode
                                        ? 'font-semibold text-brand-primary'
                                        : 'text-secondary hover:text-foreground'
                                )}
                            >
                                {editShapesMode ? (
                                    <>
                                        <LuCheck className="h-3.5 w-3.5" />
                                        {labels.doneEditShapes}
                                    </>
                                ) : (
                                    <>
                                        <LuPencil className="h-3.5 w-3.5" />
                                        {labels.editShapes}
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                    <div
                        className="grid grid-cols-3 gap-3 sm:grid-cols-5"
                        onContextMenu={(e) => e.preventDefault()}
                        style={{
                            WebkitTouchCallout: 'none',
                            userSelect: 'none',
                            touchAction: 'manipulation',
                        }}
                    >
                        {SHAPES.map(({ shape, labelKey }) => (
                            <button
                                key={shape}
                                onClick={() => onAddShape(shape, shapeFilled)}
                                className="flex flex-col items-center gap-2 rounded-xl border border-stroke bg-card-bg p-3 transition-colors hover:border-brand-primary hover:bg-brand-primary-light/10"
                            >
                                <ShapeRenderer
                                    shape={shape}
                                    width={40}
                                    height={40}
                                    fillColor="var(--brand-primary)"
                                    strokeColor="var(--brand-primary)"
                                    strokeWidth={2}
                                    filled={shapeFilled}
                                />
                                <span className="text-xs text-secondary">{shapeLabel(labelKey)}</span>
                            </button>
                        ))}

                        {/* User-uploaded PNG shapes — directly after built-in shapes.
                            Uses background-image instead of <img> to prevent the
                            native long-press / right-click context menu on both
                            mobile (iOS callout, Android save-image) and desktop. */}
                        {userShapes.map((shape) => (
                            <div
                                key={shape.id}
                                className="group relative flex flex-col items-center gap-2 rounded-xl border border-stroke bg-card-bg p-3 transition-colors hover:border-brand-primary hover:bg-brand-primary-light/10"
                                onContextMenu={(e) => e.preventDefault()}
                                style={{
                                    WebkitTouchCallout: 'none',
                                    userSelect: 'none',
                                    touchAction: 'manipulation',
                                }}
                            >
                                <button
                                    onClick={() => {
                                        if (editShapesMode) return; // don't add while editing
                                        onAddPngShape(shape);
                                    }}
                                    onContextMenu={(e) => e.preventDefault()}
                                    style={{
                                        WebkitTouchCallout: 'none',
                                        userSelect: 'none',
                                        touchAction: 'manipulation',
                                    }}
                                    className="flex flex-col items-center gap-2"
                                >
                                    <div
                                        className="h-10 w-10 bg-contain bg-center bg-no-repeat"
                                        style={{
                                            backgroundImage: `url(${shape.url})`,
                                            WebkitTouchCallout: 'none',
                                            WebkitUserSelect: 'none',
                                            userSelect: 'none',
                                            touchAction: 'manipulation',
                                        }}
                                        role="img"
                                        aria-label={shape.name}
                                    />
                                    <span
                                        className="w-full truncate text-center text-xs text-secondary"
                                        style={{ userSelect: 'none' }}
                                    >
                                        {shape.name}
                                    </span>
                                </button>
                                {/* Delete button — only shown in edit mode */}
                                {editShapesMode && (
                                    <button
                                        onClick={() => onDeleteShape(shape.id)}
                                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-error text-white"
                                        aria-label={labels.deleteShape}
                                    >
                                        <LuTrash2 className="h-3 w-3" />
                                    </button>
                                )}
                            </div>
                        ))}

                        {/* Upload button — at the end of the grid */}
                        <button
                            onClick={onUploadShape}
                            disabled={shapeUploading}
                            className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-stroke bg-card-bg p-3 transition-colors hover:border-brand-primary disabled:opacity-50"
                        >
                            {shapeUploading ? (
                                <LuLoaderCircle className="h-8 w-8 animate-spin text-secondary" />
                            ) : (
                                <LuUpload className="h-8 w-8 text-secondary" />
                            )}
                            <span className="text-xs text-secondary">{labels.uploadShape}</span>
                        </button>
                    </div>
                </div>
            </div>
        </Drawer>
    );
}
