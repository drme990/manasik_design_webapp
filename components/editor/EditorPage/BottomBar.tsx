'use client';

import {
    LuType,
    LuImage,
    LuText,
    LuShapes,
    LuPalette,
    LuScanLine,
    LuTrash2,
    LuLoaderCircle,
    LuRefreshCw,
} from 'react-icons/lu';
import { PropToggle, PropButton } from '@/components/editor/PropertiesBar';
import type { Project } from '@/types';

interface BottomBarProps {
    project: Project;
    bottomBarRef: (el: HTMLDivElement | null) => void;
    isBookingTemplate: boolean;
    dynamicFieldDrawerOpen: boolean;
    onOpenDynamicFieldDrawer: () => void;
    onAddText: () => void;
    onAddImage: () => void;
    addDrawerOpen: boolean;
    onOpenShapesDrawer: () => void;
    onBgImageClick: () => void;
    onRemoveBgImage: () => void;
    onRetryBgUpload: () => void;
    bgColor: string;
    colorPickerActive: boolean;
    onToggleBgColor: () => void;
    safeAreaEditMode: boolean;
    onToggleSafeArea: () => void;
    labels: {
        addField: string;
        addText: string;
        addImage: string;
        addShape: string;
        changeBgImage: string;
        setBgImage: string;
        removeBgImage: string;
        canvasBackground: string;
        safeAreaEditOn: string;
        safeAreaEditOff: string;
    };
}

export default function BottomBar({
    project,
    bottomBarRef,
    isBookingTemplate,
    dynamicFieldDrawerOpen,
    onOpenDynamicFieldDrawer,
    onAddText,
    onAddImage,
    addDrawerOpen,
    onOpenShapesDrawer,
    onBgImageClick,
    onRemoveBgImage,
    onRetryBgUpload,
    bgColor,
    colorPickerActive,
    onToggleBgColor,
    safeAreaEditMode,
    onToggleSafeArea,
    labels,
}: BottomBarProps) {
    return (
        <div ref={bottomBarRef} className="absolute bottom-0 left-0 right-0 z-20 border-t border-stroke bg-toolbar-bg" dir="ltr">
            <div className="no-scrollbar flex h-20 items-center gap-1 overflow-x-auto px-2 py-1.5">
                {/* 1 — Dynamic field (booking templates only) */}
                {isBookingTemplate && (
                    <PropToggle
                        label={labels.addField}
                        icon={<LuText className="h-5 w-5" />}
                        active={dynamicFieldDrawerOpen}
                        onClick={onOpenDynamicFieldDrawer}
                    />
                )}
                {/* 2 — Text */}
                <PropToggle
                    label={labels.addText}
                    icon={<LuType className="h-5 w-5" />}
                    active={false}
                    onClick={onAddText}
                />
                {/* 3 — Image */}
                <PropToggle
                    label={labels.addImage}
                    icon={<LuImage className="h-5 w-5" />}
                    active={false}
                    onClick={onAddImage}
                />
                {/* 4 — Shape (opens the shapes drawer) */}
                <PropToggle
                    label={labels.addShape}
                    icon={<LuShapes className="h-5 w-5" />}
                    active={addDrawerOpen}
                    onClick={onOpenShapesDrawer}
                />
                {/* 5 — BG image */}
                <PropToggle
                    label={project.backgroundUri ? labels.changeBgImage : labels.setBgImage}
                    icon={
                        project.bgUploadStatus === 'uploading' ? (
                            <LuLoaderCircle className="h-5 w-5 animate-spin" />
                        ) : project.bgUploadStatus === 'error' ? (
                            <LuRefreshCw className="h-5 w-5 text-error" />
                        ) : (
                            <LuImage className="h-5 w-5" />
                        )
                    }
                    active={false}
                    onClick={() => {
                        if (project.bgUploadStatus === 'error') {
                            onRetryBgUpload();
                        } else if (project.bgUploadStatus !== 'uploading') {
                            onBgImageClick();
                        }
                    }}
                />
                {/* 6 — BG color */}
                <PropButton
                    label={labels.canvasBackground}
                    swatch={bgColor}
                    icon={<LuPalette className="h-5 w-5" />}
                    active={colorPickerActive}
                    onClick={onToggleBgColor}
                />
                {project.backgroundUri && project.bgUploadStatus !== 'uploading' && (
                    <PropToggle
                        label={labels.removeBgImage}
                        icon={<LuTrash2 className="h-5 w-5 text-error" />}
                        active={false}
                        onClick={onRemoveBgImage}
                    />
                )}
                {/* 7 — Safe zone controller */}
                <PropToggle
                    label={safeAreaEditMode ? labels.safeAreaEditOn : labels.safeAreaEditOff}
                    icon={<LuScanLine className="h-5 w-5" />}
                    active={safeAreaEditMode}
                    onClick={onToggleSafeArea}
                />
            </div>
        </div>
    );
}
