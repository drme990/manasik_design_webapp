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
    LuSave,
    LuRefreshCw,
} from 'react-icons/lu';
import { PDFDocument } from 'pdf-lib';
import Modal from '@/components/ui/Modal';
import { getPdfProject, savePdfProject, createPdfProject, deletePdfProject, invalidatePdfListCache } from '@/lib/store/pdf-projects';
import { useToast } from '@/components/providers/ToastProvider';
import { createInstantPreview, uploadImageInBackground } from '@/lib/storage/upload';
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
    onRetryUpload,
    t,
}: {
    img: PdfImageType;
    index: number;
    onRemove: (id: string) => void;
    onReorder: (from: number, to: number) => void;
    onRetryUpload?: (id: string) => void;
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

                    {/* Thumbnail with page number badge + upload status */}
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
                        {/* Upload status overlay */}
                        {img.uploadStatus === 'uploading' && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                <LuLoaderCircle className="h-5 w-5 animate-spin text-white" />
                            </div>
                        )}
                        {img.uploadStatus === 'error' && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/70 p-1">
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onRetryUpload?.(img.id);
                                    }}
                                    className="flex items-center gap-1 rounded-full bg-error px-2 py-1 text-[10px] font-semibold text-white shadow-lg transition-transform active:scale-95"
                                    aria-label={t('reupload')}
                                >
                                    <LuRefreshCw className="h-3 w-3" />
                                    {t('reupload')}
                                </button>
                            </div>
                        )}
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
    const [saving, setSaving] = useState(false);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [confirmClear, setConfirmClear] = useState(false);
    const [projectName, setProjectName] = useState('');
    const toast = useToast();
    const [currentProject, setCurrentProject] = useState<PdfProject | null>(null);
    const [loading, setLoading] = useState(!!projectId);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [showLeaveModal, setShowLeaveModal] = useState(false);
    const hasUnsavedRef = useRef(false);
    const currentProjectRef = useRef<PdfProject | null>(null);
    currentProjectRef.current = currentProject;
    const skipNextMarkRef = useRef(false);
    // Tracks whether the project had been saved to the server before this session.
    // If false, the project is "new" and leaving without saving means deleting it.
    const wasSyncedBeforeRef = useRef(false);

    // Load existing project when ?id= is present
    useEffect(() => {
        if (!projectId) return;
        setLoading(true);
        getPdfProject(projectId).then((found) => {
            if (found) {
                currentProjectRef.current = found;
                setCurrentProject(found);
                setProjectName(found.name);
                setImages(found.images);
                // Skip the unsaved-mark that would fire from images being set —
                // the data was just loaded from the DB, no changes yet.
                skipNextMarkRef.current = true;
                // This project was already saved to the server before
                wasSyncedBeforeRef.current = true;
            }
            setLoading(false);
        });
    }, [projectId]);

    // Mark unsaved changes whenever images or name change.
    // No auto-save — the DB is only written on explicit Save button click
    // or when the user confirms "Yes" on the leave modal.
    useEffect(() => {
        if (loading) return; // Don't mark during initial load
        if (images.length === 0 && !currentProjectRef.current) return; // Nothing to track

        // Skip after initial load — data came from DB, no changes yet
        if (skipNextMarkRef.current) {
            skipNextMarkRef.current = false;
            return;
        }

        hasUnsavedRef.current = true;
        setHasUnsavedChanges(true);
    }, [images, projectName, loading]);

    const handleAddImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        e.target.value = '';

        // --- Instant add: create object URLs and add rows immediately ---
        const previews = await Promise.all(
            files.map((f) => createInstantPreview(f).catch(() => null))
        );

        const valid = previews
            .map((p, i) => (p ? { preview: p, file: files[i] } : null))
            .filter((x): x is { preview: { uri: string; naturalWidth: number; naturalHeight: number }; file: File } => x !== null);

        if (valid.length === 0) {
            toast.showToast({ message: editorT('toolbars.image.uploadFailed'), variant: 'error' });
            return;
        }

        const newImages: PdfImageType[] = valid.map(({ preview, file }, idx) => ({
            id: `pdf-img-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
            uri: preview.uri,
            naturalWidth: preview.naturalWidth,
            naturalHeight: preview.naturalHeight,
            uploadStatus: 'uploading',
            pendingFile: file,
        }));
        setImages((prev) => [...prev, ...newImages]);

        // --- Background upload for each image ---
        newImages.forEach((img) => {
            const file = img.pendingFile!;
            const tempUri = img.uri;
            uploadImageInBackground(file)
                .then((uploaded) => {
                    try { URL.revokeObjectURL(tempUri); } catch { /* ignore */ }
                    setImages((prev) => prev.map((p) =>
                        p.id === img.id
                            ? {
                                ...p,
                                uri: uploaded.uri,
                                thumbnailUri: uploaded.thumbnailUri,
                                uploadStatus: undefined,
                                pendingFile: undefined,
                            }
                            : p
                    ));
                })
                .catch((err) => {
                    console.error('PDF image upload failed:', err);
                    setImages((prev) => prev.map((p) =>
                        p.id === img.id
                            ? { ...p, uploadStatus: 'error' }
                            : p
                    ));
                });
        });
    };

    /** Retry a failed background upload for a specific PDF image. */
    const handleRetryUpload = useCallback((id: string) => {
        const img = images.find((i) => i.id === id);
        if (!img || !img.pendingFile) return;
        const file = img.pendingFile;
        const tempUri = img.uri.startsWith('blob:') ? img.uri : URL.createObjectURL(file);
        setImages((prev) => prev.map((p) => p.id === id ? { ...p, uploadStatus: 'uploading' } : p));
        uploadImageInBackground(file)
            .then((uploaded) => {
                try { URL.revokeObjectURL(tempUri); } catch { /* ignore */ }
                setImages((prev) => prev.map((p) =>
                    p.id === id
                        ? {
                            ...p,
                            uri: uploaded.uri,
                            thumbnailUri: uploaded.thumbnailUri,
                            uploadStatus: undefined,
                            pendingFile: undefined,
                        }
                        : p
                ));
            })
            .catch((err) => {
                console.error('PDF image re-upload failed:', err);
                setImages((prev) => prev.map((p) => p.id === id ? { ...p, uploadStatus: 'error' } : p));
            });
    }, [images]);

    const handleRemove = (id: string) => {
        setImages((prev) => {
            const removed = prev.find((p) => p.id === id);
            if (removed?.uri.startsWith('blob:')) {
                try { URL.revokeObjectURL(removed.uri); } catch { /* ignore */ }
            }
            return prev.filter((img) => img.id !== id);
        });
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
        // Revoke any pending blob: URLs to free memory
        images.forEach((img) => {
            if (img.uri.startsWith('blob:')) {
                try { URL.revokeObjectURL(img.uri); } catch { /* ignore */ }
            }
        });
        setImages([]);
        setConfirmClear(false);
        setCurrentProject(null);
        currentProjectRef.current = null;
        setProjectName('');
        hasUnsavedRef.current = false;
        setHasUnsavedChanges(false);
    };

    // ─── Save to DB (explicit) ──────────────────────────────────────────────
    // The ONLY path that writes to the server. Called by the Save button and
    // by doSaveAndLeave (leave modal "Yes").
    const flushSave = useCallback(async () => {
        if (images.length === 0) return;
        // Block save while any image is still uploading — blob: URIs can't be
        // persisted to the DB (they're client-side only and would be broken
        // on reload). Also warn if any upload failed.
        const stillUploading = images.some((i) => i.uploadStatus === 'uploading');
        const hasFailed = images.some((i) => i.uploadStatus === 'error');
        if (stillUploading) {
            toast.showToast({ message: t('generating'), variant: 'info' });
            return;
        }
        if (hasFailed) {
            toast.showToast({ message: t('reupload'), variant: 'error' });
            return;
        }
        // Only persist images that have real (non-blob) URIs
        const persistable = images.filter((i) => !i.uri.startsWith('blob:'));
        if (persistable.length === 0) return;
        setSaving(true);
        try {
            const name = projectName || `PDF — ${new Date().toLocaleDateString()}`;
            const existing = currentProjectRef.current;
            // Strip transient upload fields before persisting
            const cleanImages = persistable.map(({ uploadStatus, pendingFile, ...rest }) => rest);
            if (existing) {
                const updated: PdfProject = { ...existing, name, images: cleanImages };
                await savePdfProject(updated);
                currentProjectRef.current = updated;
                setCurrentProject(updated);
            } else {
                const created = await createPdfProject(name, cleanImages);
                currentProjectRef.current = created;
                setCurrentProject(created);
                setProjectName(created.name);
                wasSyncedBeforeRef.current = true;
            }
            invalidatePdfListCache();
            hasUnsavedRef.current = false;
            setHasUnsavedChanges(false);
        } catch (err) {
            console.error('Failed to save PDF project:', err);
        } finally {
            setSaving(false);
        }
    }, [images, projectName, toast, t]);

    // ─── Leave navigation ───────────────────────────────────────────────────
    // Save and navigate away — used by the "Yes" button in the leave modal.
    // Awaits the save so the request completes before navigating.
    const doSaveAndLeave = useCallback(async () => {
        hasUnsavedRef.current = false;
        setHasUnsavedChanges(false);
        await flushSave();
        router.replace('/projects');
    }, [flushSave, router]);

    // "No" button in the leave modal — discards unsaved changes.
    // Deletes the project if it's blank or was never saved to the server.
    const doNoAndLeave = useCallback(() => {
        hasUnsavedRef.current = false;
        setHasUnsavedChanges(false);
        const proj = currentProjectRef.current;
        if (proj) {
            const isBlank = images.length === 0;
            if (isBlank || !wasSyncedBeforeRef.current) {
                // Blank project or new project that was never synced — delete it
                deletePdfProject(proj.id).catch(() => { });
                invalidatePdfListCache();
            }
        }
        // For existing projects with content, just leave — the DB still has
        // the last-saved version; unsaved session changes are discarded.
        router.replace('/projects');
    }, [router, images.length]);

    // Silently leave without asking — used when there are no changes at all.
    // Deletes the project if it's blank (no images).
    const doSilentLeave = useCallback(() => {
        const proj = currentProjectRef.current;
        if (proj) {
            const isBlank = images.length === 0;
            if (isBlank) {
                deletePdfProject(proj.id).catch(() => { });
                invalidatePdfListCache();
            }
        }
        router.replace('/projects');
    }, [router, images.length]);

    const handleNavigateBack = useCallback(() => {
        if (hasUnsavedRef.current) {
            setShowLeaveModal(true);
        } else {
            doSilentLeave();
        }
    }, [doSilentLeave]);

    // Browser back-button guard — same pattern as the editor
    useEffect(() => {
        if (!projectId) return; // Only guard when editing an existing project
        window.history.pushState({ pdfGuard: true }, '');
        const handlePopState = () => {
            // Re-push the guard state so the next back press is also caught
            window.history.pushState({ pdfGuard: true }, '');
            if (hasUnsavedRef.current) {
                setShowLeaveModal(true);
            } else {
                doSilentLeave();
            }
        };
        window.addEventListener('popstate', handlePopState);
        return () => {
            window.removeEventListener('popstate', handlePopState);
        };
    }, [projectId, doSilentLeave]);

    // beforeunload — desktop: trigger native browser confirmation if unsaved
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (hasUnsavedRef.current) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, []);

    const handleDownload = useCallback(async () => {
        if (images.length === 0) return;
        // Block download if any image is still uploading or failed — the blob:
        // URLs can't be fetched server-side via the proxy, and failed uploads
        // would produce a broken PDF.
        const pending = images.find((i) => i.uploadStatus === 'uploading' || i.uploadStatus === 'error');
        if (pending) {
            toast.showToast({
                message: pending.uploadStatus === 'error' ? t('reupload') : t('generating'),
                variant: 'error',
            });
            return;
        }
        setDownloading(true);

        try {
            const pdfDoc = await PDFDocument.create();

            for (const img of images) {
                let bytes: Uint8Array;
                let isPng: boolean;

                if (img.uri.startsWith('blob:')) {
                    // Local object URL — fetch directly (same origin/client-side)
                    const resp = await fetch(img.uri);
                    if (!resp.ok) throw new Error(`Failed to fetch blob: ${resp.status}`);
                    bytes = new Uint8Array(await resp.arrayBuffer());
                    isPng = img.pendingFile?.type === 'image/png';
                } else if (img.uri.startsWith('data:')) {
                    // Legacy data URI
                    isPng = img.uri.startsWith('data:image/png');
                    const base64 = img.uri.split(',')[1];
                    const byteChars = atob(base64);
                    bytes = new Uint8Array(byteChars.length);
                    for (let i = 0; i < byteChars.length; i++) {
                        bytes[i] = byteChars.charCodeAt(i);
                    }
                } else {
                    // Remote URL — fetch through our same-origin proxy to avoid
                    // CORS errors when the R2/public host doesn't send CORS headers.
                    const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(img.uri)}`;
                    const resp = await fetch(proxyUrl);
                    if (!resp.ok) throw new Error(`Failed to fetch image: ${resp.status}`);
                    const buf = new Uint8Array(await resp.arrayBuffer());
                    bytes = buf;
                    isPng = img.uri.toLowerCase().endsWith('.png') || img.uri.toLowerCase().includes('.png');
                }

                let embedded;
                if (isPng) {
                    embedded = await pdfDoc.embedPng(bytes);
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
    }, [images, toast, t]);

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
                                    <LuArrowLeft className="h-5 w-5 rtl:rotate-180" />
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
                                            variant="outline"
                                            onClick={flushSave}
                                            disabled={saving || !hasUnsavedChanges || images.some((i) => i.uploadStatus === 'uploading')}
                                            className="gap-2"
                                        >
                                            {saving ? (
                                                <LuLoaderCircle className="h-5 w-5 animate-spin" />
                                            ) : (
                                                <LuSave className="h-5 w-5" />
                                            )}
                                            {uiT('save')}
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
                                                onRetryUpload={handleRetryUpload}
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

                {/* Leave confirmation modal — same as the editor.
                    Only shows when there are unsaved changes. No modal when
                    there are no changes (leaves silently via doSilentLeave). */}
                {showLeaveModal && (
                    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/60 p-4">
                        <div className="relative w-full max-w-sm rounded-2xl bg-background p-6 shadow-2xl">
                            {/* X close button — same as "continue editing" (just dismisses) */}
                            <button
                                type="button"
                                onClick={() => setShowLeaveModal(false)}
                                className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-secondary transition-colors hover:bg-muted hover:text-foreground rtl:right-auto rtl:left-3"
                                aria-label={editorT('keepEditing')}
                            >
                                <LuX className="h-5 w-5" />
                            </button>
                            <h2 className="mb-2 pe-8 text-lg font-bold text-foreground">
                                {wasSyncedBeforeRef.current ? editorT('saveChangesTitle') : editorT('saveProjectTitle')}
                            </h2>
                            <p className="mb-6 text-sm text-secondary">
                                {wasSyncedBeforeRef.current ? editorT('saveChangesDescription') : editorT('saveProjectDescription')}
                            </p>
                            <div className="flex gap-3">
                                <Button
                                    variant="ghost"
                                    onClick={() => {
                                        setShowLeaveModal(false);
                                        doNoAndLeave();
                                    }}
                                    className="flex-1 text-secondary"
                                >
                                    {editorT('no')}
                                </Button>
                                <Button
                                    onClick={() => {
                                        setShowLeaveModal(false);
                                        doSaveAndLeave();
                                    }}
                                    className="flex-1"
                                >
                                    {editorT('yes')}
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </DndProvider >
    );
}
