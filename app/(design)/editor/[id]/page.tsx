'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from '@/lib/i18n/strings';
import { cn } from '@/lib/utils/cn';
import { toJpeg } from 'html-to-image';
import {
    LuArrowLeft,
    LuType,
    LuImage,
    LuShapes,
    LuTrash2,
    LuCopy,
    LuSave,
    LuZoomIn,
    LuZoomOut,
    LuLayers,
    LuSlidersHorizontal,
    LuUndo2,
    LuRedo2,
    LuPencil,
    LuText,
    LuDownload,
    LuX,
} from 'react-icons/lu';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import Modal from '@/components/ui/Modal';
import ColorPicker from '@/components/ui/ColorPicker';
import Canvas from '@/components/editor/Canvas';
import DraggableLayerList from '@/components/common/DraggableLayerList';
import TextToolbar from '@/components/editor/Toolbars/TextToolbar';
import ImageToolbar from '@/components/editor/Toolbars/ImageToolbar';
import ShapeToolbar from '@/components/editor/Toolbars/ShapeToolbar';
import DynamicFieldToolbar from '@/components/editor/Toolbars/DynamicFieldToolbar';
import ImageCropModal from '@/components/editor/Modals/ImageCropModal';
import { getProject, updateProjectLocal, saveProject, syncProject } from '@/lib/store/projects';
import {
    buildTextLayer,
    buildImageLayer,
    buildShapeLayer,
    buildDynamicFieldLayer,
    nextZIndex,
    cloneLayer,
} from '@/lib/utils/layer-utils';
import type { Project, AnyLayer, TextLayer, ImageLayer, ShapeLayer, DynamicFieldLayer } from '@/types';
import Input from '@/components/ui/Input';

const MIN_ZOOM = 0.25;

function generateFieldId(project: Project): string {
    const existing = project.layers
        .filter((l) => l.type === 'dynamic_field')
        .map((l) => parseInt((l as DynamicFieldLayer).variableId.replace(/^field_/, ''), 10))
        .filter((n) => !isNaN(n));
    const max = existing.length > 0 ? Math.max(...existing) : 0;
    return `field_${max + 1}`;
}
const MAX_ZOOM = 2;
const SYNC_INTERVAL_MS = 10_000;

export default function EditorPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const t = useTranslations('editor');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const bgFileInputRef = useRef<HTMLInputElement>(null);

    const [project, setProject] = useState<Project | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [history, setHistory] = useState<{ past: AnyLayer[][]; future: AnyLayer[][] }>({
        past: [],
        future: [],
    });
    const projectRef = useRef<Project | null>(null);
    const inTransactionRef = useRef(false);
    const selectedLayerIdRef = useRef<string | null>(null);
    const deleteLayerRef = useRef<(id: string) => void>(() => { });
    const canvasRef = useRef<HTMLDivElement | null>(null);
    const [renameOpen, setRenameOpen] = useState(false);
    const [renameValue, setRenameValue] = useState('');
    const [isExporting, setIsExporting] = useState(false);
    const [isCropOpen, setIsCropOpen] = useState(false);
    const [leftPanelOpen, setLeftPanelOpen] = useState(false);
    const [rightPanelOpen, setRightPanelOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [panState, setPanState] = useState<{ isPanning: boolean; startX: number; startY: number }>({
        isPanning: false,
        startX: 0,
        startY: 0,
    });
    const [isSpacePressed, setIsSpacePressed] = useState(false);

    useEffect(() => {
        projectRef.current = project;
    }, [project]);

    useEffect(() => {
        getProject(id).then((p) => {
            setProject(p);
            setLoading(false);
            if (!p) return;
            const isMobile = window.innerWidth < 640;
            const widthRatio = isMobile ? 0.9 : 0.45;
            const heightRatio = isMobile ? 0.6 : 0.65;
            const fit = Math.min(
                (window.innerWidth * widthRatio) / p.canvasWidth,
                (window.innerHeight * heightRatio) / p.canvasHeight,
                1
            );
            setZoom(Math.max(fit, MIN_ZOOM));
        });
    }, [id]);

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 640);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    const pendingPersistRef = useRef<Project | null>(null);
    const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const saveLocal = useCallback(async (projectToSave: Project) => {
        try {
            await saveProject(projectToSave);
        } catch (error) {
            console.error('Failed to save project locally:', error);
        }
    }, []);

    const persistProject = useCallback(
        (updated: Project) => {
            pendingPersistRef.current = updated;

            if (inTransactionRef.current) {
                return;
            }

            saveLocal(updated);
        },
        [saveLocal]
    );

    const flushPersist = useCallback(async (updated: Project) => {
        pendingPersistRef.current = null;
        setSaving(true);
        await saveLocal(updated);
        if (projectRef.current) {
            await syncProject(projectRef.current.id);
        }
        setSaving(false);
    }, [saveLocal]);

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
                const current = pendingPersistRef.current;
                if (current) {
                    saveLocal(current);
                    pendingPersistRef.current = null;
                }
            }
        };
        window.addEventListener('mouseup', endTransaction);
        return () => window.removeEventListener('mouseup', endTransaction);
    }, [saveLocal]);

    useEffect(() => {
        syncIntervalRef.current = setInterval(async () => {
            const currentId = projectRef.current?.id;
            if (!currentId) return;
            setSaving(true);
            await syncProject(currentId);
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

    const handleBackgroundColorChange = useCallback(async (color: string) => {
        if (!project) return;
        await updateProjectLocal(project.id, { backgroundColor: color });
        setProject((prev) => (prev ? { ...prev, backgroundColor: color } : prev));
    }, [project]);

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
            if (e.code === 'Space') {
                e.preventDefault();
                setIsSpacePressed(true);
                return;
            }
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
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                setIsSpacePressed(false);
                setPanState((prev) => ({ ...prev, isPanning: false }));
            }
        };
        const handleMouseUp = () => {
            setPanState((prev) => ({ ...prev, isPanning: false }));
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        window.addEventListener('mouseup', handleMouseUp);
        const flushBeforeLeave = () => {
            const current = pendingPersistRef.current || projectRef.current;
            if (!current) return;
            saveProject(current).catch((err) =>
                console.error('Failed to save project locally before leaving:', err)
            );
            syncProject(current.id).catch((err) =>
                console.error('Failed to sync project before leaving:', err)
            );
        };
        window.addEventListener('beforeunload', flushBeforeLeave);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('beforeunload', flushBeforeLeave);
            if (syncIntervalRef.current) {
                clearInterval(syncIntervalRef.current);
            }
            flushBeforeLeave();
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

    const handleCropApply = useCallback(
        (croppedUri: string, newWidth: number, newHeight: number) => {
            if (!selectedLayerId) return;
            const layer = projectRef.current?.layers.find((l) => l.id === selectedLayerId);
            if (!layer) return;
            const ratio = newWidth / newHeight;
            handleLayerChange(selectedLayerId, {
                uri: croppedUri,
                naturalWidth: newWidth,
                naturalHeight: newHeight,
                maskWidth: newWidth,
                maskHeight: newHeight,
                height: layer.width / ratio,
                offsetX: 0,
                offsetY: 0,
                imageScale: 1,
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
                const sorted = [...prev.layers].sort((a, b) => a.zIndex - b.zIndex);
                const [moved] = sorted.splice(fromIndex, 1);
                sorted.splice(toIndex, 0, moved);
                const reindexed = sorted.map((layer, index) => ({ ...layer, zIndex: index + 1 }));
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
            updateProjectState((prev) => {
                const layer = prev.layers.find((l) => l.id === layerId);
                if (!layer) return prev;
                const cloned = cloneLayer(layer);
                cloned.x += 20;
                cloned.y += 20;
                cloned.zIndex = nextZIndex(prev.layers);
                return { ...prev, layers: [...prev.layers, cloned] };
            });
        },
        [updateProjectState]
    );

    const handleAddText = useCallback(() => {
        updateProjectState((prev) => {
            const layer = buildTextLayer({
                text: t('newText') || 'نص جديد',
                x: prev.canvasWidth * 0.1,
                y: prev.canvasHeight * 0.1,
                canvasWidth: prev.canvasWidth,
                canvasHeight: prev.canvasHeight,
            });
            layer.zIndex = nextZIndex(prev.layers);
            setSelectedLayerId(layer.id);
            setLeftPanelOpen(false);
            setRightPanelOpen(true);
            return { ...prev, layers: [...prev.layers, layer] };
        });
    }, [updateProjectState, t]);

    const handleAddShape = useCallback(() => {
        updateProjectState((prev) => {
            const layer = buildShapeLayer({
                shape: 'rectangle',
                x: prev.canvasWidth * 0.1,
                y: prev.canvasHeight * 0.1,
                width: prev.canvasWidth * 0.25,
                height: prev.canvasWidth * 0.25,
            });
            layer.zIndex = nextZIndex(prev.layers);
            setSelectedLayerId(layer.id);
            setLeftPanelOpen(false);
            setRightPanelOpen(true);
            return { ...prev, layers: [...prev.layers, layer] };
        });
    }, [updateProjectState]);

    const handleAddDynamicField = useCallback(() => {
        updateProjectState((prev) => {
            const layer = buildDynamicFieldLayer({
                variableId: generateFieldId(prev),
                variableName: t('newField') || 'حقل جديد',
                fieldType: 'text',
                x: prev.canvasWidth * 0.1,
                y: prev.canvasHeight * 0.1,
            });
            layer.zIndex = nextZIndex(prev.layers);
            setSelectedLayerId(layer.id);
            setLeftPanelOpen(false);
            setRightPanelOpen(true);
            return { ...prev, layers: [...prev.layers, layer] };
        });
    }, [updateProjectState, t]);

    const handleFileSelect = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file || !project) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                const uri = event.target?.result as string;
                const img = new Image();
                img.onload = () => {
                    updateProjectState((prev) => {
                        const layer = buildImageLayer({
                            uri,
                            naturalWidth: img.naturalWidth,
                            naturalHeight: img.naturalHeight,
                            x: prev.canvasWidth * 0.1,
                            y: prev.canvasHeight * 0.1,
                            canvasWidth: prev.canvasWidth,
                            canvasHeight: prev.canvasHeight,
                        });
                        layer.zIndex = nextZIndex(prev.layers);
                        setSelectedLayerId(layer.id);
                        setLeftPanelOpen(false);
                        setRightPanelOpen(true);
                        return { ...prev, layers: [...prev.layers, layer] };
                    });
                };
                img.src = uri;
            };
            reader.readAsDataURL(file);
            e.target.value = '';
        },
        [project, updateProjectState]
    );

    const handleZoomIn = useCallback(() => {
        setZoom((z) => Math.min(z + 0.25, MAX_ZOOM));
    }, []);

    const handleZoomOut = useCallback(() => {
        setZoom((z) => Math.max(z - 0.25, MIN_ZOOM));
    }, []);

    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z + delta)));
    }, []);

    const handlePanStart = useCallback((e: React.MouseEvent) => {
        if (!isSpacePressed) return;
        e.preventDefault();
        setPanState({ isPanning: true, startX: e.clientX, startY: e.clientY });
    }, [isSpacePressed]);

    const handlePanMove = useCallback(
        (e: React.MouseEvent) => {
            if (!panState.isPanning) return;
            const dx = e.clientX - panState.startX;
            const dy = e.clientY - panState.startY;
            setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
            setPanState({ isPanning: true, startX: e.clientX, startY: e.clientY });
        },
        [panState.isPanning, panState.startX, panState.startY]
    );

    const handlePanEnd = useCallback(() => {
        setPanState((prev) => ({ ...prev, isPanning: false }));
    }, []);

    // Touch pan & pinch state
    const [touchState, setTouchState] = useState<{
        isTouching: boolean;
        isPinching: boolean;
        startX: number;
        startY: number;
        startPanX: number;
        startPanY: number;
        startDistance: number;
        startZoom: number;
    }>({
        isTouching: false,
        isPinching: false,
        startX: 0,
        startY: 0,
        startPanX: 0,
        startPanY: 0,
        startDistance: 0,
        startZoom: 1,
    });

    const getTouchDistance = useCallback((t1: { clientX: number; clientY: number }, t2: { clientX: number; clientY: number }) => {
        const dx = t1.clientX - t2.clientX;
        const dy = t1.clientY - t2.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }, []);

    const handleContainerTouchStart = useCallback(
        (e: React.TouchEvent) => {
            if (e.touches.length === 1) {
                // Single finger: only let the Canvas handle layer drag/resize/rotate.
                // Panning the canvas itself requires two fingers on mobile.
                return;
            } else if (e.touches.length === 2) {
                const t1 = e.touches[0];
                const t2 = e.touches[1];
                setTouchState({
                    isTouching: true,
                    isPinching: true,
                    startX: (t1.clientX + t2.clientX) / 2,
                    startY: (t1.clientY + t2.clientY) / 2,
                    startPanX: pan.x,
                    startPanY: pan.y,
                    startDistance: getTouchDistance(t1, t2),
                    startZoom: zoom,
                });
            }
        },
        [pan.x, pan.y, zoom, getTouchDistance]
    );

    const handleContainerTouchMove = useCallback(
        (e: React.TouchEvent) => {
            // Only two-finger gestures pan/zoom the canvas on mobile.
            if (!touchState.isTouching || e.touches.length !== 2) return;
            e.preventDefault();

            if (touchState.isPinching) {
                const t1 = e.touches[0];
                const t2 = e.touches[1];
                const distance = getTouchDistance(t1, t2);
                const scale = distance / (touchState.startDistance || 1);
                const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, touchState.startZoom * scale));
                setZoom(newZoom);

                const centerX = (t1.clientX + t2.clientX) / 2;
                const centerY = (t1.clientY + t2.clientY) / 2;
                const dx = centerX - touchState.startX;
                const dy = centerY - touchState.startY;
                setPan({ x: touchState.startPanX + dx, y: touchState.startPanY + dy });
            }
        },
        [touchState, getTouchDistance]
    );

    const handleContainerTouchEnd = useCallback(() => {
        setTouchState((prev) => ({ ...prev, isTouching: false, isPinching: false }));
    }, []);

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
                <Button onClick={() => router.push('/projects')}>
                    <LuArrowLeft className="mr-2 h-4 w-4" />
                    {t('backToProjects')}
                </Button>
            </div>
        );
    }

    const selectedLayer = project.layers.find((l) => l.id === selectedLayerId) || null;

    return (
        <div className="flex h-svh flex-col">
            {/* Top toolbar */}
            <div className="flex h-14 w-full max-w-full shrink-0 items-center justify-between gap-2 overflow-hidden border-b border-stroke bg-toolbar-bg px-3 sm:px-4">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => router.push('/projects')}>
                        <LuArrowLeft className="h-4 w-4" />
                    </Button>
                    <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground sm:text-base">
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
                    >
                        <LuPencil className="h-4 w-4" />
                    </Button>
                </div>

                <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                    <div className="hidden items-center gap-1 sm:flex">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleUndo}
                            disabled={history.past.length === 0}
                            aria-label={t('undo')}
                        >
                            <LuUndo2 className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleRedo}
                            disabled={history.future.length === 0}
                            aria-label={t('redo')}
                        >
                            <LuRedo2 className="h-4 w-4" />
                        </Button>
                    </div>

                    <div className="flex items-center gap-1 rounded-lg border border-stroke bg-background px-1.5 py-1 sm:px-2">
                        <button
                            type="button"
                            onClick={handleZoomOut}
                            className="p-1 text-secondary hover:text-foreground"
                            aria-label={t('zoomOut')}
                        >
                            <LuZoomOut className="h-4 w-4" />
                        </button>
                        <span className="min-w-9 text-center text-xs font-medium text-foreground sm:min-w-12">
                            {Math.round(zoom * 100)}%
                        </span>
                        <button
                            type="button"
                            onClick={handleZoomIn}
                            className="p-1 text-secondary hover:text-foreground"
                            aria-label={t('zoomIn')}
                        >
                            <LuZoomIn className="h-4 w-4" />
                        </button>
                    </div>

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
                        className="gap-1 px-2 sm:px-3"
                    >
                        <LuSave className="h-4 w-4" />
                        <span className="hidden sm:inline">{t('save')}</span>
                    </Button>
                </div>
            </div>

            {/* Main editor area */}
            <div className="flex flex-1 overflow-hidden">
                {/* Mobile backdrop for panels */}
                {(leftPanelOpen || rightPanelOpen) && (
                    <div
                        className="fixed inset-0 top-14 z-20 bg-black/40 lg:hidden"
                        onClick={() => { setLeftPanelOpen(false); setRightPanelOpen(false); }}
                    />
                )}

                {/* Left: layers & tools */}
                <div
                    className={cn(
                        'z-30 flex w-full sm:w-72 shrink-0 flex-col gap-4 overflow-y-auto border-r border-stroke bg-toolbar-bg p-4',
                        'transition-transform duration-300 ease-in-out',
                        'lg:static lg:w-64 lg:translate-x-0',
                        leftPanelOpen ? 'translate-x-0' : '-translate-x-full',
                        'fixed bottom-0 left-0 top-14'
                    )}
                >
                    <div className="flex items-center justify-between lg:hidden">
                        <h3 className="text-sm font-semibold text-foreground">{t('layers')}</h3>
                        <button
                            type="button"
                            onClick={() => setLeftPanelOpen(false)}
                            className="p-1 text-secondary hover:text-foreground"
                            aria-label={t('cancel')}
                        >
                            <LuX className="h-5 w-5" />
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <Button variant="outline" size="sm" onClick={handleAddText} className="gap-1">
                            <LuType className="h-4 w-4" />
                            {t('addText')}
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => fileInputRef.current?.click()}
                            className="gap-1"
                        >
                            <LuImage className="h-4 w-4" />
                            {t('addImage')}
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleAddShape} className="gap-1">
                            <LuShapes className="h-4 w-4" />
                            {t('addShape')}
                        </Button>
                        {project?.kind === 'booking_template' && (
                            <Button variant="outline" size="sm" onClick={handleAddDynamicField} className="gap-1">
                                <LuText className="h-4 w-4" />
                                {t('addField')}
                            </Button>
                        )}
                    </div>

                    <div className="space-y-3 rounded-lg border border-stroke bg-card-bg p-3">
                        <h4 className="text-sm font-semibold text-foreground">{t('canvasBackground')}</h4>
                        <ColorPicker
                            value={project.backgroundColor ?? '#ffffff'}
                            onChange={handleBackgroundColorChange}
                            placement="left"
                        />
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => bgFileInputRef.current?.click()}
                                className="flex-1 gap-1"
                            >
                                <LuImage className="h-4 w-4" />
                                {project.backgroundUri ? t('changeBgImage') : t('setBgImage')}
                            </Button>
                            {project.backgroundUri && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleRemoveBackgroundImage}
                                    aria-label={t('removeBgImage')}
                                >
                                    <LuTrash2 className="h-4 w-4 text-error" />
                                </Button>
                            )}
                        </div>
                        <input
                            ref={bgFileInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleBackgroundImageChange}
                        />
                    </div>

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleFileSelect}
                    />

                    <DraggableLayerList
                        layers={project.layers}
                        selectedId={selectedLayerId || undefined}
                        onSelect={(id) => {
                            setSelectedLayerId(id);
                            setLeftPanelOpen(false);
                            if (id) setRightPanelOpen(true);
                        }}
                        onReorder={handleReorder}
                        onToggleVisibility={handleToggleVisibility}
                        onToggleLock={handleToggleLock}
                        onDelete={handleDeleteLayer}
                    />
                </div>

                {/* Center: canvas */}
                <div
                    className="relative flex flex-1 overflow-hidden bg-canvas-bg touch-none"
                    onWheel={handleWheel}
                    onTouchStart={handleContainerTouchStart}
                    onTouchMove={handleContainerTouchMove}
                    onTouchEnd={handleContainerTouchEnd}
                >
                    <div
                        className="absolute left-1/2 top-1/2 shadow-2xl"
                        style={{
                            width: project.canvasWidth * zoom,
                            height: project.canvasHeight * zoom,
                            transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px))`,
                        }}
                    >
                        <div
                            style={{
                                width: project.canvasWidth * zoom,
                                height: project.canvasHeight * zoom,
                                transform: `scale(${zoom})`,
                                transformOrigin: isMobile ? 'top right' : 'top left',
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
                                onSelectLayer={setSelectedLayerId}
                                onLayerChange={handleLayerChange}
                                onLayerDragStart={handleLayerDragStart}
                                onDuplicateLayer={handleDuplicateLayer}
                                onDeleteLayer={handleDeleteLayer}
                                scale={zoom}
                                showGrid={!isExporting}
                                onAlign={handleAlign}
                                onVerticalAlign={handleVerticalAlign}
                            />
                        </div>
                    </div>

                    {/* Pan overlay: captures mouse events while space is held */}
                    {isSpacePressed && (
                        <div
                            className={cn(
                                'absolute inset-0 z-20 cursor-grab active:cursor-grabbing',
                                panState.isPanning && 'cursor-grabbing'
                            )}
                            onMouseDown={handlePanStart}
                            onMouseMove={handlePanMove}
                            onMouseUp={handlePanEnd}
                            onMouseLeave={handlePanEnd}
                        />
                    )}
                </div>

                {/* Right: properties */}
                <div
                    className={cn(
                        'z-30 flex w-full sm:w-80 shrink-0 flex-col overflow-y-auto border-l border-stroke bg-toolbar-bg p-4',
                        'transition-transform duration-300 ease-in-out',
                        'lg:static lg:w-72 lg:translate-x-0',
                        rightPanelOpen ? 'translate-x-0' : 'translate-x-full',
                        'fixed bottom-0 right-0 top-14'
                    )}
                >
                    <div className="flex items-center justify-between lg:hidden">
                        <h3 className="text-sm font-semibold text-foreground">{t('properties')}</h3>
                        <button
                            type="button"
                            onClick={() => setRightPanelOpen(false)}
                            className="p-1 text-secondary hover:text-foreground"
                            aria-label={t('cancel')}
                        >
                            <LuX className="h-5 w-5" />
                        </button>
                    </div>

                    {selectedLayer ? (
                        <div className="space-y-4">
                            <div className="hidden items-center justify-between lg:flex">
                                <h3 className="text-sm font-semibold text-foreground">{t('properties')}</h3>
                                <div className="flex gap-1">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleDuplicateLayer(selectedLayer.id)}
                                        aria-label={t('duplicate')}
                                    >
                                        <LuCopy className="h-4 w-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleDeleteLayer(selectedLayer.id)}
                                        aria-label={t('delete')}
                                    >
                                        <LuTrash2 className="h-4 w-4 text-error" />
                                    </Button>
                                </div>
                            </div>

                            {selectedLayer.type === 'text' && (
                                <TextToolbar
                                    layer={selectedLayer as TextLayer}
                                    onChange={(updates) => handleLayerChange(selectedLayer.id, updates)}
                                    onSliderStart={startChangeTransaction}
                                />
                            )}
                            {selectedLayer.type === 'image' && (
                                <ImageToolbar
                                    layer={selectedLayer as ImageLayer}
                                    onChange={(updates) => handleLayerChange(selectedLayer.id, updates)}
                                    onSliderStart={startChangeTransaction}
                                    onCrop={() => setIsCropOpen(true)}
                                />
                            )}
                            {selectedLayer.type === 'shape' && (
                                <ShapeToolbar
                                    layer={selectedLayer as ShapeLayer}
                                    onChange={(updates) => handleLayerChange(selectedLayer.id, updates)}
                                    onSliderStart={startChangeTransaction}
                                />
                            )}
                            {selectedLayer.type === 'dynamic_field' && (
                                <DynamicFieldToolbar
                                    layer={selectedLayer as DynamicFieldLayer}
                                    onChange={(updates) => handleLayerChange(selectedLayer.id, updates)}
                                />
                            )}
                        </div>
                    ) : (
                        <div className="text-center text-sm text-secondary">{t('selectLayer')}</div>
                    )}
                </div>
            </div>

            {/* Mobile floating controls */}
            <div className="pointer-events-none fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 gap-2 rounded-full border border-stroke bg-card-bg p-2 shadow-xl lg:hidden">
                <button
                    type="button"
                    onClick={handleUndo}
                    disabled={history.past.length === 0}
                    className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted disabled:opacity-40"
                    aria-label={t('undo')}
                >
                    <LuUndo2 className="h-5 w-5" />
                </button>
                <button
                    type="button"
                    onClick={handleRedo}
                    disabled={history.future.length === 0}
                    className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted disabled:opacity-40"
                    aria-label={t('redo')}
                >
                    <LuRedo2 className="h-5 w-5" />
                </button>
                <div className="w-px bg-stroke" />
                <button
                    type="button"
                    onClick={() => { setLeftPanelOpen((v) => !v); setRightPanelOpen(false); }}
                    className={cn(
                        'pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full transition-colors',
                        leftPanelOpen ? 'bg-brand-primary text-white' : 'text-foreground hover:bg-muted'
                    )}
                    aria-label={t('layers')}
                >
                    <LuLayers className="h-5 w-5" />
                </button>
                <button
                    type="button"
                    onClick={() => { setRightPanelOpen((v) => !v); setLeftPanelOpen(false); }}
                    className={cn(
                        'pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full transition-colors',
                        rightPanelOpen ? 'bg-brand-primary text-white' : 'text-foreground hover:bg-muted'
                    )}
                    aria-label={t('properties')}
                >
                    <LuSlidersHorizontal className="h-5 w-5" />
                </button>
            </div>

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
            {selectedLayer?.type === 'image' && (
                <ImageCropModal
                    isOpen={isCropOpen}
                    onClose={() => setIsCropOpen(false)}
                    imageUri={(selectedLayer as ImageLayer).uri}
                    naturalWidth={(selectedLayer as ImageLayer).naturalWidth}
                    naturalHeight={(selectedLayer as ImageLayer).naturalHeight}
                    onApply={handleCropApply}
                />
            )}
        </div>
    );
}
