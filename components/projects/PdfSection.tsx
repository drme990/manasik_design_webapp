'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from '@/lib/i18n/strings';
import { LuPencil, LuTrash2, LuFileText, LuDownload, LuLoaderCircle } from 'react-icons/lu';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import AlertDialog from '@/components/ui/AlertDialog';
import { PdfCardsRowSkeleton } from '@/components/projects/SectionSkeleton';
import { fetchPdfProjects, deletePdfProject } from '@/lib/store/pdf-projects';
import { queryKeys } from '@/lib/query/client';
import type { PdfProject } from '@/types';

/**
 * Recent-PDF-projects section of `/` — one independently-streaming unit.
 * SSR-provided `initialProjects` seeds the shared `pdfProjectsList` query
 * so the first paint ships real cards; the same query key means
 * deletePdfProject's write-through updates this list automatically.
 */
export default function PdfSection({ initialProjects }: { initialProjects?: PdfProject[] }) {
  const t = useTranslations('projects');
  const uiT = useTranslations('ui');
  // Mount-captured so a partial/rendered seed gets a stable timestamp
  const [seededAt] = useState(() => Date.now());
  const { data: pdfData, isPending, isError, refetch } = useQuery({
    queryKey: queryKeys.pdfProjectsList,
    queryFn: fetchPdfProjects,
    initialData: initialProjects,
    initialDataUpdatedAt: initialProjects ? seededAt : undefined,
  });
  const pdfProjects = useMemo(
    () => [...(pdfData ?? [])].sort((a, b) => b.updatedAt - a.updatedAt),
    [pdfData],
  );
  const [deletePdfProjectId, setDeletePdfProjectId] = useState<string | null>(null);
  const [deletePdfLoading, setDeletePdfLoading] = useState(false);
  const [downloadingPdfId, setDownloadingPdfId] = useState<string | null>(null);

  const handleDeletePdfProject = async () => {
    if (!deletePdfProjectId) return;
    setDeletePdfLoading(true);
    // Removes the project from the shared query cache — the list
    // re-renders automatically, no manual state update needed.
    await deletePdfProject(deletePdfProjectId);
    setDeletePdfLoading(false);
    setDeletePdfProjectId(null);
  };

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
    <section className="mb-10">
      <h2 className="mb-4 text-lg font-semibold text-foreground">{t('recentPdfProjects')}</h2>
      {isPending && pdfProjects.length === 0 ? (
        <PdfCardsRowSkeleton />
      ) : isError && pdfProjects.length === 0 ? (
        <EmptyState
          title={uiT('loadFailed')}
          action={
            <Button variant="outline" onClick={() => refetch()}>
              {uiT('retry')}
            </Button>
          }
        />
      ) : pdfProjects.length === 0 ? (
        <EmptyState
          title={t('emptyPdfTitle')}
          description={t('emptyPdfDescription')}
        />
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none [scroll-snap-type:x_mandatory] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden">
          {pdfProjects.map((pdf, index) => (
            <div
              key={pdf.id}
              className="flex w-48 shrink-0 snap-start flex-col overflow-hidden sm:w-56"
            >
              {/* Preview — first image thumbnail */}
              <Link href={`/pdf-tool?id=${pdf.id}`} className="block shrink-0">
                <div className="relative aspect-4/3 w-full overflow-hidden bg-muted rounded-xl">
                  {pdf.images[0]?.uri ? (
                    /^https?:\/\//.test(pdf.images[0].thumbnailUri || pdf.images[0].uri) ? (
                      <Image
                        src={pdf.images[0].thumbnailUri || pdf.images[0].uri}
                        alt={pdf.name}
                        fill
                        sizes="(max-width: 640px) 192px, 224px"
                        className="object-cover"
                        priority={index < 6}
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={pdf.images[0].thumbnailUri || pdf.images[0].uri}
                        alt={pdf.name}
                        className="h-full w-full object-cover"
                      />
                    )
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
    </section>
  );
}
