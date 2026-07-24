'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from '@/lib/i18n/strings';
import { toJpeg } from 'html-to-image';
import {
    LuArrowLeft,
} from 'react-icons/lu';

import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import Modal from '@/components/ui/Modal';
import Drawer from '@/components/ui/Drawer';
import ColorPickerDrawer from '@/components/ui/ColorPickerDrawer';
import SliderField from '@/components/ui/SliderField';
import Canvas from '@/components/editor/Canvas';
import PropertiesBar from '@/components/editor/PropertiesBar';
import DraggableLayerList from '@/components/common/DraggableLayerList';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import ImageCropModal from '@/components/editor/Modals/ImageCropModal';
import CollageEditModal from '@/components/editor/Modals/CollageEditModal';
import TopToolbar from '@/components/editor/EditorPage/TopToolbar';
import BottomBar from '@/components/editor/EditorPage/BottomBar';
import ShapesDrawer from '@/components/editor/EditorPage/ShapesDrawer';
import DynamicFieldsDrawer from '@/components/editor/EditorPage/DynamicFieldsDrawer';
import FontDrawer from '@/components/editor/EditorPage/FontDrawer';
import TextEditDrawer from '@/components/editor/EditorPage/TextEditDrawer';
import LeaveModal from '@/components/editor/EditorPage/LeaveModal';
import MobileEyeDropper from '@/components/editor/EditorPage/MobileEyeDropper';
import { useProjectStore } from '@/lib/store/use-project-store';
import { useToast } from '@/components/providers/ToastProvider';
import { uploadImageWithProgress, createInstantPreview, uploadImageInBackground, captureProjectThumbnailBlob, uploadProjectThumbnailBlob } from '@/lib/storage/upload';
import {
    buildTextLayer,
    buildImageLayer,
    buildCollageLayer,
    buildShapeLayer,
    buildDynamicFieldLayer,
    nextZIndex,
    cloneLayer,
} from '@/lib/utils/layer-utils';
import { ASPECT_RATIOS, COLLAGE_LAYOUTS } from '@/lib/constants/presets';
import { ORDER_FIELDS } from '@/lib/constants/order-fields';
import { useSavedColors } from '@/lib/hooks/useSavedColors';
import { useUserFonts } from '@/lib/hooks/useUserFonts';
import { useUserShapes } from '@/lib/hooks/useUserShapes';
import type { Project, AnyLayer, TextLayer, ImageLayer, ShapeLayer, DynamicFieldLayer, SafeArea } from '@/types';
import Input from '@/components/ui/Input';

/**
 * A project is "blank" when it has no layers and no background image — i.e.
 * there's nothing worth saving. Leaving a blank project (whether brand-new
 * or emptied out during this session) always discards it without asking,
 * regardless of whether `hasUnsavedChanges` happens to be true (e.g. the
 * user added and then deleted a layer).
 */
function isProjectBlank(project: Pick<Project, 'layers' | 'backgroundUri'>): boolean {
    return project.layers.length === 0 && !project.backgroundUri;
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
    // Zustand store actions — stable references, no re-renders from calling them
    const storeGetProject = useProjectStore((s) => s.getProject);
    const storeSaveProject = useProjectStore((s) => s.saveProject);
    const storeDeleteProjectOptimistic = useProjectStore((s) => s.deleteProjectOptimistic);
    const storeUpdateProjectRemote = useProjectStore((s) => s.updateProjectRemote);
    const storeInvalidateThumbnail = useProjectStore((s) => s.invalidateThumbnail);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const shapeFileInputRef = useRef<HTMLInputElement>(null);
    const bgFileInputRef = useRef<HTMLInputElement>(null);
    const replaceImageInputRef = useRef<HTMLInputElement>(null);

    // Set to true when we're intentionally navigating away (via history.go).
    // The popstate handler checks this to avoid re-entering the leave logic
    // when our intentional back navigation fires popstate.
    const isLeavingRef = useRef(false);

    const [project, setProject] = useState<Project | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [showLeaveModal, setShowLeaveModal] = useState(false);
    const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
    const [zoom, setZoom] = useState(0);
    // History snapshots include layers + background properties so undo/redo
    // can restore background color and background image changes too.
    type ProjectSnapshot = {
        layers: AnyLayer[];
        backgroundColor?: string;
        backgroundUri?: string;
        backgroundThumbnailUri?: string;
    };
    const [history, setHistory] = useState<{ past: ProjectSnapshot[]; future: ProjectSnapshot[] }>({
        past: [],
        future: [],
    });
    const projectRef = useRef<Project | null>(null);
    const inTransactionRef = useRef(false);
    // Helper — create a history snapshot from a project
    const snapshot = useCallback((p: Project): ProjectSnapshot => ({
        layers: p.layers,
        backgroundColor: p.backgroundColor,
        backgroundUri: p.backgroundUri,
        backgroundThumbnailUri: p.backgroundThumbnailUri,
    }), []);
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
    const toast = useToast();
    const [isCropOpen, setIsCropOpen] = useState(false);
    const [collageEditOpen, setCollageEditOpen] = useState(false);
    const [addDrawerOpen, setAddDrawerOpen] = useState(false);
    const [dynamicFieldDrawerOpen, setDynamicFieldDrawerOpen] = useState(false);
    const [layersDrawerOpen, setLayersDrawerOpen] = useState(false);
    // When true, delete buttons are shown above each uploaded user shape
    const [editShapesMode, setEditShapesMode] = useState(false);
    // Shape fill mode for fast-add from the shapes drawer: true=filled, false=outline
    const [shapeFilled, setShapeFilled] = useState(true);
    // Brief flash feedback when undo/redo is clicked (500ms)
    const [undoFlash, setUndoFlash] = useState(false);
    const [redoFlash, setRedoFlash] = useState(false);
    // Tip text shown briefly at the top center of the canvas on undo/redo
    const [historyTip, setHistoryTip] = useState<string | null>(null);
    const [activeProp, setActiveProp] = useState<string | null>(null);
    const [colorPickerProp, setColorPickerProp] = useState<string | null>(null);
    const [fontDrawerOpen, setFontDrawerOpen] = useState(false);
    const [textEditDrawerOpen, setTextEditDrawerOpen] = useState(false);
    const [safeAreaEditMode, setSafeAreaEditMode] = useState(false);
    const eyeDropperReopenRef = useRef<string | null>(null);
    // When true, reopening the color picker drawer shows the custom picker
    // (set after an eye-dropper pick so the user sees the picked color)
    const [reopenWithCustomPicker, setReopenWithCustomPicker] = useState(false);
    // Mobile eye dropper fallback — shows a canvas snapshot overlay for tapping a color
    const [mobileEyeDropper, setMobileEyeDropper] = useState<{
        dataUrl: string;
        onPick: (color: string) => void;
    } | null>(null);
    const { savedColors, persistColor: addSavedColor, removeColor: removeSavedColor } = useSavedColors();
    const { fonts: userFonts, uploading: fontUploading, fontsLoaded, uploadFont, deleteFont } = useUserFonts();
    const { shapes: userShapes, uploading: shapeUploading, uploadShape, deleteShape } = useUserShapes();
    const fontFileInputRef = useRef<HTMLInputElement | null>(null);

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

    // Tracks whether the project had been synced to the server before this session.
    // If false, the project is "new" and leaving without saving means deleting it.
    const [wasSyncedBefore, setWasSyncedBefore] = useState(false);

    // Load the project — always from the API (single source of truth).
    // No IndexedDB/localStorage — positions never drift because the DB is
    // the only place data is read from.
    useEffect(() => {
        storeGetProject(id).then((p) => {
            setProject(p);
            // Track if this project was ever synced to the server.
            // If not, it's a brand-new project and "No" on leave = delete it.
            setWasSyncedBefore(!!(p && p.syncedAt));
            setLoading(false);
        });
    }, [id, storeGetProject]);

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
    const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hasUnsavedRef = useRef(false);
    // Debounced thumbnail regeneration — after the user stops making changes
    // for a few seconds, we capture a new thumbnail and upload it in the
    // background so the /projects card preview stays up-to-date without
    // needing a full save. Cancelled on explicit save/leave (those handle
    // thumbnails themselves).
    const thumbnailDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Guards against overlapping thumbnail captures (don't start a new one
    // while the previous capture is still running).
    const thumbnailInFlightRef = useRef(false);

    // Write working state to sessionStorage — survives page refresh / mobile
    // app kill, but does NOT touch the database. The DB is only written when
    // the user clicks Save or confirms "Yes" on the leave modal.
    const saveSession = useCallback((projectToSave: Project) => {
        try {
            sessionStorage.setItem(`manasik:project:${projectToSave.id}`, JSON.stringify(projectToSave));
        } catch {
            // sessionStorage might be full or unavailable — ignore
        }
    }, []);

    // Capture the canvas as a compressed thumbnail blob. This is a local
    // (non-network) operation, so it's safe to await briefly even when the
    // caller is about to navigate away right after. Temporarily hides the
    // layer selection outline so it doesn't appear in the captured image.
    const captureThumbnailBlob = useCallback(async (bgColor: string): Promise<Blob | null> => {
        if (!canvasRef.current) return null;
        const prevSelection = selectedLayerIdRef.current;
        setSelectedLayerId(null);
        setIsExporting(true);
        // Wait one tick so the selection outline is actually removed from
        // the DOM before we capture the snapshot.
        await new Promise((r) => setTimeout(r, 80));
        try {
            return await captureProjectThumbnailBlob(canvasRef.current, bgColor);
        } catch {
            return null;
        } finally {
            setIsExporting(false);
            setSelectedLayerId(prevSelection);
        }
    }, []);

    // Upload an already-captured thumbnail blob in the background.
    // Fire-and-forget — safe to call after navigating away since it's just
    // a network request with no DOM dependency.
    const uploadThumbnailInBackground = useCallback((blob: Blob, projectId: string) => {
        uploadProjectThumbnailBlob(blob, projectId)
            .then((url) => {
                if (url) storeInvalidateThumbnail(projectId);
            })
            .catch((err) => console.error('Failed to upload project thumbnail:', err));
    }, [storeInvalidateThumbnail]);

    // Schedule a debounced thumbnail regeneration. Called after every
    // persistProject (i.e. every change). After the user stops editing for
    // THUMBNAIL_DEBOUNCE_MS, we capture a fresh snapshot and upload it —
    // the old thumbnail is overwritten in R2 (same key) and the new URL
    // includes a cache-busting ?v= timestamp so the /projects card shows
    // the updated preview. Skipped for blank projects (nothing to show)
    // and cancelled on explicit save/leave.
    const THUMBNAIL_DEBOUNCE_MS = 3000;
    const scheduleThumbnailUpdate = useCallback((project: Project) => {
        // Don't generate thumbnails for blank projects
        if (isProjectBlank(project)) return;
        // Cancel any pending debounce — we only care about the latest state
        if (thumbnailDebounceRef.current) {
            clearTimeout(thumbnailDebounceRef.current);
        }
        thumbnailDebounceRef.current = setTimeout(() => {
            thumbnailDebounceRef.current = null;
            // Skip if a capture is already running
            if (thumbnailInFlightRef.current) return;
            thumbnailInFlightRef.current = true;
            captureThumbnailBlob(project.backgroundColor ?? '#ffffff')
                .then((blob) => {
                    if (blob) uploadThumbnailInBackground(blob, project.id);
                })
                .catch(() => { /* non-fatal */ })
                .finally(() => {
                    thumbnailInFlightRef.current = false;
                });
        }, THUMBNAIL_DEBOUNCE_MS);
    }, [captureThumbnailBlob, uploadThumbnailInBackground]);

    // Cancel any pending debounced thumbnail update. Called by flushPersist
    // and doSaveAndLeave (they handle thumbnails explicitly) and on unmount.
    const cancelThumbnailUpdate = useCallback(() => {
        if (thumbnailDebounceRef.current) {
            clearTimeout(thumbnailDebounceRef.current);
            thumbnailDebounceRef.current = null;
        }
    }, []);

    const persistProject = useCallback(
        (updated: Project) => {
            pendingPersistRef.current = updated;
            hasUnsavedRef.current = true;
            setHasUnsavedChanges(true);

            // Schedule a debounced thumbnail update so the /projects card
            // preview stays current without needing a full save.
            scheduleThumbnailUpdate(updated);

            // If inside a transaction (drag, slider, etc.), don't write intermediate
            // states — only write the final state when the transaction ends.
            if (inTransactionRef.current) {
                return;
            }

            // Debounce: rapid changes (e.g. typing) only write the last state
            if (saveDebounceRef.current) {
                clearTimeout(saveDebounceRef.current);
            }
            saveDebounceRef.current = setTimeout(() => {
                saveDebounceRef.current = null;
                const current = pendingPersistRef.current;
                if (current) {
                    saveSession(current);
                }
            }, 300);
        },
        [saveSession, scheduleThumbnailUpdate]
    );

    // Force save to the database (MongoDB) immediately — used by the Save button.
    // This is the ONLY path (besides doSaveAndLeave) that writes to the server.
    const flushPersist = useCallback(async (updated: Project) => {
        pendingPersistRef.current = null;
        if (saveDebounceRef.current) {
            clearTimeout(saveDebounceRef.current);
            saveDebounceRef.current = null;
        }
        // Cancel any pending debounced thumbnail — we capture a fresh one
        // explicitly below after the save completes.
        cancelThumbnailUpdate();
        setSaving(true);
        try {
            const saved = await storeSaveProject(updated);
            // Update local state with the server's response (canonical positions)
            setProject(saved);
            // Clear the sessionStorage backup since the DB now has the latest
            try { sessionStorage.removeItem(`manasik:project:${updated.id}`); } catch { /* ignore */ }
            hasUnsavedRef.current = false;
            setHasUnsavedChanges(false);
            // Capture + upload the thumbnail in the background (non-blocking)
            captureThumbnailBlob(saved.backgroundColor ?? '#ffffff').then((blob) => {
                if (blob) uploadThumbnailInBackground(blob, saved.id);
            });
        } catch (error) {
            console.error('Failed to save project to server:', error);
            toast.showToast({ message: t('saveFailedMessage'), variant: 'error' });
        } finally {
            setSaving(false);
        }
    }, [storeSaveProject, captureThumbnailBlob, uploadThumbnailInBackground, cancelThumbnailUpdate, toast, t]);

    // Navigate back using the browser's history stack — no hardcoded target
    // page. The browser knows where the user came from, so this always
    // returns to the correct page (e.g. /templates if they came from
    // templates, /projects if from projects).
    //
    // The editor pushes a dummy history entry on mount to intercept the
    // hardware back button. So the history stack looks like:
    //   [referrer] → [editor] → [dummy]
    //
    // - UI back button (fromPopstate=false): we're at [dummy]. Go back 2
    //   steps to land on [referrer].
    // - Hardware back (fromPopstate=true): the dummy was just popped by the
    //   browser's popstate, so we're at [editor]. Go back 1 step to land
    //   on [referrer].
    //
    // If there isn't enough history (e.g. user opened the editor by direct
    // URL), history.go() does nothing — we fall back to router.back().
    //
    // isLeavingRef prevents the popstate handler from re-entering attemptLeave
    // when our intentional history.go() fires its own popstate event.
    const navigateBack = useCallback((fromPopstate: boolean) => {
        isLeavingRef.current = true;

        const steps = fromPopstate ? -1 : -2;
        const go = () => {
            const beforeUrl = window.location.href;
            window.history.go(steps);
            // Fallback: if history.go() didn't change the URL (not enough
            // history — e.g. direct URL entry), use router.back() after
            // a short delay.
            setTimeout(() => {
                if (window.location.href === beforeUrl) {
                    router.back();
                }
            }, 100);
        };

        // Defer when fromPopstate so the call runs AFTER the browser
        // finishes processing the current popstate event.
        if (fromPopstate) {
            setTimeout(go, 0);
        } else {
            go();
        }
    }, [router]);

    // Leave the editor and return to the page the user came from. Used
    // whenever there's nothing to save or delete (project already synced
    // and untouched this session).
    const leaveToProjects = useCallback((fromPopstate: boolean) => {
        const current = projectRef.current;
        if (current) {
            try { sessionStorage.removeItem(`manasik:project:${current.id}`); } catch { /* ignore */ }
        }
        navigateBack(fromPopstate);
    }, [navigateBack]);

    // Discard a blank project (no layers, no background) and leave.
    // Optimistic UI: the project disappears from the store immediately and
    // the app navigates away — the DELETE request runs in the background,
    // so the user never has to wait on it.
    const leaveAndDeleteBlank = useCallback((current: Project, fromPopstate: boolean) => {
        if (saveDebounceRef.current) {
            clearTimeout(saveDebounceRef.current);
            saveDebounceRef.current = null;
        }
        cancelThumbnailUpdate();
        pendingPersistRef.current = null;
        hasUnsavedRef.current = false;
        setHasUnsavedChanges(false);
        try { sessionStorage.removeItem(`manasik:project:${current.id}`); } catch { /* ignore */ }
        storeDeleteProjectOptimistic(current.id);
        navigateBack(fromPopstate);
    }, [navigateBack, storeDeleteProjectOptimistic, cancelThumbnailUpdate]);

    // Save and navigate away — used by the "Yes" button in the leave modal.
    // Optimistic UI: the thumbnail MUST be captured while the canvas is
    // still mounted (it's a DOM snapshot), so we briefly await that step —
    // then we navigate back immediately without waiting for the
    // actual save or the thumbnail upload, which both run in the background.
    const doSaveAndLeave = useCallback(async (nameOverride?: string) => {
        const current = pendingPersistRef.current || projectRef.current;
        if (!current) {
            navigateBack(false);
            return;
        }
        if (saveDebounceRef.current) {
            clearTimeout(saveDebounceRef.current);
            saveDebounceRef.current = null;
        }
        cancelThumbnailUpdate();
        pendingPersistRef.current = null;
        hasUnsavedRef.current = false;
        setHasUnsavedChanges(false);

        // Safety net — blank projects are normally intercepted before the
        // leave modal even opens, but guard here too just in case.
        if (isProjectBlank(current)) {
            leaveAndDeleteBlank(current, false);
            return;
        }

        // Apply rename if provided (first-time save flow)
        const toSave = nameOverride && nameOverride.trim()
            ? { ...current, name: nameOverride.trim() }
            : current;

        // Capture the thumbnail now — this needs the canvas DOM node, so it
        // must complete before we navigate away and unmount the page. It's a
        // local snapshot (no network), so the delay is small (~100ms).
        const blob = await captureThumbnailBlob(toSave.backgroundColor ?? '#ffffff');

        // Optimistic UI — leave immediately; persist to the server and
        // upload the thumbnail in the background without blocking on them.
        navigateBack(false);

        storeSaveProject(toSave)
            .then(() => {
                try { sessionStorage.removeItem(`manasik:project:${current.id}`); } catch { /* ignore */ }
                if (blob) uploadThumbnailInBackground(blob, toSave.id);
            })
            .catch((err) => {
                console.error('Failed to save project in background:', err);
                toast.showToast({ message: t('saveFailedMessage'), variant: 'error' });
            });
    }, [navigateBack, leaveAndDeleteBlank, captureThumbnailBlob, uploadThumbnailInBackground, storeSaveProject, cancelThumbnailUpdate, toast, t]);

    // "No" button in the leave modal — only reachable for non-blank projects
    // (blank projects are handled by leaveAndDeleteBlank before the modal
    // ever opens):
    //   - New project (never synced): discard means delete it.
    //   - Existing project with content: leave without saving (discard the
    //     unsaved session changes; the DB keeps the last-saved version).
    const doNoAndLeave = useCallback(() => {
        if (saveDebounceRef.current) {
            clearTimeout(saveDebounceRef.current);
            saveDebounceRef.current = null;
        }
        cancelThumbnailUpdate();
        pendingPersistRef.current = null;
        hasUnsavedRef.current = false;
        setHasUnsavedChanges(false);

        const current = projectRef.current;
        if (current) {
            try { sessionStorage.removeItem(`manasik:project:${current.id}`); } catch { /* ignore */ }
            if (!wasSyncedBefore) {
                // Brand-new project that was never saved — discard means delete.
                storeDeleteProjectOptimistic(current.id);
            }
        }
        navigateBack(false);
    }, [navigateBack, wasSyncedBefore, storeDeleteProjectOptimistic, cancelThumbnailUpdate]);

    // Central "leave" decision, shared by the UI back button and the
    // browser/phone back button (popstate).
    //   - Blank project → discard + leave immediately, never ask.
    //   - Unsaved changes on a non-blank project → show the yes/no modal.
    //   - Nothing to save (already synced, untouched) → just leave.
    // `fromPopstate` is true when called from the popstate handler (hardware
    // back button). We only re-push the history guard state when we're
    // actually keeping the user on the page (showing the modal) — leaving
    // always completes in a single back-press with no full page reload.
    const attemptLeave = useCallback((fromPopstate: boolean) => {
        const current = pendingPersistRef.current || projectRef.current;
        if (current && isProjectBlank(current)) {
            leaveAndDeleteBlank(current, fromPopstate);
            return;
        }
        if (hasUnsavedRef.current) {
            // Keep the user on the page — re-arm the guard so the next back
            // press is also caught (only relevant for popstate).
            if (fromPopstate) {
                window.history.pushState({ editorGuard: true }, '');
            }
            setShowLeaveModal(true);
            return;
        }
        leaveToProjects(fromPopstate);
    }, [leaveAndDeleteBlank, leaveToProjects]);

    const handleNavigateBack = useCallback(() => {
        attemptLeave(false);
    }, [attemptLeave]);

    const handleExportJpg = useCallback(async () => {
        if (!canvasRef.current || !project) return;
        if (isExporting) return; // Prevent double-clicks

        const previousSelection = selectedLayerId;
        setSelectedLayerId(null);
        setIsExporting(true);

        await new Promise((resolve) => setTimeout(resolve, 120));

        try {
            const dataUrl = await toJpeg(canvasRef.current, {
                quality: 0.95,
                backgroundColor: project.backgroundColor || '#ffffff',
                pixelRatio: 2,
                cacheBust: true,
                fetchRequestInit: { mode: 'cors' } as RequestInit,
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
    }, [project, selectedLayerId, isExporting]);

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
                    saveSession(current);
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
    }, [saveSession]);

    // NOTE: No auto-sync interval. The database is only written when the user
    // clicks the Save button (flushPersist) or confirms "Yes" on the leave
    // modal (doSaveAndLeave). Working state is kept in React + sessionStorage.

    const handleRenameProject = useCallback(async () => {
        if (!project || !renameValue.trim()) return;
        const trimmed = renameValue.trim();
        await storeUpdateProjectRemote(project.id, { name: trimmed });
        setProject((prev) => (prev ? { ...prev, name: trimmed } : prev));
        setRenameOpen(false);
    }, [project, renameValue, storeUpdateProjectRemote]);

    // When the leave modal opens for a brand-new (never-synced) project,
    // seed the inline rename input with the current project name so the user
    // can rename and save in one step (no separate rename modal).
    useEffect(() => {
        if (showLeaveModal && !wasSyncedBefore) {
            setRenameValue(projectRef.current?.name ?? '');
        }
    }, [showLeaveModal, wasSyncedBefore]);

    const updateProjectState = useCallback(
        (updater: (prev: Project) => Project, recordHistory = true) => {
            setProject((prev) => {
                if (!prev) return prev;
                const updated = updater(prev);
                if (recordHistory && !inTransactionRef.current) {
                    setHistory((h) => ({
                        past: [...h.past, snapshot(prev)],
                        future: [],
                    }));
                }
                persistProject(updated);
                return updated;
            });
        },
        [persistProject, snapshot]
    );

    const handleBackgroundColorChange = useCallback((color: string) => {
        updateProjectState((prev) => ({ ...prev, backgroundColor: color }));
    }, [updateProjectState]);

    const handleBackgroundImageChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !project) return;
        e.target.value = '';

        // --- Instant: create object URL and set as background immediately ---
        const tempUri = URL.createObjectURL(file);
        // Revoke the previous blob: background if there was one
        updateProjectState((prev) => ({
            ...prev,
            backgroundUri: tempUri,
            backgroundThumbnailUri: undefined,
            bgUploadStatus: 'uploading',
        }));

        // --- Background upload ---
        uploadImageInBackground(file)
            .then((uploaded) => {
                try { URL.revokeObjectURL(tempUri); } catch { /* ignore */ }
                updateProjectState((prev) => ({
                    ...prev,
                    backgroundUri: uploaded.uri,
                    backgroundThumbnailUri: uploaded.thumbnailUri,
                    bgUploadStatus: undefined,
                }));
            })
            .catch((err) => {
                console.error('Background image upload failed:', err);
                // Keep the blob: URL so the user still sees the image, but mark as error
                updateProjectState((prev) => ({
                    ...prev,
                    backgroundUri: tempUri,
                    bgUploadStatus: 'error',
                    bgPendingFile: file,
                }));
            });
    }, [project, updateProjectState]);

    /** Retry a failed background image upload. */
    const handleRetryBgUpload = useCallback(() => {
        const current = projectRef.current;
        if (!current || current.bgUploadStatus !== 'error' || !current.bgPendingFile) return;
        const file = current.bgPendingFile;
        const tempUri = current.backgroundUri?.startsWith('blob:') ? current.backgroundUri : URL.createObjectURL(file);
        updateProjectState((prev) => ({ ...prev, bgUploadStatus: 'uploading' }));
        uploadImageInBackground(file)
            .then((uploaded) => {
                try { URL.revokeObjectURL(tempUri); } catch { /* ignore */ }
                updateProjectState((prev) => ({
                    ...prev,
                    backgroundUri: uploaded.uri,
                    backgroundThumbnailUri: uploaded.thumbnailUri,
                    bgUploadStatus: undefined,
                    bgPendingFile: undefined,
                }));
            })
            .catch((err) => {
                console.error('Background image re-upload failed:', err);
                updateProjectState((prev) => ({ ...prev, bgUploadStatus: 'error' }));
            });
    }, [updateProjectState]);

    const handleRemoveBackgroundImage = useCallback(() => {
        // Revoke the blob: URL if the background is still uploading
        const prevBg = projectRef.current?.backgroundUri;
        if (prevBg && prevBg.startsWith('blob:')) {
            try { URL.revokeObjectURL(prevBg); } catch { /* ignore */ }
        }
        updateProjectState((prev) => ({
            ...prev,
            backgroundUri: undefined,
            backgroundThumbnailUri: undefined,
            bgUploadStatus: undefined,
            bgPendingFile: undefined,
        }));
    }, [updateProjectState]);

    const handleSafeAreaChange = useCallback(
        (area: SafeArea) => {
            updateProjectState((prev) => ({ ...prev, safeArea: area }), false);
        },
        [updateProjectState]
    );

    const handleUndo = useCallback(() => {
        setHistory((h) => {
            if (h.past.length === 0) return h;
            const previous = h.past[h.past.length - 1];
            const newPast = h.past.slice(0, -1);
            const current = projectRef.current;
            if (current) {
                const updated = {
                    ...current,
                    layers: previous.layers,
                    backgroundColor: previous.backgroundColor,
                    backgroundUri: previous.backgroundUri,
                    backgroundThumbnailUri: previous.backgroundThumbnailUri,
                };
                persistProject(updated);
                setProject(updated);
            }
            return { past: newPast, future: [current ? snapshot(current) : previous, ...h.future] };
        });
    }, [persistProject, snapshot]);

    const handleRedo = useCallback(() => {
        setHistory((h) => {
            if (h.future.length === 0) return h;
            const next = h.future[0];
            const newFuture = h.future.slice(1);
            const current = projectRef.current;
            if (current) {
                const updated = {
                    ...current,
                    layers: next.layers,
                    backgroundColor: next.backgroundColor,
                    backgroundUri: next.backgroundUri,
                    backgroundThumbnailUri: next.backgroundThumbnailUri,
                };
                persistProject(updated);
                setProject(updated);
            }
            return { past: [...h.past, current ? snapshot(current) : next], future: newFuture };
        });
    }, [persistProject, snapshot]);

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
        // instead of navigating away immediately. We only re-arm this guard
        // (push another dummy state) when we decide to keep the user on the
        // page (i.e. showing the leave modal) — when we decide to actually
        // leave, we let the back press go through as-is so it completes in
        // a single press instead of getting trapped behind an extra entry.
        window.history.pushState({ editorGuard: true }, '');
        const handlePopState = () => {
            // Ignore popstate from our intentional history.back()/go()
            // when leaving — isLeavingRef is set by navigateBack.
            if (isLeavingRef.current) return;
            attemptLeave(true);
        };
        window.addEventListener('popstate', handlePopState);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('beforeunload', handleBeforeUnload);
            window.removeEventListener('popstate', handlePopState);
            if (saveDebounceRef.current) {
                clearTimeout(saveDebounceRef.current);
                saveDebounceRef.current = null;
            }
            if (thumbnailDebounceRef.current) {
                clearTimeout(thumbnailDebounceRef.current);
                thumbnailDebounceRef.current = null;
            }
        };
    }, [handleUndo, handleRedo, attemptLeave]);

    const startChangeTransaction = useCallback(() => {
        if (inTransactionRef.current) return;
        inTransactionRef.current = true;
        const current = projectRef.current;
        if (!current) return;
        setHistory((h) => ({
            past: [...h.past, snapshot(current)],
            future: [],
        }));
    }, [snapshot]);

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
        (cropRect: { x: number; y: number; width: number; height: number }) => {
            if (!selectedLayerId) return;
            const layer = projectRef.current?.layers.find((l) => l.id === selectedLayerId);
            if (!layer || layer.type !== 'image') return;
            const imgLayer = layer as ImageLayer;

            // Non-destructive crop: only save the crop rect.
            // The original image (uri) stays unchanged.
            // naturalWidth/Height become the cropped dimensions for layout purposes.
            // imageScale is recalculated so the cropped region fills the layer box.
            const newW = cropRect.width;
            const newH = cropRect.height;
            const ratio = newW / newH;
            const newBoxW = imgLayer.width;
            const newBoxH = imgLayer.width / ratio;
            const newImageScale = Math.max(newBoxW / newW, newBoxH / newH);

            handleLayerChange(selectedLayerId, {
                cropRect,
                naturalWidth: newW,
                naturalHeight: newH,
                maskWidth: newBoxW,
                maskHeight: newBoxH,
                height: newBoxH,
                offsetX: 0,
                offsetY: 0,
                imageScale: newImageScale,
            } as Partial<AnyLayer>);
        },
        [selectedLayerId, handleLayerChange]
    );

    const handleUndoCrop = useCallback(() => {
        if (!selectedLayerId) return;
        const layer = projectRef.current?.layers.find((l) => l.id === selectedLayerId);
        if (!layer || layer.type !== 'image') return;
        const imgLayer = layer as ImageLayer;
        if (!imgLayer.cropRect) return; // Nothing to undo

        // Restore to full original image — just clear the crop rect
        // and restore naturalWidth/Height to the original dimensions
        const origW = imgLayer.originalNaturalWidth || imgLayer.naturalWidth;
        const origH = imgLayer.originalNaturalHeight || imgLayer.naturalHeight;
        const ratio = origW / origH;
        const newBoxW = imgLayer.width;
        const newBoxH = imgLayer.width / ratio;
        const newImageScale = Math.max(newBoxW / origW, newBoxH / origH);

        handleLayerChange(selectedLayerId, {
            cropRect: undefined,
            naturalWidth: origW,
            naturalHeight: origH,
            maskWidth: newBoxW,
            maskHeight: newBoxH,
            height: newBoxH,
            offsetX: 0,
            offsetY: 0,
            imageScale: newImageScale,
        } as Partial<AnyLayer>);
        setIsCropOpen(false);
    }, [selectedLayerId, handleLayerChange]);

    const handleLayerDragStart = useCallback(
        () => {
            const current = projectRef.current;
            if (!current) return;
            inTransactionRef.current = true;
            setHistory((h) => ({
                past: [...h.past, snapshot(current)],
                future: [],
            }));
        },
        [snapshot]
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
    useEffect(() => {
        selectedLayerIdRef.current = selectedLayerId;
        deleteLayerRef.current = handleDeleteLayer;
    }, [selectedLayerId, handleDeleteLayer]);

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

    const handleAddShape = useCallback((shape: ShapeLayer['shape'], filled = true) => {
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
            filled,
        });
        newLayer.zIndex = nextZIndex(project?.layers ?? []);
        updateProjectState((prev) => ({
            ...prev,
            layers: [...prev.layers, newLayer],
        }));
        setSelectedLayerId(newLayer.id);
        setAddDrawerOpen(false);
    }, [updateProjectState, project]);

    // Add a user-uploaded PNG shape to the canvas
    const handleAddPngShape = useCallback((shape: { id: string; name: string; url: string; naturalWidth: number; naturalHeight: number; }) => {
        const w = project?.canvasWidth ?? 1080;
        const h = project?.canvasHeight ?? 1080;
        // Size the layer to fit within 25% of canvas while preserving aspect ratio
        const maxDim = w * 0.25;
        const aspect = shape.naturalWidth / shape.naturalHeight || 1;
        let shapeW: number, shapeH: number;
        if (aspect >= 1) {
            shapeW = maxDim;
            shapeH = maxDim / aspect;
        } else {
            shapeH = maxDim;
            shapeW = maxDim * aspect;
        }
        const newLayer = buildShapeLayer({
            shape: 'png',
            uri: shape.url,
            naturalWidth: shape.naturalWidth,
            naturalHeight: shape.naturalHeight,
            name: shape.name,
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

    // Upload a PNG shape file
    const handleShapeFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';
        try {
            const uploaded = await uploadShape(file);
            if (uploaded) {
                toast.showToast({ message: t('toolbars.shape.shapeUploaded'), variant: 'success', duration: 2000 });
            }
        } catch {
            toast.showToast({ message: t('toolbars.shape.uploadFailed'), variant: 'error', duration: 3000 });
        }
    }, [uploadShape, toast, t]);

    // Delete a user-uploaded PNG shape
    const handleDeleteShape = useCallback(async (id: string) => {
        const ok = await deleteShape(id);
        if (ok) {
            toast.showToast({ message: t('toolbars.shape.shapeDeleted'), variant: 'success', duration: 2000 });
        } else {
            toast.showToast({ message: t('toolbars.shape.deleteFailed'), variant: 'error', duration: 3000 });
        }
    }, [deleteShape, toast, t]);

    const handleAddDynamicField = useCallback((field: { id: string; label: string; type: 'text' | 'image'; placeholder: string }) => {
        const w = project?.canvasWidth ?? 1080;
        const h = project?.canvasHeight ?? 1080;
        // reservation.photo supports multiple photos → default to a 2-image collage layout
        const isMultiPhoto = field.id === 'reservation.photo';
        const newLayer = buildDynamicFieldLayer({
            variableId: field.id,
            variableName: field.label,
            fieldType: field.type,
            placeholder: field.placeholder,
            fontSize: 50,
            collageLayout: isMultiPhoto ? '2h' : undefined,
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
        setDynamicFieldDrawerOpen(false);
    }, [updateProjectState, project]);

    /**
     * Upload a single image file in the background and swap the layer's URI
     * from the temporary object URL to the R2 URL when done.
     * On failure, marks the layer with uploadStatus='error' so the re-upload
     * button appears.
     */
    const startBackgroundUpload = useCallback(
        (layerId: string, file: File, tempUri: string) => {
            uploadImageInBackground(file)
                .then((uploaded) => {
                    // Revoke the temporary object URL
                    try { URL.revokeObjectURL(tempUri); } catch { /* ignore */ }
                    // Swap the URI on the layer and clear upload status
                    updateProjectState((prev) => ({
                        ...prev,
                        layers: prev.layers.map((l) => {
                            if (l.id !== layerId || l.type !== 'image') return l;
                            return {
                                ...l,
                                uri: uploaded.uri,
                                thumbnailUri: uploaded.thumbnailUri ?? l.thumbnailUri,
                                uploadStatus: undefined,
                                pendingFile: undefined,
                            } as ImageLayer;
                        }),
                    }));
                })
                .catch((err) => {
                    console.error('Background image upload failed:', err);
                    updateProjectState((prev) => ({
                        ...prev,
                        layers: prev.layers.map((l) => {
                            if (l.id !== layerId || l.type !== 'image') return l;
                            return { ...l, uploadStatus: 'error', pendingFile: file } as ImageLayer;
                        }),
                    }));
                });
        },
        [updateProjectState]
    );

    const handleFileSelect = useCallback(
        async (e: React.ChangeEvent<HTMLInputElement>) => {
            const files = Array.from(e.target.files || []);
            if (files.length === 0 || !project) return;
            e.target.value = '';

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

            const maxImages = Math.min(files.length, 4);
            const selectedFiles = files.slice(0, maxImages);

            // --- Instant add: create object URLs and add layers immediately ---
            // Get instant previews (object URL + dimensions) for all files
            const previews = await Promise.all(
                selectedFiles.map((f) => createInstantPreview(f).catch(() => null))
            );

            if (previews.every((p) => p === null)) {
                toast.showToast({ message: t('toolbars.image.uploadFailed'), variant: 'error' });
                return;
            }

            const validPreviews = previews.filter((p): p is { uri: string; naturalWidth: number; naturalHeight: number } => p !== null);
            const validFiles = selectedFiles.filter((_, i) => previews[i] !== null);

            if (validPreviews.length === 1) {
                // Single image — normal image layer with instant preview
                const { uri: tempUri, naturalWidth: nw, naturalHeight: nh } = validPreviews[0];
                const file = validFiles[0];
                const newLayer = buildImageLayer({
                    uri: tempUri,
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
                // Mark as uploading — the background upload will swap the URI
                newLayer.uploadStatus = 'uploading';
                newLayer.pendingFile = file;
                updateProjectState((prev) => ({
                    ...prev,
                    layers: [...prev.layers, newLayer],
                }));
                setSelectedLayerId(newLayer.id);
                setAddDrawerOpen(false);

                // Start background upload
                startBackgroundUpload(newLayer.id, file, tempUri);
            } else {
                // Multiple images — collage layer with instant previews
                const uris = validPreviews.map(r => r.uri);
                const naturalSizes = validPreviews.map(r => ({ width: r.naturalWidth, height: r.naturalHeight }));
                const layout = COLLAGE_LAYOUTS.find(l => l.count === uris.length) || COLLAGE_LAYOUTS[0];
                const newLayer = buildCollageLayer({
                    uris,
                    naturalSizes,
                    layoutId: layout.id,
                    canvasWidth: project.canvasWidth,
                    canvasHeight: project.canvasHeight,
                });
                newLayer.width = boxW;
                newLayer.height = boxH;
                newLayer.maskWidth = boxW;
                newLayer.maskHeight = boxH;
                newLayer.x = (project.canvasWidth - boxW) / 2;
                newLayer.y = (project.canvasHeight - boxH) / 2;
                newLayer.zIndex = nextZIndex(project.layers);
                // For collage, mark as uploading and keep all files
                newLayer.uploadStatus = 'uploading';
                newLayer.pendingFile = undefined; // collage handles its own upload
                updateProjectState((prev) => ({
                    ...prev,
                    layers: [...prev.layers, newLayer],
                }));
                setSelectedLayerId(newLayer.id);
                setAddDrawerOpen(false);

                // Upload each cell image in the background and swap URIs
                validFiles.forEach((file, i) => {
                    const tempUri = uris[i];
                    uploadImageInBackground(file)
                        .then((uploaded) => {
                            // Revoke the object URL
                            try { URL.revokeObjectURL(tempUri); } catch { /* ignore */ }
                            // Swap the cell URI in the collage
                            updateProjectState((prev) => {
                                const layer = prev.layers.find((l) => l.id === newLayer.id);
                                if (!layer || layer.type !== 'image' || !layer.collage) return prev;
                                const newCells = [...layer.collage.cells];
                                if (newCells[i]) {
                                    newCells[i] = { ...newCells[i], uri: uploaded.uri };
                                }
                                const newUris = [...layer.collage.uris];
                                newUris[i] = uploaded.uri;
                                const updatedLayer: ImageLayer = {
                                    ...layer,
                                    uri: newUris[0] || layer.uri,
                                    thumbnailUri: uploaded.thumbnailUri,
                                    collage: { ...layer.collage, uris: newUris, cells: newCells },
                                };
                                // Clear upload status only when all cells are uploaded
                                const allUploaded = newUris.every((u) => !u.startsWith('blob:'));
                                if (allUploaded) {
                                    updatedLayer.uploadStatus = undefined;
                                    updatedLayer.pendingFile = undefined;
                                }
                                return {
                                    ...prev,
                                    layers: prev.layers.map((l) => l.id === newLayer.id ? updatedLayer : l),
                                };
                            });
                        })
                        .catch((err) => {
                            console.error('Collage cell upload failed:', err);
                            // Mark the layer as error so the user can retry
                            updateProjectState((prev) => {
                                const layer = prev.layers.find((l) => l.id === newLayer.id);
                                if (!layer || layer.type !== 'image') return prev;
                                return {
                                    ...prev,
                                    layers: prev.layers.map((l) =>
                                        l.id === newLayer.id
                                            ? { ...l, uploadStatus: 'error' } as ImageLayer
                                            : l
                                    ),
                                };
                            });
                        });
                });
            }
        },
        [project, updateProjectState, toast, t, startBackgroundUpload]
    );

    /**
     * Retry a failed background upload for a specific layer.
     * Called by the "re-upload" button in the LayerRenderer.
     */
    const handleRetryUpload = useCallback(
        (layerId: string) => {
            const layer = projectRef.current?.layers.find((l) => l.id === layerId);
            if (!layer || layer.type !== 'image') return;
            const file = layer.pendingFile;
            if (!file) return;
            const tempUri = layer.uri.startsWith('blob:') ? layer.uri : URL.createObjectURL(file);
            // Mark as uploading again
            updateProjectState((prev) => ({
                ...prev,
                layers: prev.layers.map((l) => {
                    if (l.id !== layerId || l.type !== 'image') return l;
                    return { ...l, uploadStatus: 'uploading' } as ImageLayer;
                }),
            }));
            startBackgroundUpload(layerId, file, tempUri);
        },
        [updateProjectState, startBackgroundUpload]
    );

    const handleReplaceImage = useCallback(
        async (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file || !selectedLayerId) return;
            e.target.value = '';
            const currentLayer = projectRef.current?.layers.find(l => l.id === selectedLayerId);
            try {
                const { uri, naturalWidth, naturalHeight, thumbnailUri } = await uploadImageWithProgress(
                    file,
                    toast,
                    'جاري رفع الصورة...'
                );
                const boxW = currentLayer?.width ?? naturalWidth;
                const boxH = currentLayer?.height ?? naturalHeight;
                const scale = Math.max(boxW / naturalWidth, boxH / naturalHeight);
                handleLayerChange(selectedLayerId, {
                    uri,
                    // Non-destructive: new image replaces the original, clear any crop
                    originalNaturalWidth: naturalWidth,
                    originalNaturalHeight: naturalHeight,
                    naturalWidth,
                    naturalHeight,
                    thumbnailUri,
                    maskWidth: boxW,
                    maskHeight: boxH,
                    offsetX: 0,
                    offsetY: 0,
                    imageScale: scale,
                    cropRect: undefined,
                } as Partial<AnyLayer>);
            } catch {
                // toast already shown by uploader
            }
        },
        [selectedLayerId, handleLayerChange, toast]
    );

    // Change collage layout (only between layouts with the same image count)
    const handleCollageLayoutChange = useCallback(
        (layerId: string, layoutId: string) => {
            if (!project) return;
            const layer = project.layers.find(l => l.id === layerId);
            if (!layer || layer.type !== 'image' || !layer.collage) return;
            handleLayerChange(layerId, {
                collage: { ...layer.collage, layout: layoutId },
            } as Partial<AnyLayer>);
        },
        [handleLayerChange, project]
    );

    // --- Font upload handlers ---
    // These must be declared before any early return (Rules of Hooks).
    // We use a ref to access the current selected layer inside the callbacks
    // so the callbacks don't need selectedLayer in their deps (which would
    // recreate them on every selection change).
    const selectedLayerRef = useRef<AnyLayer | null>(null);
    const handleFontFileSelect = useCallback(
        async (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
                const uploaded = await uploadFont(file);
                const layer = selectedLayerRef.current;
                if (uploaded && layer && layer.type === 'text') {
                    // Auto-apply the newly uploaded font to the currently selected text layer
                    handleLayerChange(layer.id, {
                        fontFamily: uploaded.family,
                        fontWeight: uploaded.weight,
                    } as Partial<AnyLayer>);
                    setFontDrawerOpen(false);
                }
            } catch (err) {
                console.error('Font upload failed:', err);
                const msg = (err as Error)?.message;
                toast.showToast({
                    message:
                        msg === 'unsupportedType' ? t('toolbars.text.fontUploadUnsupported')
                            : msg === 'fileTooLarge' ? t('toolbars.text.fontUploadTooLarge')
                                : t('toolbars.text.fontUploadFailed'),
                    variant: 'error',
                });
            } finally {
                // Reset input so the same file can be picked again
                if (e.target) e.target.value = '';
            }
        },
        [uploadFont, t, toast, handleLayerChange]
    );

    const handleDeleteUserFont = useCallback(
        async (fontId: string) => {
            const ok = await deleteFont(fontId);
            if (!ok) {
                toast.showToast({ message: t('toolbars.text.fontDeleteFailed'), variant: 'error' });
            }
        },
        [deleteFont, t, toast]
    );

    // Keep selectedLayerRef in sync so the font upload callbacks (declared
    // before the early returns above) can access the current selected layer.
    useEffect(() => {
        selectedLayerRef.current = project?.layers.find((l) => l.id === selectedLayerId) ?? null;
    }, [project, selectedLayerId]);

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
                cacheBust: true,
                fetchRequestInit: { mode: 'cors' } as RequestInit,
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
        setReopenWithCustomPicker(false);
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
            setReopenWithCustomPicker(true);
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
                <TopToolbar
                    projectName={project.name}
                    onBack={handleNavigateBack}
                    onRename={() => {
                        setRenameValue(project.name);
                        setRenameOpen(true);
                    }}
                    onUndoClick={() => {
                        handleUndo();
                        setUndoFlash(true);
                        setHistoryTip(t('undo'));
                        setTimeout(() => setUndoFlash(false), 500);
                        setTimeout(() => setHistoryTip(null), 800);
                    }}
                    onRedoClick={() => {
                        handleRedo();
                        setRedoFlash(true);
                        setHistoryTip(t('redo'));
                        setTimeout(() => setRedoFlash(false), 500);
                        setTimeout(() => setHistoryTip(null), 800);
                    }}
                    canUndo={history.past.length > 0}
                    canRedo={history.future.length > 0}
                    undoFlash={undoFlash}
                    redoFlash={redoFlash}
                    undoLabel={t('undo')}
                    redoLabel={t('redo')}
                    layersLabel={t('layers')}
                    exportLabel={t('export')}
                    saveLabel={t('save')}
                    layersDrawerOpen={layersDrawerOpen}
                    onOpenLayers={() => setLayersDrawerOpen(true)}
                    onExport={handleExportJpg}
                    isExporting={isExporting}
                    onSave={() => flushPersist(project)}
                    saving={saving}
                    hasUnsavedChanges={hasUnsavedChanges}
                />

                {/* Main editor area — canvas only, panels are drawers now */}
                <div className="relative flex flex-1 overflow-hidden">
                    {/* Center: canvas — always centered, fits to screen */}
                    <div
                        ref={canvasContainerRef}
                        className="relative flex flex-1 items-center justify-center overflow-hidden bg-canvas-bg touch-none transition-[padding] duration-200 ease-out"
                        style={{ paddingBottom: bottomBarHeight }}
                    >
                        {/* Undo/redo tip — briefly shown at top center of the canvas */}
                        {historyTip && (
                            <div
                                className="pointer-events-none absolute top-4 left-1/2 z-50 -translate-x-1/2 rounded-full bg-foreground/90 px-4 py-1.5 text-sm font-medium text-background shadow-lg"
                                style={{ animation: 'fadeInOut 0.8s ease-out' }}
                            >
                                {historyTip}
                            </div>
                        )}
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
                                        // fontsLoaded forces a re-render when user fonts finish loading
                                        // so text layers pick up the newly registered FontFace.
                                        data-fonts-loaded={fontsLoaded}
                                        width={project.canvasWidth}
                                        height={project.canvasHeight}
                                        backgroundColor={project.backgroundColor ?? '#ffffff'}
                                        backgroundUri={project.backgroundUri}
                                        safeArea={project.safeArea}
                                        onSafeAreaChange={handleSafeAreaChange}
                                        safeAreaEditMode={safeAreaEditMode}
                                        safeAreaResetLabel={t('safeAreaReset')}
                                        safeAreaWarningLabel={t('safeAreaWarning')}
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
                                        onRetryUpload={handleRetryUpload}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Bottom bar — shown when no layer is selected (mobile style) */}
                    {!selectedLayer && (
                        <BottomBar
                            project={project}
                            bottomBarRef={bottomBarRef}
                            isBookingTemplate={project?.kind === 'booking_template'}
                            dynamicFieldDrawerOpen={dynamicFieldDrawerOpen}
                            onOpenDynamicFieldDrawer={() => setDynamicFieldDrawerOpen(true)}
                            onAddText={handleAddText}
                            onAddImage={() => fileInputRef.current?.click()}
                            addDrawerOpen={addDrawerOpen}
                            onOpenShapesDrawer={() => setAddDrawerOpen(true)}
                            onBgImageClick={() => bgFileInputRef.current?.click()}
                            onRemoveBgImage={handleRemoveBackgroundImage}
                            onRetryBgUpload={handleRetryBgUpload}
                            bgColor={project.backgroundColor ?? '#ffffff'}
                            colorPickerActive={colorPickerProp === 'canvas.bg'}
                            onToggleBgColor={() => setColorPickerProp(colorPickerProp === 'canvas.bg' ? null : 'canvas.bg')}
                            safeAreaEditMode={safeAreaEditMode}
                            onToggleSafeArea={() => setSafeAreaEditMode(!safeAreaEditMode)}
                            labels={{
                                addField: t('addField'),
                                addText: t('addText'),
                                addImage: t('addImage'),
                                addShape: t('addShape'),
                                changeBgImage: t('changeBgImage'),
                                setBgImage: t('setBgImage'),
                                removeBgImage: t('removeBgImage'),
                                canvasBackground: t('canvasBackground'),
                                safeAreaEditOn: t('safeAreaEditOn'),
                                safeAreaEditOff: t('safeAreaEditOff'),
                            }}
                        />
                    )}

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
                    <input
                        ref={shapeFileInputRef}
                        type="file"
                        accept="image/png"
                        className="hidden"
                        onChange={handleShapeFileSelect}
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

                {/* Shapes drawer — opened from the bottom bar shape button */}
                <ShapesDrawer
                    isOpen={addDrawerOpen}
                    onClose={() => {
                        setAddDrawerOpen(false);
                        setEditShapesMode(false);
                    }}
                    title={t('addShape')}
                    shapeFilled={shapeFilled}
                    onSetShapeFilled={setShapeFilled}
                    editShapesMode={editShapesMode}
                    onToggleEditShapes={() => setEditShapesMode((v) => !v)}
                    userShapes={userShapes}
                    onAddShape={handleAddShape}
                    onAddPngShape={handleAddPngShape}
                    onDeleteShape={handleDeleteShape}
                    onUploadShape={() => shapeFileInputRef.current?.click()}
                    shapeUploading={shapeUploading}
                    labels={{
                        shapeFilled: t('shapeFilled'),
                        shapeOutline: t('shapeOutline'),
                        addShape: t('addShape'),
                        editShapes: t('editShapes'),
                        doneEditShapes: t('doneEditShapes'),
                        uploadShape: t('uploadShape'),
                        deleteShape: t('toolbars.shape.deleteShape'),
                    }}
                    shapeLabel={(labelKey) => t(`toolbars.shape.${labelKey}`)}
                />

                {/* Dynamic fields drawer — order fields picker (booking templates only) */}
                <DynamicFieldsDrawer
                    isOpen={dynamicFieldDrawerOpen}
                    onClose={() => setDynamicFieldDrawerOpen(false)}
                    title={t('addField')}
                    fields={ORDER_FIELDS}
                    onAddField={handleAddDynamicField}
                />

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
                                                        if (layer.collage) {
                                                            // Collage layer — just resize the container;
                                                            // cells are relative proportions so they adjust automatically.
                                                            handleLayerChange(layer.id, {
                                                                width: newW, height: newH,
                                                                x: newX, y: newY,
                                                            } as Partial<AnyLayer>);
                                                        } else {
                                                            // Regular image — recalculate imageScale so image covers the new box
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
                                                        }
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
                    onClose={() => { setColorPickerProp(null); setReopenWithCustomPicker(false); }}
                    onDragStart={startChangeTransaction}
                    onEyeDropper={handleEyeDropper}
                    forceCustomPickerOnOpen={reopenWithCustomPicker}
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
                <FontDrawer
                    isOpen={fontDrawerOpen}
                    onClose={() => setFontDrawerOpen(false)}
                    title={t('toolbars.text.font')}
                    selectedLayer={selectedLayer}
                    onSelectFont={(family, weight) => {
                        if (selectedLayer) {
                            handleLayerChange(selectedLayer.id, { fontFamily: family, fontWeight: weight } as Partial<AnyLayer>);
                        }
                        setFontDrawerOpen(false);
                    }}
                    userFonts={userFonts}
                    fontUploading={fontUploading}
                    onUploadFont={() => fontFileInputRef.current?.click()}
                    onDeleteFont={handleDeleteUserFont}
                    fontFileInputRef={fontFileInputRef}
                    onFontFileSelect={handleFontFileSelect}
                    labels={{
                        uploadFont: t('toolbars.text.uploadFont'),
                        fontUploading: t('toolbars.text.fontUploading'),
                        builtinFonts: t('toolbars.text.builtinFonts'),
                        myFonts: t('toolbars.text.myFonts'),
                        deleteFont: t('toolbars.text.deleteFont'),
                    }}
                />

                {/* Text edit drawer — edit the text content */}
                <TextEditDrawer
                    isOpen={textEditDrawerOpen}
                    onClose={() => setTextEditDrawerOpen(false)}
                    title={t('toolbars.text.text')}
                    selectedLayer={selectedLayer}
                    onTextChange={(layerId, text) => handleLayerChange(layerId, { text } as Partial<AnyLayer>, false)}
                    onDeleteLayer={handleDeleteLayer}
                />

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
                        imageUri={(selectedLayer as ImageLayer).uri}
                        naturalWidth={(selectedLayer as ImageLayer).originalNaturalWidth || (selectedLayer as ImageLayer).naturalWidth}
                        naturalHeight={(selectedLayer as ImageLayer).originalNaturalHeight || (selectedLayer as ImageLayer).naturalHeight}
                        lastCropRect={(selectedLayer as ImageLayer).cropRect}
                        hasCrop={!!(selectedLayer as ImageLayer).cropRect}
                        onUndoCrop={handleUndoCrop}
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
                <MobileEyeDropper
                    state={mobileEyeDropper}
                    eyeDropperLabel={t('toolbars.text.eyeDropper')}
                    cancelLabel={uiT('cancel')}
                    onClose={() => {
                        setMobileEyeDropper(null);
                        // Restore color picker drawer if it was open
                        if (eyeDropperReopenRef.current) {
                            setColorPickerProp(eyeDropperReopenRef.current);
                            eyeDropperReopenRef.current = null;
                        }
                    }}
                />

                {/* Unified leave confirmation modal — simple yes/no question.
                    Behavior depends on whether the project is new (never synced) or existing:
                      - New project:     "Save this project?"   Yes=save&leave   No=delete&leave
                        For new projects the name input is shown inline so the user can
                        rename and save in one step (no separate rename modal).
                      - Existing project: "Save changes?"        Yes=save&leave   No=leave without saving */}
                <LeaveModal
                    isOpen={showLeaveModal}
                    onClose={() => setShowLeaveModal(false)}
                    wasSyncedBefore={wasSyncedBefore}
                    renameValue={renameValue}
                    onRenameChange={setRenameValue}
                    onNo={() => {
                        setShowLeaveModal(false);
                        doNoAndLeave();
                    }}
                    onYes={() => {
                        setShowLeaveModal(false);
                        // For a new project, pass the inline name so the
                        // first save uses the user's chosen name. For an
                        // existing project, just save the current state.
                        doSaveAndLeave(!wasSyncedBefore ? renameValue : undefined);
                    }}
                    labels={{
                        keepEditing: t('keepEditing'),
                        saveChangesTitle: t('saveChangesTitle'),
                        saveProjectTitle: t('saveProjectTitle'),
                        saveChangesDescription: t('saveChangesDescription'),
                        saveProjectDescription: t('saveProjectDescription'),
                        renameProjectPlaceholder: t('renameProjectPlaceholder'),
                        no: t('no'),
                        yes: t('yes'),
                    }}
                />
            </div>
        </DndProvider>
    );
}
