'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from '@/lib/i18n/strings';
import { LuPlus, LuPencil, LuTrash2, LuImage, LuBoxes, LuArrowLeft, LuCopy } from 'react-icons/lu';
import { LuSmartphone } from 'react-icons/lu';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import Drawer from '@/components/ui/Drawer';
import Modal from '@/components/ui/Modal';
import AlertDialog from '@/components/ui/AlertDialog';
import ProjectCardPreview from '@/components/projects/ProjectCardPreview';
import { useProjectStore } from '@/lib/store/use-project-store';
import { listBookingProducts } from '@/lib/store/booking-templates';
import { ASPECT_RATIOS } from '@/lib/constants/presets';
import ConnectProductsModal from '@/components/templates/ConnectProductsModal';
import type { BookingProduct, Project, TemplateApp } from '@/types';

type TabId = 'text' | 'image';
type AppFilter = 'all' | TemplateApp;

const STORAGE_KEY = 'templates-filters';

interface PersistedFilters {
    tab: TabId;
    app: AppFilter;
}

function loadPersistedFilters(): PersistedFilters {
    if (typeof window === 'undefined') return { tab: 'text', app: 'all' };
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { tab: 'text', app: 'all' };
        const parsed = JSON.parse(raw) as Partial<PersistedFilters>;
        return {
            tab: parsed.tab === 'image' ? 'image' : 'text',
            app: parsed.app === 'manasik' || parsed.app === 'ghadaq' ? parsed.app : 'all',
        };
    } catch {
        return { tab: 'text', app: 'all' };
    }
}

function persistFilters(filters: PersistedFilters) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
    } catch {
        // ignore quota / privacy mode errors
    }
}

export default function TemplatesPage() {
    const t = useTranslations('templates');
    const router = useRouter();
    const uiT = useTranslations('ui');
    // Subscribe to the zustand store — templates list is always in sync
    const templates = useProjectStore((s) => s.templates);
    const templatesLoading = useProjectStore((s) => s.templatesLoading);
    const fetchTemplates = useProjectStore((s) => s.fetchTemplates);
    const storeCreateProject = useProjectStore((s) => s.createProject);
    const storeDeleteProject = useProjectStore((s) => s.deleteProject);
    const storeUpdateProjectRemote = useProjectStore((s) => s.updateProjectRemote);
    const storeDuplicateTemplateToApp = useProjectStore((s) => s.duplicateTemplateToApp);
    // loading is true only on the very first fetch (no data yet)
    const loading = templatesLoading && templates.length === 0;
    const [bookingProducts, setBookingProducts] = useState<BookingProduct[]>([]);
    const [drawerOpen, setDrawerOpen] = useState(false);
    // Which tab the create drawer is targeting — set when the + button is
    // clicked so the created template gets the right templateType.
    const [drawerTab, setDrawerTab] = useState<TabId>('text');
    // Which app the created template is for — manasik or ghadaq.
    const [drawerApp, setDrawerApp] = useState<TemplateApp>('manasik');
    // Persisted filters — restored from localStorage on mount
    const [initialFilters] = useState(loadPersistedFilters);
    const [activeTab, setActiveTab] = useState<TabId>(initialFilters.tab);
    const [appFilter, setAppFilter] = useState<AppFilter>(initialFilters.app);
    const [customWidth, setCustomWidth] = useState('1080');
    const [customHeight, setCustomHeight] = useState('1080');
    const [deleteTemplateId, setDeleteTemplateId] = useState<string | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [connectModalTemplate, setConnectModalTemplate] = useState<Project | null>(null);
    const galleryInputRef = useRef<HTMLInputElement>(null);
    // Properties edit modal state
    const [editPropsTemplate, setEditPropsTemplate] = useState<Project | null>(null);
    const [editPropsName, setEditPropsName] = useState('');
    const [editPropsApp, setEditPropsApp] = useState<TemplateApp>('manasik');
    const [editPropsLoading, setEditPropsLoading] = useState(false);
    // Copy to app state
    const [copyingTemplateId, setCopyingTemplateId] = useState<string | null>(null);

    // Split templates by templateType. Legacy templates (undefined) are
    // treated as 'text' — the more restrictive option — so they show up in
    // the text tab and never expose image dynamic fields.
    // Also filter by appSource when an app filter is selected.
    const textTemplates = useMemo(
        () => templates.filter((tpl) =>
            (tpl.templateType ?? 'text') === 'text' &&
            (appFilter === 'all' || (tpl.appSource ?? 'manasik') === appFilter),
        ),
        [templates, appFilter],
    );
    const imageTemplates = useMemo(
        () => templates.filter((tpl) =>
            tpl.templateType === 'image' &&
            (appFilter === 'all' || (tpl.appSource ?? 'manasik') === appFilter),
        ),
        [templates, appFilter],
    );

    const handlePickGalleryImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        // Read the image to get its natural dimensions
        const img = new Image();
        const url = URL.createObjectURL(file);
        await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = reject;
            img.src = url;
        });
        const naturalWidth = img.naturalWidth;
        const naturalHeight = img.naturalHeight;
        URL.revokeObjectURL(url);

        // Convert to data URL for the background
        const reader = new FileReader();
        reader.onload = async (event) => {
            const dataUrl = event.target?.result as string;
            // Create template with the image's aspect ratio and set it as background
            const project = await storeCreateProject({
                name: `${t('newTemplate')} — ${naturalWidth}×${naturalHeight}`,
                kind: 'booking_template',
                canvasWidth: naturalWidth,
                canvasHeight: naturalHeight,
                backgroundUri: dataUrl,
                templateType: drawerTab,
                appSource: drawerApp,
            });
            setDrawerOpen(false);
            router.push(`/editor/t/${project.id}`);
        };
        reader.readAsDataURL(file);
        // Reset input so the same file can be picked again
        e.target.value = '';
    };

    useEffect(() => {
        const load = async () => {
            fetchTemplates();
            const products = await listBookingProducts();
            setBookingProducts(products);
        };
        load();
    }, [fetchTemplates]);

    // Persist filters to localStorage whenever they change
    useEffect(() => {
        persistFilters({ tab: activeTab, app: appFilter });
    }, [activeTab, appFilter]);

    // Count how many products are assigned to a template (in either slot)
    const getProductCount = (templateId: string): number =>
        bookingProducts.filter(
            (bp) =>
                bp.templateId === templateId ||
                bp.imageTemplateId === templateId ||
                bp.ghadaqTemplateId === templateId ||
                bp.ghadaqImageTemplateId === templateId,
        ).length;

    const handleCreate = async (preset: typeof ASPECT_RATIOS[number]) => {
        const project = await storeCreateProject({
            name: `${preset.label} ${preset.name} — ${new Date().toLocaleDateString()}`,
            kind: 'booking_template',
            canvasWidth: preset.width,
            canvasHeight: preset.height,
            templateType: drawerTab,
            appSource: drawerApp,
        });
        setDrawerOpen(false);
        router.push(`/editor/t/${project.id}`);
    };

    const handleCreateCustom = async () => {
        const width = Number(customWidth);
        const height = Number(customHeight);
        if (width <= 0 || height <= 0) return;
        const project = await storeCreateProject({
            name: `${t('newTemplate')} — ${width}×${height}`,
            kind: 'booking_template',
            canvasWidth: width,
            canvasHeight: height,
            templateType: drawerTab,
            appSource: drawerApp,
        });
        setDrawerOpen(false);
        router.push(`/editor/t/${project.id}`);
    };

    const handleDelete = async () => {
        if (!deleteTemplateId) return;
        setDeleteLoading(true);
        try {
            await storeDeleteProject(deleteTemplateId);
            // Optimistically disconnect this template from all booking
            // products in the local state. The server-side DELETE handler
            // also does this, but we update locally for instant UI feedback.
            setBookingProducts((prev) =>
                prev.map((bp) =>
                    bp.templateId === deleteTemplateId ||
                        bp.imageTemplateId === deleteTemplateId ||
                        bp.ghadaqTemplateId === deleteTemplateId ||
                        bp.ghadaqImageTemplateId === deleteTemplateId
                        ? {
                            ...bp,
                            templateId: bp.templateId === deleteTemplateId ? null : bp.templateId,
                            imageTemplateId: bp.imageTemplateId === deleteTemplateId ? null : bp.imageTemplateId,
                            ghadaqTemplateId: bp.ghadaqTemplateId === deleteTemplateId ? null : bp.ghadaqTemplateId,
                            ghadaqImageTemplateId: bp.ghadaqImageTemplateId === deleteTemplateId ? null : bp.ghadaqImageTemplateId,
                        }
                        : bp,
                ),
            );
        } catch (err) {
            console.error('Failed to delete template:', err);
        }
        setDeleteLoading(false);
        setDeleteTemplateId(null);
    };

    // Open the create drawer for a specific tab
    const openCreateDrawer = (tab: TabId) => {
        setDrawerTab(tab);
        setDrawerApp('manasik');
        setDrawerOpen(true);
    };

    // ── Properties edit handlers ───────────────────────────────────────
    const openEditProps = (template: Project) => {
        setEditPropsTemplate(template);
        setEditPropsName(template.name);
        setEditPropsApp(template.appSource ?? 'manasik');
    };

    const handleSaveProps = async () => {
        if (!editPropsTemplate) return;
        const trimmed = editPropsName.trim();
        if (!trimmed) return;
        setEditPropsLoading(true);
        try {
            await storeUpdateProjectRemote(editPropsTemplate.id, {
                name: trimmed,
                appSource: editPropsApp,
            });
            setEditPropsTemplate(null);
        } catch (err) {
            console.error('Failed to update template properties:', err);
        } finally {
            setEditPropsLoading(false);
        }
    };

    // ── Copy to another app handler ────────────────────────────────────
    const handleCopyToApp = async (template: Project, targetApp: TemplateApp) => {
        setCopyingTemplateId(template.id);
        try {
            await storeDuplicateTemplateToApp(template.id, targetApp);
            // Refresh booking products so product counts reflect the
            // newly copied connections
            const products = await listBookingProducts();
            setBookingProducts(products);
        } catch (err) {
            console.error('Failed to copy template:', err);
        } finally {
            setCopyingTemplateId(null);
        }
    };

    // ── Template card grid ──────────────────────────────────────────────
    const renderTemplateGrid = (list: Project[]) => {
        if (list.length === 0) return null;
        return (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((template) => {
                    const productCount = getProductCount(template.id);
                    return (
                        <div
                            key={template.id}
                            className="group relative flex flex-col overflow-hidden rounded-2xl border border-stroke bg-card-bg p-0 shadow-sm transition-shadow hover:shadow-md hover:border-brand-primary"
                        >
                            {/* Preview — click opens editor */}
                            <Link
                                href={`/editor/t/${template.id}`}
                                className="block"
                            >
                                <div
                                    className="relative w-full overflow-hidden bg-muted"
                                    style={{
                                        aspectRatio: `${template.canvasWidth} / ${template.canvasHeight}`,
                                        backgroundColor: template.backgroundColor ?? '#ffffff',
                                    }}
                                >
                                    <ProjectCardPreview project={template} className="h-full w-full" />
                                </div>
                            </Link>

                            {/* Info + actions */}
                            <div className="flex flex-1 flex-col p-4">
                                <h3 className="mb-1 line-clamp-1 text-lg font-semibold text-foreground">
                                    {template.name}
                                </h3>
                                <div className="mb-3 flex items-center gap-1.5 text-sm text-secondary">
                                    <LuBoxes className="h-4 w-4" />
                                    {productCount > 0
                                        ? t('assignedProductsCount').replace('{count}', String(productCount))
                                        : t('noProductsAssigned')}
                                </div>

                                {/* App badge — manasik or ghadaq */}
                                <div className="mb-3 flex items-center gap-1.5">
                                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${(template.appSource ?? 'manasik') === 'ghadaq'
                                        ? 'bg-purple-100 text-purple-700'
                                        : 'bg-blue-100 text-blue-700'
                                        }`}>
                                        <LuSmartphone className="h-3 w-3" />
                                        {(template.appSource ?? 'manasik') === 'ghadaq'
                                            ? t('appGhadaq')
                                            : t('appManasik')}
                                    </span>
                                </div>

                                <div className="mt-auto flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setConnectModalTemplate(template)}
                                        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-stroke px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-brand-primary hover:bg-brand-primary-light/10"
                                    >
                                        <LuBoxes className="h-4 w-4" />
                                        {t('assignProducts')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => openEditProps(template)}
                                        className="flex items-center justify-center rounded-lg border border-stroke p-2 text-foreground transition-colors hover:border-brand-primary hover:bg-brand-primary-light/10"
                                        aria-label={t('editProperties')}
                                        title={t('editProperties')}
                                    >
                                        <LuPencil className="h-4 w-4" />
                                    </button>
                                    {/* Copy to the other app — only show if the template
                                        is for one app (not both/undefined). Copies to the
                                        opposite app. */}
                                    {(template.appSource ?? 'manasik') === 'manasik' && (
                                        <button
                                            type="button"
                                            onClick={() => handleCopyToApp(template, 'ghadaq')}
                                            disabled={copyingTemplateId === template.id}
                                            className="flex items-center justify-center rounded-lg border border-stroke p-2 text-purple-600 transition-colors hover:border-purple-400 hover:bg-purple-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                            aria-label={t('copyToGhadaq')}
                                            title={t('copyToGhadaq')}
                                        >
                                            {copyingTemplateId === template.id
                                                ? <span className="text-xs">...</span>
                                                : <LuCopy className="h-4 w-4" />}
                                        </button>
                                    )}
                                    {(template.appSource ?? 'manasik') === 'ghadaq' && (
                                        <button
                                            type="button"
                                            onClick={() => handleCopyToApp(template, 'manasik')}
                                            disabled={copyingTemplateId === template.id}
                                            className="flex items-center justify-center rounded-lg border border-stroke p-2 text-blue-600 transition-colors hover:border-blue-400 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                            aria-label={t('copyToManasik')}
                                            title={t('copyToManasik')}
                                        >
                                            {copyingTemplateId === template.id
                                                ? <span className="text-xs">...</span>
                                                : <LuCopy className="h-4 w-4" />}
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => setDeleteTemplateId(template.id)}
                                        className="flex items-center justify-center rounded-lg border border-stroke p-2 text-error transition-colors hover:border-error hover:bg-error/10"
                                        aria-label={t('delete')}
                                    >
                                        <LuTrash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    // ── Skeleton grid (shown during initial load) ───────────────────────
    const renderSkeletons = () => (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
                <div
                    key={i}
                    className="flex flex-col overflow-hidden rounded-2xl border border-stroke bg-card-bg p-0 shadow-sm"
                >
                    <div className="aspect-square w-full animate-pulse bg-muted" />
                    <div className="p-4">
                        <div className="mb-2 h-5 w-2/3 animate-pulse rounded bg-muted" />
                        <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
                    </div>
                </div>
            ))}
        </div>
    );

    // ── Create drawer (shared by both tabs — targets drawerTab) ─────────
    const renderCreateDrawer = () => (
        <Drawer
            isOpen={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            title={t('newTemplate')}
            height="twoThirds"
            footer={
                <Button variant="primary" onClick={handleCreateCustom} className="w-full">
                    <LuPlus className="ms-2 h-5 w-5" />
                    {t('create')}
                </Button>
            }
        >
            {/* App selector — manasik or ghadaq */}
            <div className="mb-6">
                <h3 className="mb-3 text-sm font-medium text-secondary">{t('selectApp')}</h3>
                <div className="grid grid-cols-2 gap-3">
                    <button
                        type="button"
                        onClick={() => setDrawerApp('manasik')}
                        className={`flex items-center justify-center gap-2 rounded-xl border-2 px-4 py-3 text-sm font-medium transition-colors ${drawerApp === 'manasik'
                            ? 'border-brand-primary bg-brand-primary-light/10 text-brand-primary'
                            : 'border-stroke bg-card-bg text-foreground hover:border-brand-primary'
                            }`}
                    >
                        <LuSmartphone className="h-4 w-4" />
                        {t('appManasik')}
                    </button>
                    <button
                        type="button"
                        onClick={() => setDrawerApp('ghadaq')}
                        className={`flex items-center justify-center gap-2 rounded-xl border-2 px-4 py-3 text-sm font-medium transition-colors ${drawerApp === 'ghadaq'
                            ? 'border-brand-primary bg-brand-primary-light/10 text-brand-primary'
                            : 'border-stroke bg-card-bg text-foreground hover:border-brand-primary'
                            }`}
                    >
                        <LuSmartphone className="h-4 w-4" />
                        {t('appGhadaq')}
                    </button>
                </div>
            </div>

            {/* Pick from gallery — creates a template with the image's aspect ratio */}
            <div className="mb-6">
                <input
                    ref={galleryInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePickGalleryImage}
                />
                <button
                    type="button"
                    onClick={() => galleryInputRef.current?.click()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-stroke bg-card-bg px-4 py-4 text-sm font-medium text-foreground transition-colors hover:border-brand-primary hover:bg-brand-primary-light/10"
                >
                    <LuImage className="h-5 w-5 text-brand-primary" />
                    {t('pickFromGallery')}
                </button>
            </div>

            {/* Preset sizes — horizontal scroll */}
            <div className="mb-6">
                <h3 className="mb-3 text-sm font-medium text-secondary">{t('newTemplate')}</h3>
                <div className="no-scrollbar flex gap-3 overflow-x-auto pb-2">
                    {ASPECT_RATIOS.map((preset) => {
                        const ratio = preset.width / preset.height;
                        const boxW = ratio >= 1 ? 48 : Math.round(48 * ratio);
                        const boxH = ratio >= 1 ? Math.round(48 / ratio) : 48;
                        return (
                            <button
                                key={preset.label}
                                onClick={() => handleCreate(preset)}
                                className="flex w-20 shrink-0 flex-col items-center gap-2 rounded-xl border border-stroke bg-card-bg p-3 text-center transition-colors hover:border-brand-primary hover:bg-brand-primary-light/10"
                            >
                                <div className="flex h-12 items-center justify-center">
                                    <div
                                        className="rounded border-2 border-foreground/40 bg-foreground/5"
                                        style={{ width: boxW, height: boxH }}
                                    />
                                </div>
                                <p className="text-xs font-semibold text-foreground">{preset.label}</p>
                                <p className="text-xs text-secondary">{preset.name}</p>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Custom size */}
            <div>
                <h3 className="mb-3 text-sm font-medium text-secondary">{t('customSize')}</h3>
                <div className="grid grid-cols-2 gap-4">
                    <Input
                        label={t('width')}
                        type="text"
                        inputMode="numeric"
                        value={customWidth}
                        onChange={(e) => setCustomWidth(e.target.value)}
                    />
                    <Input
                        label={t('height')}
                        type="text"
                        inputMode="numeric"
                        value={customHeight}
                        onChange={(e) => setCustomHeight(e.target.value)}
                    />
                </div>
            </div>
        </Drawer>
    );

    return (
        <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-6xl">
                <div className="mb-8">
                    <div className="mb-3 flex items-center gap-3">
                        <Link
                            href="/"
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-stroke bg-card-bg text-foreground transition-colors hover:bg-muted"
                            aria-label={uiT('back')}
                        >
                            <LuArrowLeft className="h-5 w-5 rtl:rotate-180" />
                        </Link>
                        <h1 className="text-3xl font-bold text-foreground">{t('title')}</h1>
                    </div>
                    <p className="mt-1 text-secondary">{t('subtitle')}</p>
                </div>

                {/* App filter — same tab style as the type filter below */}
                <div className="mb-2 flex gap-1 border-b border-stroke">
                    <button
                        onClick={() => setAppFilter('all')}
                        className={`relative px-4 py-3 text-sm font-medium transition-colors ${appFilter === 'all'
                            ? 'text-brand-primary'
                            : 'text-secondary hover:text-foreground'
                            }`}
                    >
                        {t('filterAll')}
                        {appFilter === 'all' && (
                            <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full bg-brand-primary" />
                        )}
                    </button>
                    <button
                        onClick={() => setAppFilter('manasik')}
                        className={`relative inline-flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors ${appFilter === 'manasik'
                            ? 'text-brand-primary'
                            : 'text-secondary hover:text-foreground'
                            }`}
                    >
                        <LuSmartphone className="h-4 w-4" />
                        {t('appManasik')}
                        {appFilter === 'manasik' && (
                            <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full bg-brand-primary" />
                        )}
                    </button>
                    <button
                        onClick={() => setAppFilter('ghadaq')}
                        className={`relative inline-flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors ${appFilter === 'ghadaq'
                            ? 'text-brand-primary'
                            : 'text-secondary hover:text-foreground'
                            }`}
                    >
                        <LuSmartphone className="h-4 w-4" />
                        {t('appGhadaq')}
                        {appFilter === 'ghadaq' && (
                            <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full bg-brand-primary" />
                        )}
                    </button>
                </div>

                {/* Type tabs — text templates vs image templates */}
                <div className="mb-6 flex gap-1 border-b border-stroke">
                    <button
                        onClick={() => setActiveTab('text')}
                        className={`relative px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'text'
                            ? 'text-brand-primary'
                            : 'text-secondary hover:text-foreground'
                            }`}
                    >
                        {t('tabText')}
                        {activeTab === 'text' && (
                            <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full bg-brand-primary" />
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('image')}
                        className={`relative px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'image'
                            ? 'text-brand-primary'
                            : 'text-secondary hover:text-foreground'
                            }`}
                    >
                        {t('tabImage')}
                        {activeTab === 'image' && (
                            <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full bg-brand-primary" />
                        )}
                    </button>
                </div>

                {loading ? (
                    renderSkeletons()
                ) : activeTab === 'text' ? (
                    textTemplates.length === 0 ? (
                        <EmptyState
                            title={t('emptyTextTemplates')}
                            description={t('emptyTextTemplatesDesc')}
                        />
                    ) : (
                        renderTemplateGrid(textTemplates)
                    )
                ) : imageTemplates.length === 0 ? (
                    <EmptyState
                        title={t('emptyImageTemplates')}
                        description={t('emptyImageTemplatesDesc')}
                    />
                ) : (
                    renderTemplateGrid(imageTemplates)
                )}
            </div>

            {/* Floating + button — creates a template for the active tab */}
            <button
                type="button"
                onClick={() => openCreateDrawer(activeTab)}
                className="fixed bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-brand-primary text-primary-text shadow-xl transition-transform hover:scale-105 active:scale-95"
                aria-label={t('newTemplate')}
            >
                <LuPlus className="h-7 w-7" />
            </button>

            {renderCreateDrawer()}

            {/* Delete confirmation */}
            <AlertDialog
                isOpen={!!deleteTemplateId}
                onClose={() => setDeleteTemplateId(null)}
                title={t('deleteTitle')}
                description={t('deleteDescription')}
                confirmLabel={t('delete')}
                cancelLabel={t('cancel')}
                onConfirm={handleDelete}
                loading={deleteLoading}
                variant="danger"
            />

            {/* Connect products modal */}
            <ConnectProductsModal
                isOpen={!!connectModalTemplate}
                onClose={() => setConnectModalTemplate(null)}
                template={connectModalTemplate}
                onSaved={(refreshed) => setBookingProducts(refreshed)}
            />

            {/* Edit properties modal (name + app) */}
            <Modal
                isOpen={!!editPropsTemplate}
                onClose={() => setEditPropsTemplate(null)}
                title={t('editProperties')}
            >
                {editPropsTemplate && (
                    <div className="space-y-5">
                        {/* Template name */}
                        <div>
                            <label className="mb-1.5 block text-sm font-medium text-secondary">
                                {t('templateName')}
                            </label>
                            <Input
                                type="text"
                                value={editPropsName}
                                onChange={(e) => setEditPropsName(e.target.value)}
                                autoFocus
                            />
                        </div>

                        {/* App selector */}
                        <div>
                            <label className="mb-2 block text-sm font-medium text-secondary">
                                {t('templateApp')}
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={() => setEditPropsApp('manasik')}
                                    className={`flex items-center justify-center gap-2 rounded-xl border-2 px-4 py-3 text-sm font-medium transition-colors ${editPropsApp === 'manasik'
                                        ? 'border-brand-primary bg-brand-primary-light/10 text-brand-primary'
                                        : 'border-stroke bg-card-bg text-foreground hover:border-brand-primary'
                                        }`}
                                >
                                    <LuSmartphone className="h-4 w-4" />
                                    {t('appManasik')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setEditPropsApp('ghadaq')}
                                    className={`flex items-center justify-center gap-2 rounded-xl border-2 px-4 py-3 text-sm font-medium transition-colors ${editPropsApp === 'ghadaq'
                                        ? 'border-brand-primary bg-brand-primary-light/10 text-brand-primary'
                                        : 'border-stroke bg-card-bg text-foreground hover:border-brand-primary'
                                        }`}
                                >
                                    <LuSmartphone className="h-4 w-4" />
                                    {t('appGhadaq')}
                                </button>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex justify-end gap-3 pt-2">
                            <Button
                                variant="ghost"
                                onClick={() => setEditPropsTemplate(null)}
                            >
                                {t('cancel')}
                            </Button>
                            <Button
                                variant="primary"
                                onClick={handleSaveProps}
                                loading={editPropsLoading}
                                disabled={!editPropsName.trim()}
                            >
                                {t('saveProperties')}
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>
        </main>
    );
}
