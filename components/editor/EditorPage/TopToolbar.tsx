'use client';

import { LuArrowLeft, LuPencil, LuUndo2, LuRedo2, LuLayers, LuDownload, LuSave, LuLoaderCircle } from 'react-icons/lu';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils/cn';

interface TopToolbarProps {
    projectName: string;
    onBack: () => void;
    onRename: () => void;
    onUndoClick: () => void;
    onRedoClick: () => void;
    canUndo: boolean;
    canRedo: boolean;
    undoFlash: boolean;
    redoFlash: boolean;
    undoLabel: string;
    redoLabel: string;
    layersLabel: string;
    exportLabel: string;
    saveLabel: string;
    layersDrawerOpen: boolean;
    onOpenLayers: () => void;
    onExport: () => void;
    isExporting: boolean;
    onSave: () => void;
    saving: boolean;
    hasUnsavedChanges: boolean;
}

export default function TopToolbar({
    projectName,
    onBack,
    onRename,
    onUndoClick,
    onRedoClick,
    canUndo,
    canRedo,
    undoFlash,
    redoFlash,
    undoLabel,
    redoLabel,
    layersLabel,
    exportLabel,
    saveLabel,
    layersDrawerOpen,
    onOpenLayers,
    onExport,
    isExporting,
    onSave,
    saving,
    hasUnsavedChanges,
}: TopToolbarProps) {
    return (
        <div className="flex h-14 w-full max-w-full shrink-0 items-center justify-between gap-2 overflow-hidden border-b border-stroke bg-toolbar-bg px-3 sm:px-4">
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <Button variant="ghost" size="sm" onClick={onBack}>
                    <LuArrowLeft className="h-4 w-4 rtl:rotate-180" />
                </Button>
                <h1 className="min-w-0 truncate text-sm font-semibold text-foreground sm:text-base">
                    {projectName}
                </h1>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onRename}
                    aria-label="rename"
                    className="shrink-0"
                >
                    <LuPencil className="h-4 w-4" />
                </Button>
            </div>

            <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onRedoClick}
                        disabled={!canRedo}
                        aria-label={redoLabel}
                        className={cn('transition-colors', redoFlash && 'bg-brand-primary/20 text-brand-primary')}
                    >
                        <LuRedo2 className="h-4 w-4 rtl:-scale-x-100" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onUndoClick}
                        disabled={!canUndo}
                        aria-label={undoLabel}
                        className={cn('transition-colors', undoFlash && 'bg-brand-primary/20 text-brand-primary')}
                    >
                        <LuUndo2 className="h-4 w-4 rtl:-scale-x-100" />
                    </Button>
                </div>

                <Button
                    variant="outline"
                    size="sm"
                    onClick={onOpenLayers}
                    className="gap-1 px-2 sm:px-3"
                >
                    <LuLayers className="h-4 w-4" fill={layersDrawerOpen ? 'currentColor' : 'none'} />
                    <span className="hidden sm:inline">{layersLabel}</span>
                </Button>

                <Button
                    variant="outline"
                    size="sm"
                    onClick={onExport}
                    disabled={isExporting}
                    className="gap-1 px-2 sm:px-3"
                >
                    {isExporting ? (
                        <LuLoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                        <LuDownload className="h-4 w-4" />
                    )}
                    <span className="hidden sm:inline">{exportLabel}</span>
                </Button>

                <Button
                    variant="primary"
                    size="sm"
                    onClick={onSave}
                    loading={saving}
                    className="relative gap-1 px-2 sm:px-3"
                >
                    <LuSave className="h-4 w-4" />
                    <span className="hidden sm:inline">{saveLabel}</span>
                    {hasUnsavedChanges && !saving && (
                        <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
                            <span className="relative inline-flex h-3 w-3 rounded-full bg-orange-500" />
                        </span>
                    )}
                </Button>
            </div>
        </div>
    );
}
