'use client';

import { useState, useRef, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from '@/lib/i18n/strings';
import { LuPlus, LuPalette, LuFileText, LuImage } from 'react-icons/lu';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import Drawer from '@/components/ui/Drawer';
import { useToast } from '@/components/providers/ToastProvider';
import { createProject } from '@/lib/query/projects';
import { ASPECT_RATIOS } from '@/lib/constants/presets';

/**
 * `/` shell — renders instantly and never waits on data. The two
 * data-driven sections arrive as streamed ReactNode slots, each behind
 * its own <Suspense> boundary in app/page.tsx, so a slow designs query
 * can't block the PDF section, the nav cards, or the create drawer
 * (and vice versa).
 */
export default function ProjectsPage({ designs, pdfs }: { designs?: ReactNode; pdfs?: ReactNode }) {
  const t = useTranslations('projects');
  const navT = useTranslations('navigation');
  const router = useRouter();
  const toast = useToast();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [customWidth, setCustomWidth] = useState('1080');
  const [customHeight, setCustomHeight] = useState('1080');
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

    // Upload the image to R2 and store the URL — never a base64 data
    // URI. A data URI in backgroundUri would live in the MongoDB doc and
    // get serialized into every list payload (megabytes per project).
    try {
      const form = new FormData();
      form.append('file', file);
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: form });
      if (!uploadRes.ok) throw new Error('upload_failed');
      const uploadJson = await uploadRes.json();
      const project = await createProject({
        name: `${t('custom')} — ${naturalWidth}×${naturalHeight}`,
        kind: 'design',
        canvasWidth: naturalWidth,
        canvasHeight: naturalHeight,
        backgroundUri: uploadJson.data.url,
      });
      setDrawerOpen(false);
      router.push(`/editor/d/${project.id}`);
    } catch (err) {
      console.error('Failed to create project from image:', err);
      toast.showToast({ message: t('createFailed'), variant: 'error' });
    }
    // Reset input so the same file can be picked again
    e.target.value = '';
  };

  const handleCreate = async (preset: typeof ASPECT_RATIOS[number]) => {
    const project = await createProject({
      name: `${preset.label} ${preset.name} — ${new Date().toLocaleDateString()}`,
      kind: 'design',
      canvasWidth: preset.width,
      canvasHeight: preset.height,
    });
    setDrawerOpen(false);
    router.push(`/editor/d/${project.id}`);
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
    router.push(`/editor/d/${project.id}`);
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

        {designs}

        {pdfs}

        <section>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
