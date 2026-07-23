'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useTranslations } from '@/lib/i18n/strings';
import { LuPlus, LuPencil, LuTrash2, LuPalette, LuFileText, LuCopy, LuImage, LuDownload, LuLoaderCircle } from 'react-icons/lu';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import Modal from '@/components/ui/Modal';
import Drawer from '@/components/ui/Drawer';
import AlertDialog from '@/components/ui/AlertDialog';
import ProjectCardPreview from '@/components/projects/ProjectCardPreview';
import { listProjects, createProject, deleteProject, renameProject, duplicateProject } from '@/lib/store/projects';
import { listPdfProjects, deletePdfProject, invalidatePdfListCache } from '@/lib/store/pdf-projects';
import { ASPECT_RATIOS } from '@/lib/constants/presets';
import type { Project, PdfProject } from '@/types';

export default function ProjectsPage() {
  const t = useTranslations('projects');
  const navT = useTranslations('navigation');
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [renameProjectId, setRenameProjectId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [customWidth, setCustomWidth] = useState('1080');
  const [customHeight, setCustomHeight] = useState('1080');
  const [pdfProjects, setPdfProjects] = useState<PdfProject[]>([]);
  const [deletePdfProjectId, setDeletePdfProjectId] = useState<string | null>(null);
  const [deletePdfLoading, setDeletePdfLoading] = useState(false);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

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
      // Create project with the image's aspect ratio and set it as background
      const project = await createProject({
        name: `${t('custom')} — ${naturalWidth}×${naturalHeight}`,
        kind: 'design',
        canvasWidth: naturalWidth,
        canvasHeight: naturalHeight,
        backgroundUri: dataUrl,
      });
      setDrawerOpen(false);
      window.location.href = `/editor/${project.id}`;
    };
    reader.readAsDataURL(file);
    // Reset input so the same file can be picked again
    e.target.value = '';
  };

  useEffect(() => {
    let cancelled = false;
    // Fetch projects from the API (single source of truth — no IndexedDB).
    // The in-memory cache in lib/store/projects.ts makes re-visits instant.
    listProjects().then((data) => {
      if (cancelled) return;
      const sorted = [...data].sort((a, b) => b.updatedAt - a.updatedAt);
      setProjects(sorted);
      setLoading(false);
    });
    listPdfProjects().then((data) => {
      if (cancelled) return;
      const sorted = [...data].sort((a, b) => b.updatedAt - a.updatedAt);
      setPdfProjects(sorted);
    });

    return () => { cancelled = true; };
  }, []);

  const handleCreate = async (preset: typeof ASPECT_RATIOS[number]) => {
    const project = await createProject({
      name: `${preset.label} ${preset.name} — ${new Date().toLocaleDateString()}`,
      kind: 'design',
      canvasWidth: preset.width,
      canvasHeight: preset.height,
    });
    setDrawerOpen(false);
    window.location.href = `/editor/${project.id}`;
  };

  const handleCreateCustom = async () => {
    const width = Number(customWidth);
    const height = Number(customHeight);
    if (width <= 0 || height <= 0) return;
    const project = await createProject({
      name: `${t('custom')} — ${width}×${height}`,
      kind: 'design',
      canvasWidth: width,
      canvasHeight: height,
    });
    setDrawerOpen(false);
    window.location.href = `/editor/${project.id}`;
  };

  const handleRename = async () => {
    if (!renameProjectId || !renameValue.trim()) return;
    await renameProject(renameProjectId, renameValue.trim());
    setProjects((prev) =>
      prev.map((p) => (p.id === renameProjectId ? { ...p, name: renameValue.trim() } : p))
    );
    setRenameProjectId(null);
  };

  const handleDelete = async () => {
    if (!deleteProjectId) return;
    setDeleteLoading(true);
    await deleteProject(deleteProjectId);
    setProjects((prev) => prev.filter((p) => p.id !== deleteProjectId));
    setDeleteLoading(false);
    setDeleteProjectId(null);
  };

  const handleDuplicate = async (projectId: string) => {
    const duplicated = await duplicateProject(projectId);
    if (duplicated) {
      setProjects((prev) => [duplicated, ...prev]);
    }
  };

  const handleDeletePdfProject = async () => {
    if (!deletePdfProjectId) return;
    setDeletePdfLoading(true);
    await deletePdfProject(deletePdfProjectId);
    setPdfProjects((prev) => prev.filter((p) => p.id !== deletePdfProjectId));
    invalidatePdfListCache();
    setDeletePdfLoading(false);
    setDeletePdfProjectId(null);
  };

  const [downloadingPdfId, setDownloadingPdfId] = useState<string | null>(null);

  const handleDownloadPdf = async (pdfId: string) => {
    const pdf = pdfProjects.find((p) => p.id === pdfId);
    if (!pdf || pdf.images.length === 0) return;
    setDownloadingPdfId(pdfId);
    try {
      const { PDFDocument } = await import('pdf-lib');
      const pdfDoc = await PDFDocument.create();
      for (const img of pdf.images) {
        let bytes: Uint8Array;
        let isPng: boolean;
        if (img.uri.startsWith('data:')) {
          isPng = img.uri.startsWith('data:image/png');
          const base64 = img.uri.split(',')[1];
          const byteChars = atob(base64);
          bytes = new Uint8Array(byteChars.length);
          for (let i = 0; i < byteChars.length; i++) {
            bytes[i] = byteChars.charCodeAt(i);
          }
        } else {
          // Route through same-origin proxy to avoid CORS errors on R2 URLs
          const resp = await fetch(`/api/image-proxy?url=${encodeURIComponent(img.uri)}`);
          if (!resp.ok) throw new Error(`Failed to fetch image: ${resp.status}`);
          bytes = new Uint8Array(await resp.arrayBuffer());
          isPng = img.uri.toLowerCase().endsWith('.png');
        }
        let embedded;
        if (isPng) {
          embedded = await pdfDoc.embedPng(bytes);
        } else {
          embedded = await pdfDoc.embedJpg(bytes);
        }
        const page = pdfDoc.addPage([img.naturalWidth, img.naturalHeight]);
        page.drawImage(embedded, { x: 0, y: 0, width: img.naturalWidth, height: img.naturalHeight });
      }
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${pdf.name || 'manasik-pdf'}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF download failed:', err);
    } finally {
      setDownloadingPdfId(null);
    }
  };

  return (
    <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">{t('title')}</h1>
            <p className="mt-1 text-secondary">{t('subtitle')}</p>
          </div>
        </div>

        <section className="mb-10">
          <h2 className="mb-4 text-lg font-semibold text-foreground">{t('recentDesigns')}</h2>
          {loading ? (
            <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none [scroll-snap-type:x_mandatory] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="flex w-48 shrink-0 snap-start flex-col overflow-hidden rounded-xl  sm:w-56"
                >
                  <div className="relative aspect-4/3 w-full overflow-hidden">
                    <div className="h-full w-full animate-pulse bg-muted" />
                  </div>
                  <div className="px-3 pt-2.5">
                    <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
                    <div className="mt-1.5 h-3 w-1/2 animate-pulse rounded bg-muted/70" />
                  </div>
                  <div className="flex w-full items-center gap-1 px-2.5 pb-2.5 pt-2">
                    <div className="h-8 w-8 animate-pulse rounded-lg bg-muted" />
                    <div className="h-8 w-8 animate-pulse rounded-lg bg-muted" />
                    <div className="h-8 w-8 animate-pulse rounded-lg bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : projects.length === 0 ? (
            <EmptyState
              title={t('emptyTitle')}
              description={t('emptyDescription')}
            />
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none [scroll-snap-type:x_mandatory] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="flex w-48 shrink-0 snap-start flex-col overflow-hidden sm:w-56"
                >
                  {/* Preview */}
                  <Link href={`/editor/${project.id}`} className="block shrink-0">
                    <div className="relative aspect-4/3 w-full overflow-hidden rounded-xl">
                      <ProjectCardPreview project={project} className="h-full w-full" />
                    </div>
                  </Link>
                  {/* Name + date */}
                  <Link href={`/editor/${project.id}`} className="block px-3 pt-2.5">
                    <p className="truncate text-sm font-semibold text-foreground">{project.name}</p>
                    <p className="mt-0.5 text-xs text-secondary">
                      {new Date(project.updatedAt).toLocaleDateString()}
                    </p>
                  </Link>
                  {/* Actions */}
                  <div className="flex w-full items-center gap-1 px-2.5 pb-2.5 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setRenameProjectId(project.id);
                        setRenameValue(project.name);
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-muted"
                      aria-label={t('rename')}
                    >
                      <LuPencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDuplicate(project.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-muted"
                      aria-label={t('duplicate')}
                    >
                      <LuCopy className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteProjectId(project.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-error transition-colors hover:bg-error/10"
                      aria-label={t('delete')}
                    >
                      <LuTrash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Recent PDF projects — always visible, shows empty state when none */}
        <section className="mb-10">
          <h2 className="mb-4 text-lg font-semibold text-foreground">{t('recentPdfProjects')}</h2>
          {pdfProjects.length === 0 ? (
            <EmptyState
              title={t('emptyPdfTitle')}
              description={t('emptyPdfDescription')}
            />
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none [scroll-snap-type:x_mandatory] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden">
              {pdfProjects.map((pdf) => (
                <div
                  key={pdf.id}
                  className="flex w-48 shrink-0 snap-start flex-col overflow-hidden sm:w-56"
                >
                  {/* Preview — first image thumbnail */}
                  <Link href={`/pdf-tool?id=${pdf.id}`} className="block shrink-0">
                    <div className="relative aspect-4/3 w-full overflow-hidden bg-muted rounded-xl">
                      {pdf.images[0]?.uri ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={pdf.images[0].thumbnailUri || pdf.images[0].uri}
                          alt={pdf.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <LuFileText className="h-10 w-10 text-secondary" />
                        </div>
                      )}
                      {/* Page count badge */}
                      {pdf.images.length > 1 && (
                        <div className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-xs font-medium text-white">
                          {pdf.images.length} {t('pages')}
                        </div>
                      )}
                    </div>
                  </Link>
                  {/* Name + date */}
                  <Link href={`/pdf-tool?id=${pdf.id}`} className="block px-3 pt-2.5">
                    <p className="truncate text-sm font-semibold text-foreground">{pdf.name}</p>
                    <p className="mt-0.5 text-xs text-secondary">
                      {new Date(pdf.updatedAt).toLocaleDateString()}
                    </p>
                  </Link>
                  {/* Actions */}
                  <div className="flex w-full items-center gap-1 px-2.5 pb-2.5 pt-2">
                    <Link
                      href={`/pdf-tool?id=${pdf.id}`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-muted"
                      aria-label={t('edit')}
                    >
                      <LuPencil className="h-4 w-4" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDownloadPdf(pdf.id)}
                      disabled={downloadingPdfId === pdf.id}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                      aria-label={t('download')}
                    >
                      {downloadingPdfId === pdf.id ? (
                        <LuLoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <LuDownload className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletePdfProjectId(pdf.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-error transition-colors hover:bg-error/10"
                      aria-label={t('delete')}
                    >
                      <LuTrash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-4 text-lg font-semibold text-foreground">{navT('templates')}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Link
              href="/templates"
              className="flex items-center gap-4 rounded-xl border border-stroke bg-card-bg p-4 transition-colors hover:border-brand-primary hover:bg-brand-primary-light/10"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
                <LuPalette className="h-6 w-6" />
              </div>
              <div>
                <p className="font-semibold text-foreground">{navT('templates')}</p>
                <p className="text-sm text-secondary">{t('subtitle')}</p>
              </div>
            </Link>
            <Link
              href="/pdf-tool"
              className="flex items-center gap-4 rounded-xl border border-stroke bg-card-bg p-4 transition-colors hover:border-brand-primary hover:bg-brand-primary-light/10"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
                <LuFileText className="h-6 w-6" />
              </div>
              <div>
                <p className="font-semibold text-foreground">{navT('pdfTool')}</p>
                <p className="text-sm text-secondary">{navT('pdfTool')}</p>
              </div>
            </Link>
          </div>
        </section>
      </div >

      <Modal
        isOpen={!!renameProjectId}
        onClose={() => setRenameProjectId(null)}
        title={t('renameTitle')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenameProjectId(null)}>
              {t('cancel')}
            </Button>
            <Button variant="primary" onClick={handleRename}>
              {t('save')}
            </Button>
          </>
        }
      >
        <Input
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          placeholder={t('renamePlaceholder')}
          autoFocus
        />
      </Modal>

      <AlertDialog
        isOpen={!!deleteProjectId}
        onClose={() => setDeleteProjectId(null)}
        onConfirm={handleDelete}
        title={t('deleteTitle')}
        description={t('deleteDescription')}
        confirmLabel={t('deleteConfirm')}
        cancelLabel={t('cancel')}
        loading={deleteLoading}
        variant="danger"
      />

      <AlertDialog
        isOpen={!!deletePdfProjectId}
        onClose={() => setDeletePdfProjectId(null)}
        onConfirm={handleDeletePdfProject}
        title={t('deleteTitle')}
        description={t('deleteDescription')}
        confirmLabel={t('deleteConfirm')}
        cancelLabel={t('cancel')}
        loading={deletePdfLoading}
        variant="danger"
      />

      {/* Floating + button */}
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        className="fixed bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-brand-primary text-primary-text shadow-xl transition-transform hover:scale-105 active:scale-95"
        aria-label={t('newProject')}
      >
        <LuPlus className="h-7 w-7" />
      </button>

      {/* New project drawer */}
      <Drawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={t('newProject')}
        height="twoThirds"
        footer={
          <Button variant="primary" onClick={handleCreateCustom} className="w-full">
            <LuPlus className="ms-2 h-5 w-5" />
            {t('create')}
          </Button>
        }
      >
        {/* Pick from gallery — creates a project with the image's aspect ratio */}
        <div className="mb-6">
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            onChange={handlePickGalleryImage}
            className="hidden"
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
          <h3 className="mb-3 text-sm font-medium text-secondary">{t('newProject')}</h3>
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
                  {/* Shape preview */}
                  <div className="flex h-12 items-center justify-center">
                    <div
                      className="rounded border-2 border-foreground/40 bg-foreground/5"
                      style={{ width: boxW, height: boxH }}
                    />
                  </div>
                  {/* Aspect ratio */}
                  <p className="text-xs font-semibold text-foreground">{preset.label}</p>
                  {/* Name */}
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

    </main >
  );
}
