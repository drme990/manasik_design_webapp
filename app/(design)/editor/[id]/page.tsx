'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils/cn';
import {
    LuArrowLeft,
    LuType,
    LuImage,
    LuShapes,
    LuVariable,
    LuTrash2,
    LuCopy,
    LuSave,
    LuZoomIn,
    LuZoomOut,
    LuLoader,
    LuLayers,
    LuSlidersHorizontal,
    LuUndo2,
    LuRedo2,
} from 'react-icons/lu';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import Canvas from '@/components/editor/Canvas';
import DraggableLayerList from '@/components/common/DraggableLayerList';
import TextToolbar from '@/components/editor/Toolbars/TextToolbar';
import ImageToolbar from '@/components/editor/Toolbars/ImageToolbar';
import ShapeToolbar from '@/components/editor/Toolbars/ShapeToolbar';
import DynamicFieldToolbar from '@/components/editor/Toolbars/DynamicFieldToolbar';
import { getProject, updateProject } from '@/lib/store/projects';
import {
    buildTextLayer,
    buildImageLayer,
    buildShapeLayer,
    buildDynamicFieldLayer,
    nextZIndex,
    cloneLayer,
} from '@/lib/utils/layer-utils';
import type { Project, AnyLayer, TextLayer, ImageLayer, ShapeLayer, DynamicFieldLayer } from '@/types';

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;

export default function EditorPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const t = useTranslations('editor');
    const fileInputRef = useRef<HTMLInputElement>(null);

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
    const [leftPanelOpen, setLeftPanelOpen] = useState(false);
    const [rightPanelOpen, setRightPanelOpen] = useState(false);
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
            const fit = Math.min(
                (window.innerWidth * 0.45) / p.canvasWidth,
                (window.innerHeight * 0.65) / p.canvasHeight,
                1
            );
            setZoom(Math.max(fit, MIN_ZOOM));
        });
    }, [id]);

    const persistProject = useCallback(
        async (updated: Project) => {
            setSaving(true);
            await updateProject(updated.id, {
                layers: updated.layers,
                thumbnail: updated.thumbnail,
            });
            setSaving(false);
        },
        []
    );

    const updateProjectState = useCallback(
        (updater: (prev: Project) => Project, recordHistory = true) => {
            setProject((prev) => {
                if (!prev) return prev;
                const updated = updater(prev);
                if (recordHistory) {
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
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [handleUndo, handleRedo]);

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

    const handleLayerDragStart = useCallback(
        (layerId: string) => {
            const current = projectRef.current;
            if (!current) return;
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
            return { ...prev, layers: [...prev.layers, layer] };
        });
    }, [updateProjectState]);

    const handleAddDynamicField = useCallback(() => {
        updateProjectState((prev) => {
            const layer = buildDynamicFieldLayer({
                variableId: 'guest-name',
                variableName: 'guest-name',
                fieldType: 'text',
                x: prev.canvasWidth * 0.1,
                y: prev.canvasHeight * 0.1,
            });
            layer.zIndex = nextZIndex(prev.layers);
            return { ...prev, layers: [...prev.layers, layer] };
        });
    }, [updateProjectState]);

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
                const touch = e.touches[0];
                setTouchState({
                    isTouching: true,
                    isPinching: false,
                    startX: touch.clientX,
                    startY: touch.clientY,
                    startPanX: pan.x,
                    startPanY: pan.y,
                    startDistance: 0,
                    startZoom: zoom,
                });
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
            e.preventDefault();
            if (!touchState.isTouching) return;

            if (touchState.isPinching && e.touches.length === 2) {
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
            } else if (!touchState.isPinching && e.touches.length === 1) {
                const touch = e.touches[0];
                const dx = touch.clientX - touchState.startX;
                const dy = touch.clientY - touchState.startY;
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
            <div className="flex h-full items-center justify-center">
                <LoadingSpinner size="lg" />
            </div>
        );
    }

    if (!project) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
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
        <div className="flex h-full flex-col">
            {/* Top toolbar */}
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-stroke bg-toolbar-bg px-4">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="sm" onClick={() => router.push('/projects')}>
                        <LuArrowLeft className="h-4 w-4" />
                    </Button>
                    <h1 className="max-w-xs truncate text-sm font-semibold text-foreground sm:text-base">
                        {project.name}
                    </h1>
                </div>

                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
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

                    {/* Mobile panel toggles */}
                    <div className="flex items-center gap-1 lg:hidden">
                        <Button
                            variant={leftPanelOpen ? 'primary' : 'ghost'}
                            size="sm"
                            onClick={() => setLeftPanelOpen((v) => !v)}
                            aria-label={t('layers')}
                        >
                            <LuLayers className="h-4 w-4" />
                        </Button>
                        <Button
                            variant={rightPanelOpen ? 'primary' : 'ghost'}
                            size="sm"
                            onClick={() => setRightPanelOpen((v) => !v)}
                            aria-label={t('properties')}
                        >
                            <LuSlidersHorizontal className="h-4 w-4" />
                        </Button>
                    </div>

                    <div className="flex items-center gap-1 rounded-lg border border-stroke bg-background px-2 py-1">
                        <button
                            type="button"
                            onClick={handleZoomOut}
                            className="p-1 text-secondary hover:text-foreground"
                            aria-label={t('zoomOut')}
                        >
                            <LuZoomOut className="h-4 w-4" />
                        </button>
                        <span className="min-w-12 text-center text-xs font-medium text-foreground">
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
                        variant="primary"
                        size="sm"
                        onClick={() => persistProject(project)}
                        loading={saving}
                        className="gap-1"
                    >
                        {saving ? (
                            <LuLoader className="h-4 w-4 animate-spin" />
                        ) : (
                            <LuSave className="h-4 w-4" />
                        )}
                        <span className="hidden sm:inline">{t('save')}</span>
                    </Button>
                </div>
            </div>

            {/* Main editor area */}
            <div className="flex flex-1 overflow-hidden">
                {/* Left: layers & tools */}
                <div
                    className={cn(
                        'z-30 flex w-64 shrink-0 flex-col gap-4 overflow-y-auto border-r border-stroke bg-toolbar-bg p-4',
                        'transition-transform duration-300 ease-in-out',
                        'lg:static lg:translate-x-0',
                        leftPanelOpen ? 'translate-x-0' : '-translate-x-full',
                        'fixed bottom-0 left-0 top-14'
                    )}
                >
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
                        <Button variant="outline" size="sm" onClick={handleAddDynamicField} className="gap-1">
                            <LuVariable className="h-4 w-4" />
                            {t('addField')}
                        </Button>
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
                                width: project.canvasWidth,
                                height: project.canvasHeight,
                                transform: `scale(${zoom})`,
                                transformOrigin: 'top left',
                            }}
                        >
                            <Canvas
                                width={project.canvasWidth}
                                height={project.canvasHeight}
                                backgroundColor="#ffffff"
                                backgroundUri={project.backgroundUri}
                                layers={project.layers}
                                selectedLayerId={selectedLayerId || undefined}
                                onSelectLayer={setSelectedLayerId}
                                onLayerChange={handleLayerChange}
                                onLayerDragStart={handleLayerDragStart}
                                onDuplicateLayer={handleDuplicateLayer}
                                onDeleteLayer={handleDeleteLayer}
                                scale={zoom}
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
                        'z-30 flex w-72 shrink-0 flex-col overflow-y-auto border-l border-stroke bg-toolbar-bg p-4',
                        'transition-transform duration-300 ease-in-out',
                        'lg:static lg:translate-x-0',
                        rightPanelOpen ? 'translate-x-0' : 'translate-x-full',
                        'fixed bottom-0 right-0 top-14'
                    )}
                >
                    {selectedLayer ? (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
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
                                />
                            )}
                            {selectedLayer.type === 'image' && (
                                <ImageToolbar
                                    layer={selectedLayer as ImageLayer}
                                    onChange={(updates) => handleLayerChange(selectedLayer.id, updates)}
                                />
                            )}
                            {selectedLayer.type === 'shape' && (
                                <ShapeToolbar
                                    layer={selectedLayer as ShapeLayer}
                                    onChange={(updates) => handleLayerChange(selectedLayer.id, updates)}
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
        </div>
    );
}
