'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from '@/lib/i18n/strings';
import { toJpeg } from 'html-to-image';
import { ImageColorPicker } from 'react-image-color-picker';
import {
    LuArrowLeft,
    LuType,
    LuImage,
    LuTrash2,
    LuSave,
    LuLayers,
    LuUndo2,
    LuRedo2,
    LuPencil,
    LuText,
    LuDownload,
    LuPlus,
    LuPalette,
    LuLock,
    LuLockOpen,
} from 'react-icons/lu';

import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import Modal from '@/components/ui/Modal';
import Drawer from '@/components/ui/Drawer';
import ColorPickerDrawer from '@/components/ui/ColorPickerDrawer';
import SliderField from '@/components/ui/SliderField';
import Canvas from '@/components/editor/Canvas';
import PropertiesBar, { PropButton, PropToggle } from '@/components/editor/PropertiesBar';
import DraggableLayerList from '@/components/common/DraggableLayerList';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import ShapeRenderer from '@/components/editor/ShapeRenderer';
import ImageCropModal from '@/components/editor/Modals/ImageCropModal';
import CollageEditModal from '@/components/editor/Modals/CollageEditModal';
import { getProject, updateProjectLocal, saveProject, syncProject, recoverFromMirror } from '@/lib/store/projects';
import {
    buildTextLayer,
    buildImageLayer,
    buildCollageLayer,
    buildShapeLayer,
    buildDynamicFieldLayer,
    nextZIndex,
    cloneLayer,
} from '@/lib/utils/layer-utils';
import { ARABIC_SAFE_FONTS } from '@/lib/constants/arabic-fonts';
import { resolveFontFamily } from '@/lib/constants/fonts';
import { ASPECT_RATIOS, COLLAGE_LAYOUTS } from '@/lib/constants/presets';
import { useSavedColors } from '@/lib/hooks/useSavedColors';
import type { Project, AnyLayer, TextLayer, ImageLayer, ShapeLayer, DynamicFieldLayer } from '@/types';
import Input from '@/components/ui/Input';

const SYNC_INTERVAL_MS = 10_000;

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

function generateFieldId(project: Project): string {
    const existing = project.layers
        .filter((l) => l.type === 'dynamic_field')
        .map((l) => parseInt((l as DynamicFieldLayer).variableId.replace(/^field_/, ''), 10))
        .filter((n) => !isNaN(n));
    const max = existing.length > 0 ? Math.max(...existing) : 0;
    return `field_${max + 1}`;
}

/* --- Color picker helpers --- */

const COLOR_PROP_LABEL_KEYS: Record<string, string> = {
    'text.color': 'color',
    'image.borderColor': 'borderColor',
    'image.collageBg': 'collageBg',
    'shape.fillColor': 'fillColor',
    'shape.strokeColor': 'strokeColor',
    'df.strokeColor': 'strokeColor',
};

const COLOR_PROP_TYPE_PREFIX: Record<string, string> = {
    'text.color': 'text',
    'image.borderColor': 'image',
    'image.collageBg': 'image',
    'shape.fillColor': 'shape',
    'shape.strokeColor': 'shape',
    'df.strokeColor': 'dynamicField',
};

function getColorPickerValue(layer: AnyLayer, prop: string): string {
    if (prop === 'text.color') return (layer as TextLayer).color;
    if (prop === 'image.borderColor') return (layer as ImageLayer).borderColor;
    if (prop === 'shape.fillColor') return (layer as ShapeLayer).fillColor;
    if (prop === 'shape.strokeColor') return (layer as ShapeLayer).strokeColor;
    if (prop === 'df.strokeColor') return (layer as DynamicFieldLayer).borderColor ?? '#cccccc';
    return '#000000';
}

function getColorPickerUpdate(prop: string, color: string): Partial<AnyLayer> {
    if (prop === 'text.color') return { color } as Partial<AnyLayer>;
    if (prop === 'image.borderColor') return { borderColor: color } as Partial<AnyLayer>;
    if (prop === 'shape.fillColor') return { fillColor: color } as Partial<AnyLayer>;
    if (prop === 'shape.strokeColor') return { strokeColor: color } as Partial<AnyLayer>;
    if (prop === 'df.strokeColor') return { borderColor: color } as Partial<AnyLayer>;
    return {};
}

export default function EditorPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const t = useTranslations('editor');
    const uiT = useTranslations('ui');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const bgFileInputRef = useRef<HTMLInputElement>(null);
    const replaceImageInputRef = useRef<HTMLInputElement>(null);

    const [project, setProject] = useState<Project | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [showUnsavedModal, setShowUnsavedModal] = useState(false);
    const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
    const [zoom, setZoom] = useState(0);
    const [history, setHistory] = useState<{ past: AnyLayer[][]; future: AnyLayer[][] }>({
        past: [],
        future: [],
    });
    const projectRef = useRef<Project | null>(null);
    const inTransactionRef = useRef(false);
    const selectedLayerIdRef = useRef<string | null>(null);
    const deleteLayerRef = useRef<(id: string) => void>(() => { });
    const canvasRef = useRef<HTMLDivElement | null>(null);
    const canvasContainerRef = useRef<HTMLDivElement | null>(null);
    const [bottomBarHeight, setBottomBarHeight] = useState(0);
    const bottomBarObserverRef = useRef<ResizeObserver | null>(null);
    // Callback ref shared by whichever bottom bar is mounted (canvas-bg bar or
    // properties bar — they're mutually exclusive) so we can reserve exactly
    // enough space to keep the canvas centered above it, with no layout shift.
    const bottomBarRef = useCallback((el: HTMLDivElement | null) => {
        if (bottomBarObserverRef.current) {
            bottomBarObserverRef.current.disconnect();
            bottomBarObserverRef.current = null;
        }
        if (el) {
            const ro = new ResizeObserver((entries) => {
                const h = entries[0]?.target.getBoundingClientRect().height ?? 0;
                setBottomBarHeight(h);
            });
            ro.observe(el);
            bottomBarObserverRef.current = ro;
            setBottomBarHeight(el.getBoundingClientRect().height);
        } else {
            setBottomBarHeight(0);
        }
    }, []);
    const [renameOpen, setRenameOpen] = useState(false);
    const [renameValue, setRenameValue] = useState('');
    const [isExporting, setIsExporting] = useState(false);
    const [isCropOpen, setIsCropOpen] = useState(false);
    const [collageEditOpen, setCollageEditOpen] = useState(false);
    const [addDrawerOpen, setAddDrawerOpen] = useState(false);
    const [layersDrawerOpen, setLayersDrawerOpen] = useState(false);
    const [activeProp, setActiveProp] = useState<string | null>(null);
    const [colorPickerProp, setColorPickerProp] = useState<string | null>(null);
    const [fontDrawerOpen, setFontDrawerOpen] = useState(false);
    const [textEditDrawerOpen, setTextEditDrawerOpen] = useState(false);
    const [freeDrag, setFreeDrag] = useState(false);
    const eyeDropperReopenRef = useRef<string | null>(null);
    // Mobile eye dropper fallback — shows a canvas snapshot overlay for tapping a color
    const [mobileEyeDropper, setMobileEyeDropper] = useState<{
        dataUrl: string;
        onPick: (color: string) => void;
    } | null>(null);
    const { savedColors, persistColor: addSavedColor, removeColor: removeSavedColor } = useSavedColors();

    // Close drawers when selection changes
    const skipDrawerResetRef = useRef(false);

    useEffect(() => {
        if (skipDrawerResetRef.current) {
            skipDrawerResetRef.current = false;
            return;
        }
        setActiveProp(null);
        setColorPickerProp(null);
        setFontDrawerOpen(false);
        setTextEditDrawerOpen(false);
    }, [selectedLayerId]);

    useEffect(() => {
        projectRef.current = project;
    }, [project]);

    // Load the project
    useEffect(() => {
        // Recover any data from localStorage mirror (in case IndexedDB lost data)
        recoverFromMirror().finally(() => {
            getProject(id).then((p) => {
                setProject(p);
                setLoading(false);
            });
        });
    }, [id]);

    // Compute zoom to fit the canvas fully inside the available container space
    // with breathing room (padding) on all sides. Reserves space for the
    // absolutely-positioned bottom bar so the canvas centers in the visible area.
    // Uses a ResizeObserver so it reacts to panel/drawer open/close, not just window resize.
    useEffect(() => {
        if (!project) return;
        const PADDING = 48; // px of empty space around the canvas on all sides
        let rafId: number | null = null;

        const computeFit = () => {
            if (rafId) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
                const container = canvasContainerRef.current;
                if (!container) return;
                const availW = container.clientWidth - PADDING;
                const availH = container.clientHeight - PADDING - bottomBarHeight;
                if (availW <= 0 || availH <= 0) return;
                const fit = Math.min(
                    availW / project.canvasWidth,
                    availH / project.canvasHeight,
                );
                setZoom(fit > 0 ? fit : 0.1);
            });
        };

        const ro = new ResizeObserver(() => computeFit());
        if (canvasContainerRef.current) {
            ro.observe(canvasContainerRef.current);
        }
        window.addEventListener('resize', computeFit);
        computeFit();
        return () => {
            if (rafId) cancelAnimationFrame(rafId);
            ro.disconnect();
            window.removeEventListener('resize', computeFit);
        };
    }, [project, bottomBarHeight]);

    const pendingPersistRef = useRef<Project | null>(null);
    const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hasUnsavedRef = useRef(false);

    // Save to IndexedDB + localStorage mirror (debounced, skips during transactions)
    const saveLocal = useCallback(async (projectToSave: Project) => {
        try {
            await saveProject(projectToSave);
            // Don't clear hasUnsavedRef here — only clear after API sync
            // The orange dot stays until the 10s sync interval pushes to the API
        } catch (error) {
            console.error('Failed to save project locally:', error);
        }
    }, []);

    const persistProject = useCallback(
        (updated: Project) => {
            pendingPersistRef.current = updated;
            hasUnsavedRef.current = true;
            setHasUnsavedChanges(true);

            // If inside a transaction (drag, slider, etc.), don't save intermediate
            // states — only save the final state when the transaction ends.
            if (inTransactionRef.current) {
                return;
            }

            // Debounce: rapid changes (e.g. typing) only save the last state
            if (saveDebounceRef.current) {
                clearTimeout(saveDebounceRef.current);
            }
            saveDebounceRef.current = setTimeout(() => {
                saveDebounceRef.current = null;
                const current = pendingPersistRef.current;
                if (current) {
                    saveLocal(current);
                }
            }, 300);
        },
        [saveLocal]
    );

    // Force save + sync to API immediately (used by the Save button)
    const flushPersist = useCallback(async (updated: Project) => {
        pendingPersistRef.current = null;
        if (saveDebounceRef.current) {
            clearTimeout(saveDebounceRef.current);
            saveDebounceRef.current = null;
        }
        setSaving(true);
        await saveLocal(updated);
        if (projectRef.current) {
            await syncProject(projectRef.current.id);
        }
        hasUnsavedRef.current = false;
        setHasUnsavedChanges(false);
        setSaving(false);
    }, [saveLocal]);

    // Save and navigate away — used by the "Save & Leave" button in the modal
    const doSaveAndLeave = useCallback(() => {
        const current = pendingPersistRef.current || projectRef.current;
        if (current) {
            if (saveDebounceRef.current) {
                clearTimeout(saveDebounceRef.current);
                saveDebounceRef.current = null;
            }
            pendingPersistRef.current = null;
            hasUnsavedRef.current = false;
            setHasUnsavedChanges(false);
            saveProject(current).catch(() => { });
            syncProject(current.id).catch(() => { });
        }
        // Use replace so the dummy history state from the back-button guard
        // doesn't stay in the browser history stack
        router.replace('/projects');
    }, [router]);

    // Leave without saving — discard pending changes
    const doLeaveWithoutSaving = useCallback(() => {
        if (saveDebounceRef.current) {
            clearTimeout(saveDebounceRef.current);
            saveDebounceRef.current = null;
        }
        pendingPersistRef.current = null;
        hasUnsavedRef.current = false;
        setHasUnsavedChanges(false);
        router.replace('/projects');
    }, [router]);

    // Check for unsaved changes before navigating — shows confirmation modal if dirty
    // Used by in-app back/navigation buttons
    const handleNavigateBack = useCallback(() => {
        if (hasUnsavedRef.current) {
            setShowUnsavedModal(true);
        } else {
            router.push('/projects');
        }
    }, [router]);

    const handleExportJpg = useCallback(async () => {
        if (!canvasRef.current || !project) return;

        const previousSelection = selectedLayerId;
        setSelectedLayerId(null);
        setIsExporting(true);

        await new Promise((resolve) => setTimeout(resolve, 120));

        try {
            const dataUrl = await toJpeg(canvasRef.current, {
                quality: 0.95,
                backgroundColor: project.backgroundColor || '#ffffff',
                pixelRatio: 2,
            });

            const link = document.createElement('a');
            link.href = dataUrl;
            link.download = `${project.name || 'design'}.jpg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            console.error('Failed to export canvas as JPG:', error);
        } finally {
            setIsExporting(false);
            setSelectedLayerId(previousSelection);
        }
    }, [project, selectedLayerId]);

    useEffect(() => {
        const endTransaction = () => {
            if (inTransactionRef.current) {
                inTransactionRef.current = false;
                // Cancel any pending debounce and save immediately
                if (saveDebounceRef.current) {
                    clearTimeout(saveDebounceRef.current);
                    saveDebounceRef.current = null;
                }
                const current = pendingPersistRef.current;
                if (current) {
                    saveLocal(current);
                    pendingPersistRef.current = null;
                }
            }
        };
        window.addEventListener('mouseup', endTransaction);
        window.addEventListener('pointerup', endTransaction);
        return () => {
            window.removeEventListener('mouseup', endTransaction);
            window.removeEventListener('pointerup', endTransaction);
        };
    }, [saveLocal]);

    useEffect(() => {
        syncIntervalRef.current = setInterval(async () => {
            const currentId = projectRef.current?.id;
            if (!currentId) return;
            // Only sync if there are unsaved changes — avoid unnecessary API calls
            if (!hasUnsavedRef.current) return;
            // Snapshot the pending project so we can check if it changed during sync
            const snapshot = pendingPersistRef.current || projectRef.current;
            setSaving(true);
            await syncProject(currentId);
            // Only clear unsaved flag if no new changes happened during the sync
            if (pendingPersistRef.current === snapshot || pendingPersistRef.current === null) {
                hasUnsavedRef.current = false;
                setHasUnsavedChanges(false);
            }
            setSaving(false);
        }, SYNC_INTERVAL_MS);

        return () => {
            if (syncIntervalRef.current) {
                clearInterval(syncIntervalRef.current);
            }
        };
    }, []);

    const handleRenameProject = useCallback(async () => {
        if (!project || !renameValue.trim()) return;
        const trimmed = renameValue.trim();
        await updateProjectLocal(project.id, { name: trimmed });
        setProject((prev) => (prev ? { ...prev, name: trimmed } : prev));
        setRenameOpen(false);
    }, [project, renameValue]);

    const handleBackgroundColorChange = useCallback((color: string) => {
        setProject((prev) => {
            if (!prev) return prev;
            const updated = { ...prev, backgroundColor: color };
            persistProject(updated);
            return updated;
        });
    }, [persistProject]);

    const handleBackgroundImageChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !project) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            const uri = event.target?.result as string;
            await updateProjectLocal(project.id, { backgroundUri: uri });
            setProject((prev) => (prev ? { ...prev, backgroundUri: uri } : prev));
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    }, [project]);

    const handleRemoveBackgroundImage = useCallback(async () => {
        if (!project) return;
        await updateProjectLocal(project.id, { backgroundUri: undefined });
        setProject((prev) => (prev ? { ...prev, backgroundUri: undefined } : prev));
    }, [project]);

    const updateProjectState = useCallback(
        (updater: (prev: Project) => Project, recordHistory = true) => {
            setProject((prev) => {
                if (!prev) return prev;
                const updated = updater(prev);
                if (recordHistory && !inTransactionRef.current) {
                    setHistory((h) => ({
                        past: [...h.past, prev.layers],
                        future: [],
                    }));
                }
                persistProject(updated);
                return updated;
            });
        },
        [persistProject]
    );

    const handleUndo = useCallback(() => {
        setHistory((h) => {
            if (h.past.length === 0) return h;
            const previous = h.past[h.past.length - 1];
            const newPast = h.past.slice(0, -1);
            const current = projectRef.current;
            if (current) {
                const updated = { ...current, layers: previous };
                persistProject(updated);
                setProject(updated);
            }
            return { past: newPast, future: [current?.layers ?? previous, ...h.future] };
        });
    }, [persistProject]);

    const handleRedo = useCallback(() => {
        setHistory((h) => {
            if (h.future.length === 0) return h;
            const next = h.future[0];
            const newFuture = h.future.slice(1);
            const current = projectRef.current;
            if (current) {
                const updated = { ...current, layers: next };
                persistProject(updated);
                setProject(updated);
            }
            return { past: [...h.past, current?.layers ?? next], future: newFuture };
        });
    }, [persistProject]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const isMod = e.metaKey || e.ctrlKey;
            if (isMod && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) {
                    handleRedo();
                } else {
                    handleUndo();
                }
                return;
            }
            if (isMod && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                handleRedo();
                return;
            }
            if (e.key === 'Delete') {
                if (selectedLayerIdRef.current) {
                    e.preventDefault();
                    deleteLayerRef.current(selectedLayerIdRef.current);
                }
                return;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        // beforeunload — desktop: trigger native browser confirmation if unsaved changes
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (hasUnsavedRef.current) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);

        // Intercept browser/phone back button — push a dummy state so we can
        // catch the popstate event and show our custom confirmation modal
        // instead of navigating away immediately.
        window.history.pushState({ editorGuard: true }, '');
        const handlePopState = (e: PopStateEvent) => {
            if (hasUnsavedRef.current) {
                // Re-push the guard state so the next back press is also caught
                window.history.pushState({ editorGuard: true }, '');
                // Show the confirmation modal
                setShowUnsavedModal(true);
            } else {
                // No unsaved changes — let the back navigation proceed
                router.push('/projects');
            }
        };
        window.addEventListener('popstate', handlePopState);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('beforeunload', handleBeforeUnload);
            window.removeEventListener('popstate', handlePopState);
            if (syncIntervalRef.current) {
                clearInterval(syncIntervalRef.current);
            }
            if (saveDebounceRef.current) {
                clearTimeout(saveDebounceRef.current);
                saveDebounceRef.current = null;
            }
        };
    }, [handleUndo, handleRedo]);

    const startChangeTransaction = useCallback(() => {
        if (inTransactionRef.current) return;
        inTransactionRef.current = true;
        const current = projectRef.current;
        if (!current) return;
        setHistory((h) => ({
            past: [...h.past, current.layers],
            future: [],
        }));
    }, []);

    const handleLayerChange = useCallback(
        (layerId: string, updates: Partial<AnyLayer>, recordHistory = true) => {
            updateProjectState((prev) => ({
                ...prev,
                layers: prev.layers.map((layer) =>
                    layer.id === layerId ? ({ ...layer, ...updates } as AnyLayer) : layer
                ),
            }), recordHistory);
        },
        [updateProjectState]
    );

    const handleAlign = useCallback(
        (align: 'left' | 'center' | 'right') => {
            if (!selectedLayerId) return;
            handleLayerChange(selectedLayerId, { align } as Partial<AnyLayer>);
        },
        [selectedLayerId, handleLayerChange]
    );

    const handleVerticalAlign = useCallback(
        (verticalAlign: 'top' | 'middle' | 'bottom') => {
            if (!selectedLayerId) return;
            handleLayerChange(selectedLayerId, { verticalAlign } as Partial<AnyLayer>);
        },
        [selectedLayerId, handleLayerChange]
    );

    // Change font size while keeping the text centered (adjust x/y so the
    // midpoint stays fixed as the box grows/shrinks).
    const handleFontSizeChange = useCallback(
        (newFontSize: number) => {
            if (!selectedLayerId) return;
            const layer = projectRef.current?.layers.find((l) => l.id === selectedLayerId);
            if (!layer || layer.type !== 'text') return;
            const textLayer = layer as TextLayer;
            // Estimate new size proportional to font size change
            const ratio = newFontSize / textLayer.fontSize;
            const newW = textLayer.width * ratio;
            const newH = textLayer.height * ratio;
            // Keep center fixed
            const newX = textLayer.x + (textLayer.width - newW) / 2;
            const newY = textLayer.y + (textLayer.height - newH) / 2;
            const updates: Partial<AnyLayer> = {
                fontSize: newFontSize,
                width: newW,
                height: newH,
                x: newX,
                y: newY,
            };
            // When boxWidth is set, scale it too so the text wraps proportionally
            if (textLayer.boxWidth !== undefined && textLayer.boxWidth > 0) {
                (updates as Record<string, unknown>).boxWidth = Math.max(20, textLayer.boxWidth * ratio);
            }
            handleLayerChange(selectedLayerId, updates, false);
        },
        [selectedLayerId, handleLayerChange]
    );

    const handleCropApply = useCallback(
        (croppedUri: string, newWidth: number, newHeight: number, cropRect: { x: number; y: number; width: number; height: number }) => {
            if (!selectedLayerId) return;
            const layer = projectRef.current?.layers.find((l) => l.id === selectedLayerId);
            if (!layer || layer.type !== 'image') return;
            const imgLayer = layer as ImageLayer;
            const ratio = newWidth / newHeight;
            const newBoxW = imgLayer.width;
            const newBoxH = imgLayer.width / ratio;
            // Recalculate imageScale so cropped image covers the new box
            const newImageScale = Math.max(
                newBoxW / newWidth,
                newBoxH / newHeight
            );
            handleLayerChange(selectedLayerId, {
                uri: croppedUri,
                naturalWidth: newWidth,
                naturalHeight: newHeight,
                maskWidth: newBoxW,
                maskHeight: newBoxH,
                height: newBoxH,
                offsetX: 0,
                offsetY: 0,
                imageScale: newImageScale,
                // Preserve original image for re-cropping
                originalUri: imgLayer.originalUri || imgLayer.uri,
                originalNaturalWidth: imgLayer.originalNaturalWidth || imgLayer.naturalWidth,
                originalNaturalHeight: imgLayer.originalNaturalHeight || imgLayer.naturalHeight,
                // Save crop rect so re-opening the crop modal restores the same area
                cropRect,
            } as Partial<AnyLayer>);
        },
        [selectedLayerId, handleLayerChange]
    );

    const handleLayerDragStart = useCallback(
        (layerId: string) => {
            const current = projectRef.current;
            if (!current) return;
            inTransactionRef.current = true;
            setHistory((h) => ({
                past: [...h.past, current.layers],
                future: [],
            }));
        },
        []
    );

    const handleReorder = useCallback(
        (fromIndex: number, toIndex: number) => {
            updateProjectState((prev) => {
                // Sort descending to match the DraggableLayerList display order
                const sorted = [...prev.layers].sort((a, b) => b.zIndex - a.zIndex);
                const [moved] = sorted.splice(fromIndex, 1);
                sorted.splice(toIndex, 0, moved);
                // Reassign zIndex: first item gets highest, last gets lowest
                const maxZ = sorted.length;
                const reindexed = sorted.map((layer, index) => ({ ...layer, zIndex: maxZ - index }));
                return { ...prev, layers: reindexed };
            });
        },
        [updateProjectState]
    );

    const handleToggleVisibility = useCallback(
        (layerId: string) => {
            const layer = project?.layers.find((l) => l.id === layerId);
            if (layer) handleLayerChange(layerId, { visible: !layer.visible });
        },
        [project, handleLayerChange]
    );

    const handleToggleLock = useCallback(
        (layerId: string) => {
            const layer = project?.layers.find((l) => l.id === layerId);
            if (layer) handleLayerChange(layerId, { locked: !layer.locked });
        },
        [project, handleLayerChange]
    );

    const handleDeleteLayer = useCallback(
        (layerId: string) => {
            updateProjectState((prev) => ({
                ...prev,
                layers: prev.layers.filter((l) => l.id !== layerId),
            }));
            if (selectedLayerId === layerId) setSelectedLayerId(null);
        },
        [updateProjectState, selectedLayerId]
    );

    // Keep refs in sync for the keyboard handler (declared earlier in the component)
    selectedLayerIdRef.current = selectedLayerId;
    deleteLayerRef.current = handleDeleteLayer;

    const handleDuplicateLayer = useCallback(
        (layerId: string) => {
            if (!project) return;
            const layer = project.layers.find((l) => l.id === layerId);
            if (!layer) return;
            const cloned = cloneLayer(layer);
            cloned.x += 20;
            cloned.y += 20;
            cloned.zIndex = nextZIndex(project.layers);
            updateProjectState((prev) => ({
                ...prev,
                layers: [...prev.layers, cloned],
            }));
            setSelectedLayerId(cloned.id);
        },
        [updateProjectState, project]
    );

    const handleAddText = useCallback(() => {
        const w = project?.canvasWidth ?? 1080;
        const h = project?.canvasHeight ?? 1080;
        const newLayer = buildTextLayer({
            text: '',
            canvasWidth: w,
            canvasHeight: h,
            fontSize: 50,
        });
        // Center on canvas
        newLayer.x = (w - newLayer.width) / 2;
        newLayer.y = (h - newLayer.height) / 2;
        newLayer.zIndex = nextZIndex(project?.layers ?? []);
        updateProjectState((prev) => ({
            ...prev,
            layers: [...prev.layers, newLayer],
        }));
        skipDrawerResetRef.current = true;
        setSelectedLayerId(newLayer.id);
        setAddDrawerOpen(false);
        setTextEditDrawerOpen(true);
    }, [updateProjectState, project]);

    const handleAddShape = useCallback((shape: ShapeLayer['shape']) => {
        const w = project?.canvasWidth ?? 1080;
        const h = project?.canvasHeight ?? 1080;
        const shapeW = w * 0.25;
        const shapeH = w * 0.25;
        const newLayer = buildShapeLayer({
            shape,
            x: (w - shapeW) / 2,
            y: (h - shapeH) / 2,
            width: shapeW,
            height: shapeH,
        });
        newLayer.zIndex = nextZIndex(project?.layers ?? []);
        updateProjectState((prev) => ({
            ...prev,
            layers: [...prev.layers, newLayer],
        }));
        setSelectedLayerId(newLayer.id);
        setAddDrawerOpen(false);
    }, [updateProjectState, project]);

    const handleAddDynamicField = useCallback(() => {
        const w = project?.canvasWidth ?? 1080;
        const h = project?.canvasHeight ?? 1080;
        const newLayer = buildDynamicFieldLayer({
            variableId: generateFieldId(project!),
            variableName: t('newField') || 'حقل جديد',
            fieldType: 'text',
            fontSize: 50,
        });
        // Center on canvas
        newLayer.x = (w - newLayer.width) / 2;
        newLayer.y = (h - newLayer.height) / 2;
        newLayer.zIndex = nextZIndex(project?.layers ?? []);
        updateProjectState((prev) => ({
            ...prev,
            layers: [...prev.layers, newLayer],
        }));
        setSelectedLayerId(newLayer.id);
        setAddDrawerOpen(false);
    }, [updateProjectState, project, t]);

    const handleFileSelect = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const files = Array.from(e.target.files || []);
            if (files.length === 0 || !project) return;

            // Project box dimensions (matching project aspect)
            const projectRatio = project.canvasWidth / project.canvasHeight;
            const boxSize = Math.min(project.canvasWidth, project.canvasHeight) * 0.6;
            let boxW: number, boxH: number;
            if (projectRatio >= 1) {
                boxW = boxSize;
                boxH = boxSize / projectRatio;
            } else {
                boxH = boxSize;
                boxW = boxSize * projectRatio;
            }

            // Load all files to get URIs + natural sizes
            const maxImages = Math.min(files.length, 4);
            const promises = files.slice(0, maxImages).map((file) => {
                return new Promise<{ uri: string; width: number; height: number }>((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        const uri = event.target?.result as string;
                        const img = new Image();
                        img.onload = () => resolve({ uri, width: img.naturalWidth, height: img.naturalHeight });
                        img.src = uri;
                    };
                    reader.readAsDataURL(file);
                });
            });

            Promise.all(promises).then((results) => {
                if (results.length === 1) {
                    // Single image — normal image layer
                    const { uri, width: nw, height: nh } = results[0];
                    const newLayer = buildImageLayer({
                        uri,
                        naturalWidth: nw,
                        naturalHeight: nh,
                        x: (project.canvasWidth - boxW) / 2,
                        y: (project.canvasHeight - boxH) / 2,
                        canvasWidth: project.canvasWidth,
                        canvasHeight: project.canvasHeight,
                    });
                    newLayer.width = boxW;
                    newLayer.height = boxH;
                    newLayer.maskWidth = boxW;
                    newLayer.maskHeight = boxH;
                    newLayer.imageScale = Math.max(boxW / nw, boxH / nh) * 1.1;
                    newLayer.zIndex = nextZIndex(project.layers);
                    updateProjectState((prev) => ({
                        ...prev,
                        layers: [...prev.layers, newLayer],
                    }));
                    setSelectedLayerId(newLayer.id);
                    setAddDrawerOpen(false);
                } else {
                    // Multiple images — collage layer
                    const uris = results.map(r => r.uri);
                    const naturalSizes = results.map(r => ({ width: r.width, height: r.height }));
                    const layout = COLLAGE_LAYOUTS.find(l => l.count === uris.length) || COLLAGE_LAYOUTS[0];
                    const newLayer = buildCollageLayer({
                        uris,
                        naturalSizes,
                        layoutId: layout.id,
                        canvasWidth: project.canvasWidth,
                        canvasHeight: project.canvasHeight,
                    });
                    // Override box dimensions to match project aspect
                    newLayer.width = boxW;
                    newLayer.height = boxH;
                    newLayer.maskWidth = boxW;
                    newLayer.maskHeight = boxH;
                    newLayer.x = (project.canvasWidth - boxW) / 2;
                    newLayer.y = (project.canvasHeight - boxH) / 2;
                    newLayer.zIndex = nextZIndex(project.layers);
                    updateProjectState((prev) => ({
                        ...prev,
                        layers: [...prev.layers, newLayer],
                    }));
                    setSelectedLayerId(newLayer.id);
                    setAddDrawerOpen(false);
                }
            });
            e.target.value = '';
        },
        [project, updateProjectState]
    );

    const handleReplaceImage = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file || !selectedLayerId) return;
            const currentLayer = projectRef.current?.layers.find(l => l.id === selectedLayerId);
            const reader = new FileReader();
            reader.onload = (event) => {
                const uri = event.target?.result as string;
                const img = new Image();
                img.onload = () => {
                    // Compute imageScale so the new image covers the existing layer box
                    // (like object-fit: cover) — use max so the image fills the box.
                    const boxW = currentLayer?.width ?? img.naturalWidth;
                    const boxH = currentLayer?.height ?? img.naturalHeight;
                    const scale = Math.max(
                        boxW / img.naturalWidth,
                        boxH / img.naturalHeight
                    );
                    handleLayerChange(selectedLayerId, {
                        uri,
                        originalUri: uri,
                        originalNaturalWidth: img.naturalWidth,
                        originalNaturalHeight: img.naturalHeight,
                        naturalWidth: img.naturalWidth,
                        naturalHeight: img.naturalHeight,
                        maskWidth: boxW,
                        maskHeight: boxH,
                        offsetX: 0,
                        offsetY: 0,
                        imageScale: scale,
                    } as Partial<AnyLayer>);
                };
                img.src = uri;
            };
            reader.readAsDataURL(file);
            e.target.value = '';
        },
        [selectedLayerId, handleLayerChange]
    );

    // Change collage layout (only between layouts with the same image count)
    const handleCollageLayoutChange = useCallback(
        (layerId: string, layoutId: string) => {
            const current = projectRef.current;
            if (!current) return;
            const layer = current.layers.find(l => l.id === layerId);
            if (!layer || layer.type !== 'image' || !layer.collage) return;
            handleLayerChange(layerId, {
                collage: { ...layer.collage, layout: layoutId },
            } as Partial<AnyLayer>);
        },
        [handleLayerChange]
    );

    if (loading) {
        return (
            <div className="flex h-svh items-center justify-center">
                <LoadingSpinner size="lg" />
            </div>
        );
    }

    if (!project) {
        return (
            <div className="flex h-svh flex-col items-center justify-center gap-4 text-center">
                <h2 className="text-xl font-semibold text-foreground">{t('notFoundTitle')}</h2>
                <p className="text-secondary">{t('notFoundDescription')}</p>
                <Button onClick={handleNavigateBack}>
                    <LuArrowLeft className="me-2 h-4 w-4 rtl:rotate-180" />
                    {t('backToProjects')}
                </Button>
            </div>
        );
    }

    const selectedLayer = project.layers.find((l) => l.id === selectedLayerId) || null;

    // Capture the canvas as a snapshot image for the mobile eye dropper fallback
    const captureCanvasSnapshot = async (): Promise<string | null> => {
        if (!canvasRef.current || !project) return null;
        try {
            // Temporarily hide selection for a clean snapshot
            const prevSelection = selectedLayerId;
            setSelectedLayerId(null);
            setIsExporting(true);
            await new Promise((r) => setTimeout(r, 100));
            const dataUrl = await toJpeg(canvasRef.current, {
                quality: 0.95,
                backgroundColor: project.backgroundColor || '#ffffff',
                pixelRatio: 1,
            });
            setIsExporting(false);
            setSelectedLayerId(prevSelection);
            return dataUrl;
        } catch {
            setIsExporting(false);
            return null;
        }
    };

    // Unified eye dropper — uses native API on desktop, canvas snapshot on mobile
    const pickColor = async (onPick: (color: string) => void): Promise<void> => {
        const EyeDropperAPI = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
        if (EyeDropperAPI) {
            try {
                const eyeDropper = new EyeDropperAPI();
                const result = await eyeDropper.open();
                onPick(result.sRGBHex);
            } catch {
                // user cancelled
            }
        } else {
            // Mobile fallback — capture canvas and show tap-to-pick overlay
            const dataUrl = await captureCanvasSnapshot();
            if (dataUrl) {
                setMobileEyeDropper({ dataUrl, onPick });
            }
        }
    };

    // Eye dropper: close drawer → pick color from screen → apply → reopen drawer
    const handleEyeDropper = async () => {
        const EyeDropperAPI = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;

        eyeDropperReopenRef.current = colorPickerProp;
        setColorPickerProp(null);

        const applyColor = (pickedColor: string) => {
            const prop = eyeDropperReopenRef.current;
            if (prop) {
                if (prop === 'canvas.bg') {
                    handleBackgroundColorChange(pickedColor);
                } else if (selectedLayer) {
                    if (prop === 'image.collageBg') {
                        const imgLayer = selectedLayer as ImageLayer;
                        if (imgLayer.collage) {
                            handleLayerChange(selectedLayer.id, {
                                collage: { ...imgLayer.collage, bgColor: pickedColor },
                            } as Partial<AnyLayer>);
                        }
                    } else {
                        handleLayerChange(selectedLayer.id, getColorPickerUpdate(prop, pickedColor));
                    }
                }
            }
            setColorPickerProp(eyeDropperReopenRef.current);
            eyeDropperReopenRef.current = null;
        };

        if (EyeDropperAPI) {
            try {
                const eyeDropper = new EyeDropperAPI();
                const result = await eyeDropper.open();
                applyColor(result.sRGBHex);
            } catch {
                if (eyeDropperReopenRef.current) {
                    setColorPickerProp(eyeDropperReopenRef.current);
                }
                eyeDropperReopenRef.current = null;
            }
        } else {
            // Mobile fallback
            const dataUrl = await captureCanvasSnapshot();
            if (dataUrl) {
                setMobileEyeDropper({
                    dataUrl,
                    onPick: (color) => {
                        applyColor(color);
                    },
                });
            } else {
                // Restore drawer if capture failed
                if (eyeDropperReopenRef.current) {
                    setColorPickerProp(eyeDropperReopenRef.current);
                }
                eyeDropperReopenRef.current = null;
            }
        }
    };

    // Direct eye dropper for text color — no color picker drawer needed
    const handleTextEyeDropper = async () => {
        if (!selectedLayerId) return;
        await pickColor((pickedColor) => {
            handleLayerChange(selectedLayerId, { color: pickedColor } as Partial<AnyLayer>);
        });
    };

    return (
        <DndProvider backend={HTML5Backend}>
            <div className="relative flex h-svh flex-col">
                {/* Top toolbar */}
                <div className="flex h-14 w-full max-w-full shrink-0 items-center justify-between gap-2 overflow-hidden border-b border-stroke bg-toolbar-bg px-3 sm:px-4">
                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                        <Button variant="ghost" size="sm" onClick={handleNavigateBack}>
                            <LuArrowLeft className="h-4 w-4 rtl:rotate-180" />
                        </Button>
                        <h1 className="min-w-0 truncate text-sm font-semibold text-foreground sm:text-base">
                            {project.name}
                        </h1>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                setRenameValue(project.name);
                                setRenameOpen(true);
                            }}
                            aria-label={t('renameProject')}
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
                                onClick={handleRedo}
                                disabled={history.future.length === 0}
                                aria-label={t('redo')}
                            >
                                <LuRedo2 className="h-4 w-4 rtl:-scale-x-100" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleUndo}
                                disabled={history.past.length === 0}
                                aria-label={t('undo')}
                            >
                                <LuUndo2 className="h-4 w-4 rtl:-scale-x-100" />
                            </Button>
                        </div>

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setLayersDrawerOpen(true)}
                            className="gap-1 px-2 sm:px-3"
                        >
                            <LuLayers className="h-4 w-4" />
                            <span className="hidden sm:inline">{t('layers')}</span>
                        </Button>

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleExportJpg}
                            className="gap-1 px-2 sm:px-3"
                        >
                            <LuDownload className="h-4 w-4" />
                            <span className="hidden sm:inline">{t('export')}</span>
                        </Button>

                        <Button
                            variant="primary"
                            size="sm"
                            onClick={() => flushPersist(project)}
                            loading={saving}
                            className="relative gap-1 px-2 sm:px-3"
                        >
                            <LuSave className="h-4 w-4" />
                            <span className="hidden sm:inline">{t('save')}</span>
                            {hasUnsavedChanges && !saving && (
                                <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
                                    <span className="relative inline-flex h-3 w-3 rounded-full bg-orange-500" />
                                </span>
                            )}
                        </Button>
                    </div>
                </div>

                {/* Main editor area — canvas only, panels are drawers now */}
                <div className="relative flex flex-1 overflow-hidden">
                    {/* Center: canvas — always centered, fits to screen */}
                    <div
                        ref={canvasContainerRef}
                        className="relative flex flex-1 items-center justify-center overflow-hidden bg-canvas-bg touch-none transition-[padding] duration-200 ease-out"
                        style={{ paddingBottom: bottomBarHeight }}
                    >
                        {zoom > 0 && (
                            <div
                                className="shadow-2xl transition-[width,height] duration-150 ease-out"
                                style={{
                                    width: project.canvasWidth * zoom,
                                    height: project.canvasHeight * zoom,
                                }}
                            >
                                <div
                                    style={{
                                        width: project.canvasWidth,
                                        height: project.canvasHeight,
                                        transform: `scale(${zoom})`,
                                        transformOrigin: 'top right',
                                    }}
                                >
                                    <Canvas
                                        ref={canvasRef}
                                        width={project.canvasWidth}
                                        height={project.canvasHeight}
                                        backgroundColor={project.backgroundColor ?? '#ffffff'}
                                        backgroundUri={project.backgroundUri}
                                        layers={project.layers}
                                        selectedLayerId={selectedLayerId || undefined}
                                        onSelectLayer={(id) => {
                                            setSelectedLayerId(id);
                                        }}
                                        onLayerChange={handleLayerChange}
                                        onLayerDragStart={handleLayerDragStart}
                                        onDuplicateLayer={handleDuplicateLayer}
                                        onDeleteLayer={handleDeleteLayer}
                                        scale={zoom}
                                        showGrid={!isExporting}
                                        onAlign={handleAlign}
                                        onVerticalAlign={handleVerticalAlign}
                                        onEditText={() => setTextEditDrawerOpen(true)}
                                        onCropImage={() => setIsCropOpen(true)}
                                        onEditCollage={() => setCollageEditOpen(true)}
                                        freeDrag={freeDrag}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Bottom bar — shown when no layer is selected (mobile style) */}
                    {!selectedLayer && (
                        <div ref={bottomBarRef} className="absolute bottom-0 left-0 right-0 z-20 border-t border-stroke bg-toolbar-bg">
                            <div className="no-scrollbar flex h-20 items-center gap-1 overflow-x-auto px-2 py-1.5">
                                <PropButton
                                    label={t('canvasBackground')}
                                    swatch={project.backgroundColor ?? '#ffffff'}
                                    icon={<LuPalette className="h-5 w-5" />}
                                    active={colorPickerProp === 'canvas.bg'}
                                    onClick={() => setColorPickerProp(colorPickerProp === 'canvas.bg' ? null : 'canvas.bg')}
                                />
                                <PropToggle
                                    label={project.backgroundUri ? t('changeBgImage') : t('setBgImage')}
                                    icon={<LuImage className="h-5 w-5" />}
                                    active={false}
                                    onClick={() => bgFileInputRef.current?.click()}
                                />
                                {project.backgroundUri && (
                                    <PropToggle
                                        label={t('removeBgImage')}
                                        icon={<LuTrash2 className="h-5 w-5 text-error" />}
                                        active={false}
                                        onClick={handleRemoveBackgroundImage}
                                    />
                                )}
                                <PropToggle
                                    label={freeDrag ? t('freeDragOn') : t('freeDragOff')}
                                    icon={freeDrag ? <LuLockOpen className="h-5 w-5" /> : <LuLock className="h-5 w-5" />}
                                    active={freeDrag}
                                    onClick={() => setFreeDrag(!freeDrag)}
                                />
                            </div>
                        </div>
                    )}

                    {/* Floating + button — bottom right, sits just above the bottom bar */}
                    <button
                        type="button"
                        onClick={() => setAddDrawerOpen(true)}
                        className="absolute right-6 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-brand-primary text-primary-text shadow-xl transition-[bottom] duration-200 ease-out hover:scale-105 active:scale-95"
                        style={{ bottom: bottomBarHeight + 16 }}
                        aria-label={t('addElement')}
                    >
                        <LuPlus className="h-7 w-7" />
                    </button>

                    {/* Hidden file inputs */}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={handleFileSelect}
                    />
                    <input
                        ref={bgFileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleBackgroundImageChange}
                    />
                    <input
                        ref={replaceImageInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleReplaceImage}
                    />

                    {/* Properties bar */}
                    {selectedLayer && (
                        <PropertiesBar
                            selectedLayer={selectedLayer}
                            bottomBarRef={bottomBarRef}
                            onLayerChange={handleLayerChange}
                            activeProp={activeProp}
                            setActiveProp={setActiveProp}
                            colorPickerProp={colorPickerProp}
                            setColorPickerProp={setColorPickerProp}
                            fontDrawerOpen={fontDrawerOpen}
                            setFontDrawerOpen={setFontDrawerOpen}
                            textEditDrawerOpen={textEditDrawerOpen}
                            setTextEditDrawerOpen={setTextEditDrawerOpen}
                            setCollageEditOpen={setCollageEditOpen}
                            setIsCropOpen={setIsCropOpen}
                            replaceImageInputRef={replaceImageInputRef}
                            onDuplicateLayer={handleDuplicateLayer}
                            onDeleteLayer={handleDeleteLayer}
                            onEyeDropper={handleTextEyeDropper}
                        />
                    )}
                </div>

                {/* Add drawer — text, image, shapes */}
                <Drawer
                    isOpen={addDrawerOpen}
                    onClose={() => setAddDrawerOpen(false)}
                    title={t('addElement')}
                    height="half"
                >
                    {/* Add text, image, field options */}
                    <div className="mb-6">
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={handleAddText}
                                className="flex flex-col items-center gap-2 rounded-xl border border-stroke bg-card-bg p-4 transition-colors hover:border-brand-primary hover:bg-brand-primary-light/10"
                            >
                                <LuType className="h-8 w-8 text-brand-primary" />
                                <span className="text-sm font-medium text-foreground">{t('addText')}</span>
                            </button>
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="flex flex-col items-center gap-2 rounded-xl border border-stroke bg-card-bg p-4 transition-colors hover:border-brand-primary hover:bg-brand-primary-light/10"
                            >
                                <LuImage className="h-8 w-8 text-brand-primary" />
                                <span className="text-sm font-medium text-foreground">{t('addImage')}</span>
                            </button>
                            {project?.kind === 'booking_template' && (
                                <button
                                    onClick={handleAddDynamicField}
                                    className="col-span-2 flex flex-col items-center gap-2 rounded-xl border border-stroke bg-card-bg p-4 transition-colors hover:border-brand-primary hover:bg-brand-primary-light/10"
                                >
                                    <LuText className="h-8 w-8 text-brand-primary" />
                                    <span className="text-sm font-medium text-foreground">{t('addField')}</span>
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Shapes */}
                    <div>
                        <h3 className="mb-3 text-sm font-medium text-secondary">{t('addShape')}</h3>
                        <div className="no-scrollbar flex gap-3 overflow-x-auto pb-2">
                            {SHAPES.map(({ shape, labelKey }) => (
                                <button
                                    key={shape}
                                    onClick={() => handleAddShape(shape)}
                                    className="flex w-20 shrink-0 flex-col items-center gap-2 rounded-xl border border-stroke bg-card-bg p-3 transition-colors hover:border-brand-primary hover:bg-brand-primary-light/10"
                                >
                                    <ShapeRenderer
                                        shape={shape}
                                        width={40}
                                        height={40}
                                        fillColor="var(--brand-primary)"
                                        strokeColor="var(--brand-primary)"
                                        strokeWidth={2}
                                        filled
                                    />
                                    <span className="text-xs text-secondary">{t(`toolbars.shape.${labelKey}`)}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </Drawer>

                {/* Layers drawer */}
                <Drawer
                    isOpen={layersDrawerOpen}
                    onClose={() => setLayersDrawerOpen(false)}
                    title={t('layers')}
                    height="half"
                >
                    <DraggableLayerList
                        layers={project.layers}
                        selectedId={selectedLayerId || undefined}
                        onSelect={(layerId) => {
                            setSelectedLayerId(layerId);
                            setLayersDrawerOpen(false);
                        }}
                        onReorder={handleReorder}
                        onToggleVisibility={handleToggleVisibility}
                        onToggleLock={handleToggleLock}
                        onDelete={handleDeleteLayer}
                    />
                </Drawer>

                {/* Property drawer — shows the slider control for the active property */}
                <Drawer
                    isOpen={!!activeProp && !!selectedLayer}
                    onClose={() => setActiveProp(null)}
                    title={selectedLayer ? t('properties') : ''}
                    height="auto"
                >
                    {selectedLayer && activeProp && (
                        <div className="space-y-4">
                            {/* Text: fontSize */}
                            {activeProp === 'text.fontSize' && (
                                <SliderField
                                    label={t('toolbars.text.size')}
                                    value={(selectedLayer as TextLayer).fontSize}
                                    min={1}
                                    max={300}
                                    onChange={(v) => handleFontSizeChange(v)}
                                    onDragStart={startChangeTransaction}
                                />
                            )}
                            {/* Text: lineHeight */}
                            {activeProp === 'text.lineHeight' && (
                                <SliderField
                                    label={t('toolbars.text.lineHeight')}
                                    value={(selectedLayer as TextLayer).lineHeight}
                                    min={0.5}
                                    max={2.5}
                                    step={0.1}
                                    onChange={(v) => handleLayerChange(selectedLayer.id, { lineHeight: v } as Partial<AnyLayer>)}
                                    onDragStart={startChangeTransaction}
                                />
                            )}
                            {/* Text: opacity */}
                            {activeProp === 'text.opacity' && (
                                <SliderField
                                    label={t('toolbars.text.opacity')}
                                    value={(selectedLayer as TextLayer).opacity * 100}
                                    min={0}
                                    max={100}
                                    suffix="%"
                                    onChange={(v) => handleLayerChange(selectedLayer.id, { opacity: v / 100 } as Partial<AnyLayer>)}
                                    onDragStart={startChangeTransaction}
                                />
                            )}
                            {/* Image: aspect ratio */}
                            {activeProp === 'image.aspectRatio' && (
                                <div className="space-y-3">
                                    <label className="block text-sm font-medium text-foreground">
                                        {t('toolbars.image.aspectRatio')}
                                    </label>
                                    <div className="no-scrollbar flex gap-3 overflow-x-auto pb-2">
                                        {ASPECT_RATIOS.map((ratio) => {
                                            const currentRatio = (selectedLayer as ImageLayer).width / (selectedLayer as ImageLayer).height;
                                            const isSelected = Math.abs(currentRatio - ratio.ratio) < 0.01;
                                            const boxW = ratio.ratio >= 1 ? 48 : Math.round(48 * ratio.ratio);
                                            const boxH = ratio.ratio >= 1 ? Math.round(48 / ratio.ratio) : 48;
                                            return (
                                                <button
                                                    key={ratio.label}
                                                    onClick={() => {
                                                        const layer = selectedLayer as ImageLayer;
                                                        const currentW = layer.width;
                                                        const currentH = layer.height;
                                                        const base = Math.max(currentW, currentH);
                                                        let newW: number, newH: number;
                                                        if (ratio.ratio >= 1) {
                                                            newW = base;
                                                            newH = base / ratio.ratio;
                                                        } else {
                                                            newH = base;
                                                            newW = base * ratio.ratio;
                                                        }
                                                        const newX = layer.x + (currentW - newW) / 2;
                                                        const newY = layer.y + (currentH - newH) / 2;
                                                        // Recalculate imageScale so image always covers the new box
                                                        const newImageScale = Math.max(
                                                            newW / layer.naturalWidth,
                                                            newH / layer.naturalHeight
                                                        );
                                                        handleLayerChange(layer.id, {
                                                            width: newW, height: newH,
                                                            maskWidth: newW, maskHeight: newH,
                                                            imageScale: newImageScale,
                                                            offsetX: 0, offsetY: 0,
                                                            x: newX, y: newY,
                                                        } as Partial<AnyLayer>);
                                                    }}
                                                    className={`flex w-20 shrink-0 flex-col items-center gap-2 rounded-xl border p-3 text-center transition-colors ${isSelected
                                                        ? 'border-brand-primary bg-brand-primary text-white'
                                                        : 'border-stroke bg-card-bg text-foreground hover:border-brand-primary hover:bg-brand-primary-light/10'
                                                        }`}
                                                >
                                                    <div className="flex h-12 items-center justify-center">
                                                        <div
                                                            className={`rounded border-2 ${isSelected ? 'border-white/60 bg-white/10' : 'border-foreground/40 bg-foreground/5'}`}
                                                            style={{ width: boxW, height: boxH }}
                                                        />
                                                    </div>
                                                    <p className="text-xs font-semibold">{ratio.label}</p>
                                                    <p className={`text-xs ${isSelected ? 'text-white/80' : 'text-secondary'}`}>{ratio.name}</p>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                            {/* Image: collage layout */}
                            {activeProp === 'image.collageLayout' && (selectedLayer as ImageLayer).collage && (() => {
                                const collage = (selectedLayer as ImageLayer).collage!;
                                const imageCount = collage.uris.length;
                                const availableLayouts = COLLAGE_LAYOUTS.filter(l => l.count === imageCount);
                                return (
                                    <div className="space-y-3">
                                        <label className="block text-sm font-medium text-foreground">
                                            {t('toolbars.image.collageLayout')}
                                        </label>
                                        <div className="no-scrollbar flex gap-3 overflow-x-auto pb-2">
                                            {availableLayouts.map((layout) => {
                                                const isSelected = collage.layout === layout.id;
                                                return (
                                                    <button
                                                        key={layout.id}
                                                        onClick={() => handleCollageLayoutChange(selectedLayer.id, layout.id)}
                                                        className={`flex w-20 shrink-0 flex-col items-center gap-2 rounded-xl border p-3 text-center transition-colors ${isSelected
                                                            ? 'border-brand-primary bg-brand-primary text-white'
                                                            : 'border-stroke bg-card-bg text-foreground hover:border-brand-primary hover:bg-brand-primary-light/10'
                                                            }`}
                                                    >
                                                        {/* Mini layout preview */}
                                                        <div className="relative h-12 w-12">
                                                            {layout.cells.map((cell, i) => (
                                                                <div
                                                                    key={i}
                                                                    className={`absolute rounded-sm border ${isSelected ? 'border-white/60 bg-white/30' : 'border-foreground/40 bg-foreground/10'}`}
                                                                    style={{
                                                                        left: `${cell.x * 100}%`,
                                                                        top: `${cell.y * 100}%`,
                                                                        width: `${cell.w * 100}%`,
                                                                        height: `${cell.h * 100}%`,
                                                                    }}
                                                                />
                                                            ))}
                                                        </div>
                                                        <p className={`text-[10px] ${isSelected ? 'text-white/80' : 'text-secondary'}`}>{layout.name}</p>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })()}
                            {/* Image: collage gap */}
                            {activeProp === 'image.collageGap' && (selectedLayer as ImageLayer).collage && (() => {
                                const collage = (selectedLayer as ImageLayer).collage!;
                                return (
                                    <SliderField
                                        label={t('toolbars.image.collageGap')}
                                        value={collage.gap ?? 4}
                                        min={0}
                                        max={40}
                                        suffix="px"
                                        onChange={(v) => handleLayerChange(selectedLayer.id, {
                                            collage: { ...collage, gap: v },
                                        } as Partial<AnyLayer>)}
                                        onDragStart={startChangeTransaction}
                                    />
                                );
                            })()}
                            {/* Image: collage container rounded */}
                            {activeProp === 'image.collageRounded' && (selectedLayer as ImageLayer).collage && (() => {
                                const collage = (selectedLayer as ImageLayer).collage!;
                                return (
                                    <SliderField
                                        label={t('toolbars.image.collageRounded')}
                                        value={collage.containerRadius ?? 0}
                                        min={0}
                                        max={200}
                                        suffix="px"
                                        onChange={(v) => handleLayerChange(selectedLayer.id, {
                                            collage: { ...collage, containerRadius: v },
                                        } as Partial<AnyLayer>)}
                                        onDragStart={startChangeTransaction}
                                    />
                                );
                            })()}
                            {/* Image: opacity */}
                            {activeProp === 'image.opacity' && (
                                <SliderField
                                    label={t('toolbars.image.opacity')}
                                    value={(selectedLayer as ImageLayer).opacity * 100}
                                    min={0}
                                    max={100}
                                    suffix="%"
                                    onChange={(v) => handleLayerChange(selectedLayer.id, { opacity: v / 100 } as Partial<AnyLayer>)}
                                    onDragStart={startChangeTransaction}
                                />
                            )}
                            {/* Image: borderRadius */}
                            {activeProp === 'image.borderRadius' && (
                                <SliderField
                                    label={t('toolbars.image.borderRadius')}
                                    value={(selectedLayer as ImageLayer).borderRadius}
                                    min={0}
                                    max={200}
                                    onChange={(v) => handleLayerChange(selectedLayer.id, { borderRadius: v } as Partial<AnyLayer>)}
                                    onDragStart={startChangeTransaction}
                                />
                            )}
                            {/* Image: borderWidth */}
                            {activeProp === 'image.borderWidth' && (
                                <SliderField
                                    label={t('toolbars.image.borderWidth')}
                                    value={(selectedLayer as ImageLayer).borderWidth}
                                    min={0}
                                    max={50}
                                    onChange={(v) => handleLayerChange(selectedLayer.id, { borderWidth: v } as Partial<AnyLayer>)}
                                    onDragStart={startChangeTransaction}
                                />
                            )}
                            {/* Shape: strokeWidth */}
                            {activeProp === 'shape.strokeWidth' && (
                                <SliderField
                                    label={t('toolbars.shape.strokeWidth')}
                                    value={(selectedLayer as ShapeLayer).strokeWidth}
                                    min={0}
                                    max={50}
                                    onChange={(v) => handleLayerChange(selectedLayer.id, { strokeWidth: v } as Partial<AnyLayer>)}
                                    onDragStart={startChangeTransaction}
                                />
                            )}
                            {/* Shape: opacity */}
                            {activeProp === 'shape.opacity' && (
                                <SliderField
                                    label={t('toolbars.shape.opacity')}
                                    value={(selectedLayer as ShapeLayer).opacity * 100}
                                    min={0}
                                    max={100}
                                    suffix="%"
                                    onChange={(v) => handleLayerChange(selectedLayer.id, { opacity: v / 100 } as Partial<AnyLayer>)}
                                    onDragStart={startChangeTransaction}
                                />
                            )}
                            {/* Shape: cornerRadius */}
                            {activeProp === 'shape.cornerRadius' && (
                                <SliderField
                                    label={t('toolbars.shape.cornerRadius')}
                                    value={(selectedLayer as ShapeLayer).cornerRadius ?? 0}
                                    min={0}
                                    max={200}
                                    onChange={(v) => handleLayerChange(selectedLayer.id, { cornerRadius: v } as Partial<AnyLayer>)}
                                    onDragStart={startChangeTransaction}
                                />
                            )}
                            {/* Dynamic field: opacity */}
                            {activeProp === 'df.opacity' && (
                                <SliderField
                                    label={t('toolbars.dynamicField.opacity')}
                                    value={(selectedLayer as DynamicFieldLayer).opacity * 100}
                                    min={0}
                                    max={100}
                                    suffix="%"
                                    onChange={(v) => handleLayerChange(selectedLayer.id, { opacity: v / 100 } as Partial<AnyLayer>)}
                                />
                            )}
                            {/* Dynamic field: strokeWidth */}
                            {activeProp === 'df.strokeWidth' && (
                                <SliderField
                                    label={t('toolbars.dynamicField.strokeWidth')}
                                    value={(selectedLayer as DynamicFieldLayer).borderWidth ?? 0}
                                    min={0}
                                    max={50}
                                    onChange={(v) => handleLayerChange(selectedLayer.id, { borderWidth: v } as Partial<AnyLayer>)}
                                />
                            )}
                        </div>
                    )}
                </Drawer>

                {/* Color picker drawer — handles all color properties (layers + canvas bg) */}
                <ColorPickerDrawer
                    isOpen={!!colorPickerProp}
                    onClose={() => setColorPickerProp(null)}
                    onDragStart={startChangeTransaction}
                    onEyeDropper={handleEyeDropper}
                    savedColors={savedColors}
                    onSaveColor={addSavedColor}
                    onRemoveSavedColor={removeSavedColor}
                    title={colorPickerProp === 'canvas.bg' ? t('canvasBackground') : colorPickerProp ? t(`toolbars.${COLOR_PROP_TYPE_PREFIX[colorPickerProp]}.${COLOR_PROP_LABEL_KEYS[colorPickerProp]}`) : ''}
                    value={(() => {
                        if (!colorPickerProp) return '#000000';
                        if (colorPickerProp === 'canvas.bg') return project?.backgroundColor ?? '#ffffff';
                        if (!selectedLayer) return '#000000';
                        if (colorPickerProp === 'image.collageBg') return (selectedLayer as ImageLayer).collage?.bgColor ?? '#000000';
                        return getColorPickerValue(selectedLayer, colorPickerProp);
                    })()}
                    onChange={(c) => {
                        if (!colorPickerProp) return;
                        if (colorPickerProp === 'canvas.bg') {
                            handleBackgroundColorChange(c);
                            return;
                        }
                        if (!selectedLayer) return;
                        if (colorPickerProp === 'image.collageBg') {
                            const imgLayer = selectedLayer as ImageLayer;
                            if (imgLayer.collage) {
                                handleLayerChange(selectedLayer.id, {
                                    collage: { ...imgLayer.collage, bgColor: c },
                                } as Partial<AnyLayer>);
                            }
                            return;
                        }
                        handleLayerChange(selectedLayer.id, getColorPickerUpdate(colorPickerProp, c));
                    }}
                />

                {/* Font family drawer — for text layers */}
                <Drawer
                    isOpen={fontDrawerOpen}
                    onClose={() => setFontDrawerOpen(false)}
                    title={t('toolbars.text.font')}
                    height="auto"
                >
                    <div className="space-y-2">
                        {ARABIC_SAFE_FONTS.map((font) => (
                            <button
                                key={font.id}
                                onClick={() => {
                                    if (selectedLayer) {
                                        handleLayerChange(selectedLayer.id, { fontFamily: font.family, fontWeight: font.weight } as Partial<AnyLayer>);
                                    }
                                    setFontDrawerOpen(false);
                                }}
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
                </Drawer>

                {/* Text edit drawer — edit the text content */}
                <Drawer
                    isOpen={textEditDrawerOpen}
                    onClose={() => {
                        // If the text layer has no text, remove it from the canvas
                        if (selectedLayer && selectedLayer.type === 'text' && !(selectedLayer as TextLayer).text.trim()) {
                            handleDeleteLayer(selectedLayer.id);
                        }
                        setTextEditDrawerOpen(false);
                    }}
                    title={t('toolbars.text.text')}
                    height="auto"
                >
                    {selectedLayer && selectedLayer.type === 'text' && (
                        <textarea
                            autoFocus
                            value={(selectedLayer as TextLayer).text}
                            onChange={(e) => handleLayerChange(selectedLayer.id, { text: e.target.value } as Partial<AnyLayer>, false)}
                            className="w-full rounded-xl border border-stroke bg-background px-4 py-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-brand-primary"
                            style={{
                                fontFamily: resolveFontFamily((selectedLayer as TextLayer).fontFamily),
                                fontWeight: (selectedLayer as TextLayer).fontWeight || 400,
                                minHeight: 120,
                                resize: 'vertical',
                            }}
                            dir="auto"
                        />
                    )}
                </Drawer>

                <Modal
                    isOpen={renameOpen}
                    onClose={() => setRenameOpen(false)}
                    title={t('renameProject')}
                    footer={
                        <>
                            <Button variant="ghost" onClick={() => setRenameOpen(false)}>
                                {t('cancel')}
                            </Button>
                            <Button variant="primary" onClick={handleRenameProject}>
                                {t('save')}
                            </Button>
                        </>
                    }
                >
                    <Input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        placeholder={t('renameProjectPlaceholder')}
                        autoFocus
                    />
                </Modal>

                {/* Image crop modal — rendered at page level to avoid panel overflow clipping */}
                {selectedLayer?.type === 'image' && !(selectedLayer as ImageLayer).collage && (
                    <ImageCropModal
                        isOpen={isCropOpen}
                        onClose={() => setIsCropOpen(false)}
                        imageUri={(selectedLayer as ImageLayer).originalUri || (selectedLayer as ImageLayer).uri}
                        naturalWidth={(selectedLayer as ImageLayer).originalNaturalWidth || (selectedLayer as ImageLayer).naturalWidth}
                        naturalHeight={(selectedLayer as ImageLayer).originalNaturalHeight || (selectedLayer as ImageLayer).naturalHeight}
                        lastCropRect={(selectedLayer as ImageLayer).cropRect}
                        onApply={handleCropApply}
                    />
                )}
                {/* Collage edit modal */}
                {selectedLayer?.type === 'image' && (selectedLayer as ImageLayer).collage && (
                    <CollageEditModal
                        isOpen={collageEditOpen}
                        onClose={() => setCollageEditOpen(false)}
                        layer={selectedLayer as ImageLayer}
                        onUpdate={(updates) => handleLayerChange(selectedLayer.id, updates)}
                    />
                )}

                {/* Mobile eye dropper fallback — uses react-image-color-picker for touch-friendly color picking */}
                {mobileEyeDropper && (
                    <div className="fixed inset-0 z-100 flex flex-col items-center justify-center bg-black/90 p-4">
                        <p className="mb-3 text-center text-sm text-white/80">
                            {t('toolbars.text.eyeDropper')}
                        </p>
                        <div className="max-h-[75vh] max-w-full overflow-hidden rounded-lg shadow-2xl">
                            <ImageColorPicker
                                imgSrc={mobileEyeDropper.dataUrl}
                                zoom={1}
                                onColorPick={(color: string) => {
                                    // Library returns "rgb(r, g, b)" — convert to hex
                                    const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
                                    if (match) {
                                        const hex = '#' + [match[1], match[2], match[3]]
                                            .map((v) => parseInt(v).toString(16).padStart(2, '0'))
                                            .join('');
                                        mobileEyeDropper.onPick(hex);
                                    } else if (color.startsWith('#')) {
                                        mobileEyeDropper.onPick(color);
                                    }
                                    setMobileEyeDropper(null);
                                }}
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                setMobileEyeDropper(null);
                                // Restore color picker drawer if it was open
                                if (eyeDropperReopenRef.current) {
                                    setColorPickerProp(eyeDropperReopenRef.current);
                                    eyeDropperReopenRef.current = null;
                                }
                            }}
                            className="mt-4 rounded-lg bg-white/20 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-white/30"
                        >
                            {uiT('cancel')}
                        </button>
                    </div>
                )}

                {/* Unsaved changes confirmation modal */}
                {showUnsavedModal && (
                    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/60 p-4">
                        <div className="w-full max-w-sm rounded-2xl bg-background p-6 shadow-2xl">
                            <h2 className="mb-2 text-lg font-bold text-foreground">
                                {t('unsavedChangesTitle')}
                            </h2>
                            <p className="mb-6 text-sm text-secondary">
                                {t('unsavedChangesDescription')}
                            </p>
                            <div className="flex flex-col gap-2">
                                <Button
                                    onClick={() => {
                                        setShowUnsavedModal(false);
                                        doSaveAndLeave();
                                    }}
                                    className="w-full"
                                >
                                    {t('saveAndLeave')}
                                </Button>
                                <Button
                                    variant="ghost"
                                    onClick={() => {
                                        setShowUnsavedModal(false);
                                        doLeaveWithoutSaving();
                                    }}
                                    className="w-full text-secondary"
                                >
                                    {t('leaveWithoutSaving')}
                                </Button>
                                <Button
                                    variant="ghost"
                                    onClick={() => setShowUnsavedModal(false)}
                                    className="w-full"
                                >
                                    {t('cancel')}
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </DndProvider>
    );
}
