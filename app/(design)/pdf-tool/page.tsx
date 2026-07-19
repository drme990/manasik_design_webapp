'use client';

import { useState, useRef, useCallback, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useDrag, useDrop, useDragLayer, DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { useTranslations } from '@/lib/i18n/strings';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Card } from '@/components/ui/Card';
import AlertDialog from '@/components/ui/AlertDialog';
import { cn } from '@/lib/utils/cn';
import {
    LuPlus,
    LuDownload,
    LuTrash2,
    LuX,
    LuGripVertical,
    LuLoaderCircle,
    LuEye,
    LuArrowLeft,
} from 'react-icons/lu';
import { PDFDocument } from 'pdf-lib';
import Modal from '@/components/ui/Modal';
import { listPdfProjects, savePdfProject, createPdfProject, deletePdfProject, invalidatePdfListCache } from '@/lib/store/exports';
import type { PdfImage as PdfImageType, PdfProject } from '@/types';

const ITEM_TYPE = 'PDF_IMAGE';

interface DragItem {
    index: number;
    id: string;
    img: PdfImageType;
}

/* --- Custom drag layer: floating preview --- */
function PdfDragLayer() {
    const { item, isDragging, currentOffset } = useDragLayer((monitor) => ({
        item: monitor.getItem() as DragItem | null,
        isDragging: monitor.isDragging(),
        currentOffset: monitor.getSourceClientOffset(),
    }));

    if (!isDragging || !item || !currentOffset) return null;

    return (
        <div
            className="pointer-events-none fixed z-9999 rotate-1"
            style={{ left: currentOffset.x, top: currentOffset.y, width: 300 }}
        >
            <div className="flex items-center gap-3 rounded-lg border-2 border-brand-primary bg-card-bg p-3 shadow-2xl">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-sm font-bold text-brand-primary">
                    {item.index + 1}
                </div>
                <div className="h-12 w-16 shrink-0 overflow-hidden rounded border border-stroke">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.img.uri} alt="" className="h-full w-full object-cover" />
                </div>
            </div>
        </div>
    );
}

/* --- Draggable image row --- */
function PdfImageRow({
    img,
    index,
    onRemove,
    onReorder,
    t,
}: {
    img: PdfImageType;
    index: number;
    onRemove: (id: string) => void;
    onReorder: (from: number, to: number) => void;
    t: (key: string, params?: Record<string, string | number>) => string;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const [dropAbove, setDropAbove] = useState(false);
    const [dropBelow, setDropBelow] = useState(false);

    const [{ isDragging }, drag] = useDrag({
        type: ITEM_TYPE,
        item: { index, id: img.id, img },
        collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    });

    const [{ isOver }, drop] = useDrop({
        accept: ITEM_TYPE,
        hover: (_item: DragItem, monitor) => {
            if (!ref.current) return;
            const clientOffset = monitor.getClientOffset();
            if (!clientOffset) return;

            const rect = ref.current.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            const isAbove = clientOffset.y < midY;

            setDropAbove(isAbove);
            setDropBelow(!isAbove);
        },
        drop: (item: DragItem, monitor) => {
            if (!ref.current || item.index === index) return;
            const clientOffset = monitor.getClientOffset();
            if (!clientOffset) return;

            const rect = ref.current.getBoundingClientRect();
            const isAbove = clientOffset.y < rect.top + rect.height / 2;

            let targetIndex = isAbove ? index : index + 1;
            if (item.index < targetIndex) targetIndex -= 1;
            if (item.index !== targetIndex) onReorder(item.index, targetIndex);

            setDropAbove(false);
            setDropBelow(false);
        },
        collect: (monitor) => ({ isOver: monitor.isOver() }),
    });

    drag(drop(ref));

    useEffect(() => {
        if (!isOver) {
            setDropAbove(false);
            setDropBelow(false);
        }
    }, [isOver]);

    return (
        <div className="relative">
            {dropAbove && (
                <div className="absolute -top-1.5 left-1 right-1 z-10 h-1 rounded-full bg-brand-primary shadow-lg" />
            )}
            {dropBelow && (
                <div className="absolute -bottom-1.5 left-1 right-1 z-10 h-1 rounded-full bg-brand-primary shadow-lg" />
            )}
            <Card
                padding="none"
                className={cn(
                    'flex items-center gap-2 p-2 transition-opacity sm:gap-3 sm:p-3',
                    isDragging && 'opacity-25'
                )}
            >
                <div
                    ref={ref}
                    className="flex min-w-0 flex-1 cursor-grab items-center gap-2 active:cursor-grabbing sm:gap-3"
                >
                    {/* Drag handle */}
                    <LuGripVertical className="h-4 w-4 shrink-0 text-secondary sm:h-5 sm:w-5" />

                    {/* Thumbnail with page number badge */}
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-stroke bg-muted sm:h-20 sm:w-28">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={img.uri}
                            alt={`${t('page')} ${index + 1}`}
                            className="h-full w-full object-cover"
                        />
                        <div className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-primary text-[10px] font-bold text-white shadow sm:h-6 sm:w-6 sm:text-xs">
                            {index + 1}
                        </div>
                    </div>

                    {/* Info */}
                    <div className="min-w-0 flex-1 text-sm text-secondary">
                        <p className="truncate font-medium text-foreground">
                            {t('page')} {index + 1}
                        </p>
                        <p className="truncate text-xs">
                            {img.naturalWidth} × {img.naturalHeight}
                        </p>
                    </div>
                </div>

                {/* Remove button */}
                <button
                    onClick={() => onRemove(img.id)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-error transition-colors hover:bg-error/10"
                    aria-label={t('remove')}
                >
                    <LuX className="h-4 w-4" />
                </button>
            </Card>
        </div>
    );
}

export default function PdfToolPageWrapper() {
    return (
        <Suspense fallback={<div className="flex flex-1 items-center justify-center"><LuLoaderCircle className="h-8 w-8 animate-spin text-brand-primary" /></div>}>
            <PdfToolPage />
        </Suspense>
    );
}

function PdfToolPage() {
    const t = useTranslations('pdfTool');
    const uiT = useTranslations('ui');
    const editorT = useTranslations('editor');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const searchParams = useSearchParams();
    const router = useRouter();
    const projectId = searchParams.get('id');

    const [images, setImages] = useState<PdfImageType[]>([]);
    const [downloading, setDownloading] = useState(false);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [confirmClear, setConfirmClear] = useState(false);
    const [projectName, setProjectName] = useState('');
    const [currentProject, setCurrentProject] = useState<PdfProject | null>(null);
    const [loading, setLoading] = useState(!!projectId);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [showUnsavedModal, setShowUnsavedModal] = useState(false);
    const [showNoChangesModal, setShowNoChangesModal] = useState(false);
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hasUnsavedRef = useRef(false);
    const currentProjectRef = useRef<PdfProject | null>(null);
    currentProjectRef.current = currentProject;
    const skipNextSaveRef = useRef(false);

    // Load existing project when ?id= is present
    useEffect(() => {
        if (!projectId) return;
        setLoading(true);
        listPdfProjects().then((projects) => {
            const found = projects.find((p) => p.id === projectId);
            if (found) {
                currentProjectRef.current = found;
                setCurrentProject(found);
                setProjectName(found.name);
                setImages(found.images);
                // Skip the auto-save that would fire from images being set —
                // the data was just loaded from the DB, no need to re-save it.
                skipNextSaveRef.current = true;
            }
            setLoading(false);
        });
    }, [projectId]);

    // Auto-save: debounced whenever images or name change
    // NOTE: currentProject is intentionally excluded from deps — updating it
    // after a save would re-trigger this effect and cause an infinite save loop.
    // We read it via ref instead.
    useEffect(() => {
        if (loading) return; // Don't save during initial load
        if (images.length === 0 && !currentProjectRef.current) return; // Nothing to save

        // Skip save after initial load — data came from DB, no changes yet
        if (skipNextSaveRef.current) {
            skipNextSaveRef.current = false;
            hasUnsavedRef.current = false;
            setHasUnsavedChanges(false);
            return;
        }

        // Mark as having unsaved changes whenever images/name change
        hasUnsavedRef.current = true;
        setHasUnsavedChanges(true);

        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
        }
        saveTimerRef.current = setTimeout(async () => {
            saveTimerRef.current = null;
            if (images.length === 0) return;

            const name = projectName || `PDF — ${new Date().toLocaleDateString()}`;
            const existing = currentProjectRef.current;
            if (existing) {
                // Update existing project
                const updated: PdfProject = {
                    ...existing,
                    name,
                    images,
                };
                await savePdfProject(updated);
                currentProjectRef.current = updated;
                setCurrentProject(updated);
            } else {
                // Create new project
                const created = await createPdfProject(name, images);
                currentProjectRef.current = created;
                setCurrentProject(created);
                setProjectName(created.name);
            }
            invalidatePdfListCache();
            hasUnsavedRef.current = false;
            setHasUnsavedChanges(false);
        }, 800);

        return () => {
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
            }
        };
    }, [images, projectName, loading]);

    const handleAddImages = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        const newImages: PdfImageType[] = [];
        let loaded = 0;

        files.forEach((file, idx) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                const uri = event.target?.result as string;
                const img = new Image();
                img.onload = () => {
                    newImages.push({
                        id: `pdf-img-${Date.now()}-${idx}`,
                        uri,
                        naturalWidth: img.naturalWidth,
                        naturalHeight: img.naturalHeight,
                    });
                    loaded++;
                    if (loaded === files.length) {
                        setImages((prev) => [...prev, ...newImages]);
                    }
                };
                img.src = uri;
            };
            reader.readAsDataURL(file);
        });

        e.target.value = '';
    };

    const handleRemove = (id: string) => {
        setImages((prev) => prev.filter((img) => img.id !== id));
    };

    const handleReorder = (fromIndex: number, toIndex: number) => {
        setImages((prev) => {
            const next = [...prev];
            const [moved] = next.splice(fromIndex, 1);
            next.splice(toIndex, 0, moved);
            return next;
        });
    };

    const handleClear = () => {
        setImages([]);
        setConfirmClear(false);
        setCurrentProject(null);
        currentProjectRef.current = null;
        setProjectName('');
        hasUnsavedRef.current = false;
        setHasUnsavedChanges(false);
    };

    // ─── Leave navigation with confirmation modals ──────────────────────────
    const doSaveAndLeave = useCallback(() => {
        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
        }
        hasUnsavedRef.current = false;
        setHasUnsavedChanges(false);
        // Force immediate save
        const proj = currentProjectRef.current;
        if (proj && images.length > 0) {
            const name = projectName || `PDF — ${new Date().toLocaleDateString()}`;
            savePdfProject({ ...proj, name, images }).catch(() => { });
            invalidatePdfListCache();
        }
        router.replace('/projects');
    }, [router, images, projectName]);

    const doLeaveWithoutSaving = useCallback(() => {
        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
        }
        hasUnsavedRef.current = false;
        setHasUnsavedChanges(false);
        router.replace('/projects');
    }, [router]);

    const doSaveLeaveAndDelete = useCallback(() => {
        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
        }
        hasUnsavedRef.current = false;
        setHasUnsavedChanges(false);
        const proj = currentProjectRef.current;
        if (proj) {
            // Save first so latest state is synced, then delete
            const name = projectName || `PDF — ${new Date().toLocaleDateString()}`;
            savePdfProject({ ...proj, name, images }).catch(() => { });
            deletePdfProject(proj.id).catch(() => { });
            invalidatePdfListCache();
        }
        router.replace('/projects');
    }, [router, images, projectName]);

    const doDeleteAndLeave = useCallback(() => {
        hasUnsavedRef.current = false;
        setHasUnsavedChanges(false);
        const proj = currentProjectRef.current;
        if (proj) {
            deletePdfProject(proj.id).catch(() => { });
            invalidatePdfListCache();
        }
        router.replace('/projects');
    }, [router]);

    const handleNavigateBack = useCallback(() => {
        if (hasUnsavedRef.current) {
            setShowUnsavedModal(true);
        } else {
            setShowNoChangesModal(true);
        }
    }, []);

    // Browser back-button guard
    useEffect(() => {
        if (!projectId) return; // Only guard when editing an existing project
        window.history.pushState({ pdfGuard: true }, '');
        const handlePopState = () => {
            if (hasUnsavedRef.current) {
                window.history.pushState({ pdfGuard: true }, '');
                setShowUnsavedModal(true);
            } else {
                window.history.pushState({ pdfGuard: true }, '');
                setShowNoChangesModal(true);
            }
        };
        window.addEventListener('popstate', handlePopState);
        return () => {
            window.removeEventListener('popstate', handlePopState);
        };
    }, [projectId]);

    const handleDownload = useCallback(async () => {
        if (images.length === 0) return;
        setDownloading(true);

        try {
            const pdfDoc = await PDFDocument.create();

            for (const img of images) {
                const isPng = img.uri.startsWith('data:image/png');
                const isJpeg = img.uri.startsWith('data:image/jpeg') || img.uri.startsWith('data:image/jpg');

                const base64 = img.uri.split(',')[1];
                const byteChars = atob(base64);
                const bytes = new Uint8Array(byteChars.length);
                for (let i = 0; i < byteChars.length; i++) {
                    bytes[i] = byteChars.charCodeAt(i);
                }

                let embedded;
                if (isPng) {
                    embedded = await pdfDoc.embedPng(bytes);
                } else if (isJpeg) {
                    embedded = await pdfDoc.embedJpg(bytes);
                } else {
                    embedded = await pdfDoc.embedJpg(bytes);
                }

                // Page size = exact image size, image fills the entire page
                const page = pdfDoc.addPage([img.naturalWidth, img.naturalHeight]);
                page.drawImage(embedded, {
                    x: 0,
                    y: 0,
                    width: img.naturalWidth,
                    height: img.naturalHeight,
                });
            }

            const pdfBytes = await pdfDoc.save();
            const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `manasik-pdf-${Date.now()}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('PDF generation failed:', err);
        } finally {
            setDownloading(false);
        }
    }, [images]);

    return (
        <DndProvider backend={HTML5Backend}>
            <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-4xl">
                    {/* Header */}
                    <div className="mb-8">
                        <div className="mb-3 flex items-center gap-3">
                            {projectId && (
                                <button
                                    onClick={handleNavigateBack}
                                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-stroke bg-card-bg text-foreground transition-colors hover:bg-muted"
                                    aria-label={uiT('back')}
                                >
                                    <LuArrowLeft className="h-5 w-5" />
                                </button>
                            )}
                            <h1 className="text-3xl font-bold text-foreground">{t('title')}</h1>
                        </div>
                        <p className="mt-1 text-secondary">{t('subtitle')}</p>
                        {currentProject && (
                            <input
                                type="text"
                                value={projectName}
                                onChange={(e) => setProjectName(e.target.value)}
                                placeholder={t('title')}
                                className="mt-3 w-full max-w-sm rounded-lg border border-stroke bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-brand-primary"
                            />
                        )}
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <LuLoaderCircle className="h-8 w-8 animate-spin text-brand-primary" />
                        </div>
                    ) : (
                        <>

                            {/* Actions bar */}
                            <div className="mb-6 flex flex-wrap items-center gap-3">
                                <Button
                                    variant="primary"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="gap-2"
                                >
                                    <LuPlus className="h-5 w-5" />
                                    {t('addImages')}
                                </Button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    className="hidden"
                                    onChange={handleAddImages}
                                />

                                {images.length > 0 && (
                                    <>
                                        <Button
                                            variant="outline"
                                            onClick={() => setPreviewOpen(true)}
                                            className="gap-2"
                                        >
                                            <LuEye className="h-5 w-5" />
                                            {t('preview')}
                                        </Button>

                                        <Button
                                            variant="primary"
                                            onClick={handleDownload}
                                            disabled={downloading}
                                            className="gap-2"
                                        >
                                            {downloading ? (
                                                <LuLoaderCircle className="h-5 w-5 animate-spin" />
                                            ) : (
                                                <LuDownload className="h-5 w-5" />
                                            )}
                                            {downloading ? t('generating') : t('download')}
                                        </Button>

                                        <Button
                                            variant="ghost"
                                            onClick={() => setConfirmClear(true)}
                                            className="gap-2 text-error hover:bg-error/10"
                                        >
                                            <LuTrash2 className="h-5 w-5" />
                                            {t('clear')}
                                        </Button>

                                        <span className="text-sm text-secondary">
                                            {t('imageCount', { count: images.length })}
                                        </span>
                                    </>
                                )}
                            </div>

                            {/* Images list */}
                            {images.length === 0 ? (
                                <EmptyState
                                    title={t('empty')}
                                    description={t('emptyHint')}
                                />
                            ) : (
                                <>
                                    <PdfDragLayer />
                                    <div className="space-y-3">
                                        {images.map((img, index) => (
                                            <PdfImageRow
                                                key={img.id}
                                                img={img}
                                                index={index}
                                                onRemove={handleRemove}
                                                onReorder={handleReorder}
                                                t={t}
                                            />
                                        ))}
                                    </div>
                                </>
                            )}
                        </>
                    )}
                </div>

                {/* Preview modal — shows how each page will look in the PDF */}
                <Modal
                    isOpen={previewOpen}
                    onClose={() => setPreviewOpen(false)}
                    title={t('previewTitle')}
                    size="full"
                    footer={
                        <div className="flex w-full justify-between gap-3">
                            <Button
                                variant="ghost"
                                onClick={() => setPreviewOpen(false)}
                            >
                                {uiT('close')}
                            </Button>
                            <Button
                                variant="primary"
                                onClick={() => {
                                    setPreviewOpen(false);
                                    handleDownload();
                                }}
                                disabled={downloading}
                                className="gap-2"
                            >
                                {downloading ? (
                                    <LuLoaderCircle className="h-5 w-5 animate-spin" />
                                ) : (
                                    <LuDownload className="h-5 w-5" />
                                )}
                                {t('download')}
                            </Button>
                        </div>
                    }
                >
                    <div className="space-y-4">
                        {images.map((img, index) => {
                            const imgAspect = img.naturalWidth / img.naturalHeight;
                            return (
                                <div key={img.id} className="flex flex-col items-center gap-2">
                                    <span className="text-sm font-medium text-secondary">
                                        {t('page')} {index + 1}
                                    </span>
                                    {/* Page = exact image size */}
                                    <div
                                        className="relative overflow-hidden rounded-lg border border-stroke bg-white shadow-md"
                                        style={{ aspectRatio: imgAspect, width: '100%', maxWidth: 400 }}
                                    >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={img.uri}
                                            alt={`${t('page')} ${index + 1}`}
                                            className="h-full w-full object-cover"
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Modal>

                <AlertDialog
                    isOpen={confirmClear}
                    onClose={() => setConfirmClear(false)}
                    title={t('clear')}
                    description={t('confirmClear')}
                    confirmLabel={uiT('confirm')}
                    cancelLabel={uiT('cancel')}
                    onConfirm={handleClear}
                />

                {/* Unsaved changes modal — with delete option */}
                {showUnsavedModal && (
                    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/60 p-4">
                        <div className="w-full max-w-sm rounded-2xl bg-background p-6 shadow-2xl">
                            <h2 className="mb-2 text-lg font-bold text-foreground">
                                {editorT('unsavedChangesTitle')}
                            </h2>
                            <p className="mb-6 text-sm text-secondary">
                                {editorT('unsavedChangesDescription')}
                            </p>
                            <div className="flex flex-col gap-2">
                                <Button
                                    onClick={() => {
                                        setShowUnsavedModal(false);
                                        doSaveAndLeave();
                                    }}
                                    className="w-full"
                                >
                                    {editorT('saveAndLeave')}
                                </Button>
                                <Button
                                    variant="ghost"
                                    onClick={() => {
                                        setShowUnsavedModal(false);
                                        doLeaveWithoutSaving();
                                    }}
                                    className="w-full text-secondary"
                                >
                                    {editorT('leaveWithoutSaving')}
                                </Button>
                                <Button
                                    variant="ghost"
                                    onClick={() => {
                                        setShowUnsavedModal(false);
                                        doSaveLeaveAndDelete();
                                    }}
                                    className="w-full text-error hover:bg-error/10"
                                >
                                    {editorT('saveLeaveDelete')}
                                </Button>
                                <Button
                                    variant="ghost"
                                    onClick={() => setShowUnsavedModal(false)}
                                    className="w-full"
                                >
                                    {editorT('cancel')}
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                {/* No changes modal — asks if user wants to delete the project */}
                {showNoChangesModal && (
                    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/60 p-4">
                        <div className="w-full max-w-sm rounded-2xl bg-background p-6 shadow-2xl">
                            <h2 className="mb-2 text-lg font-bold text-foreground">
                                {editorT('noChangesTitle')}
                            </h2>
                            <p className="mb-6 text-sm text-secondary">
                                {editorT('noChangesDescription')}
                            </p>
                            <div className="flex flex-col gap-2">
                                <Button
                                    variant="ghost"
                                    onClick={() => {
                                        setShowNoChangesModal(false);
                                        doDeleteAndLeave();
                                    }}
                                    className="w-full text-error hover:bg-error/10"
                                >
                                    {editorT('leaveDelete')}
                                </Button>
                                <Button
                                    variant="ghost"
                                    onClick={() => setShowNoChangesModal(false)}
                                    className="w-full"
                                >
                                    {editorT('cancel')}
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </DndProvider >
    );
}
