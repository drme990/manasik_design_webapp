'use client';

import { useState, useRef, useCallback } from 'react';
import { useTranslations } from '@/lib/i18n/strings';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Card } from '@/components/ui/Card';
import AlertDialog from '@/components/ui/AlertDialog';
import {
    LuPlus,
    LuFileText,
    LuDownload,
    LuTrash2,
    LuArrowUp,
    LuArrowDown,
    LuX,
    LuLoader,
} from 'react-icons/lu';
import { PDFDocument } from 'pdf-lib';

interface PdfImage {
    id: string;
    uri: string;
    naturalWidth: number;
    naturalHeight: number;
}

export default function PdfToolPage() {
    const t = useTranslations('pdfTool');
    const uiT = useTranslations('ui');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [images, setImages] = useState<PdfImage[]>([]);
    const [generating, setGenerating] = useState(false);
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    const [confirmClear, setConfirmClear] = useState(false);

    const handleAddImages = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        const newImages: PdfImage[] = [];
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
        setPdfUrl(null);
    };

    const handleRemove = (id: string) => {
        setImages((prev) => prev.filter((img) => img.id !== id));
        setPdfUrl(null);
    };

    const handleMoveUp = (index: number) => {
        if (index === 0) return;
        setImages((prev) => {
            const next = [...prev];
            [next[index - 1], next[index]] = [next[index], next[index - 1]];
            return next;
        });
        setPdfUrl(null);
    };

    const handleMoveDown = (index: number) => {
        if (index === images.length - 1) return;
        setImages((prev) => {
            const next = [...prev];
            [next[index], next[index + 1]] = [next[index + 1], next[index]];
            return next;
        });
        setPdfUrl(null);
    };

    const handleClear = () => {
        setImages([]);
        setPdfUrl(null);
        setConfirmClear(false);
    };

    const handleGenerate = useCallback(async () => {
        if (images.length === 0) return;
        setGenerating(true);

        try {
            const pdfDoc = await PDFDocument.create();

            for (const img of images) {
                // Determine format from data URI
                const isPng = img.uri.startsWith('data:image/png');
                const isJpeg = img.uri.startsWith('data:image/jpeg') || img.uri.startsWith('data:image/jpg');

                // Convert data URI to bytes
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
                    // Default to JPG for other formats
                    embedded = await pdfDoc.embedJpg(bytes);
                }

                // A4 dimensions in points (1pt = 1/72 inch)
                // A4 = 210mm × 297mm = 595.28 × 841.89 points
                const pageWidth = 595.28;
                const pageHeight = 841.89;

                const page = pdfDoc.addPage([pageWidth, pageHeight]);

                // Fit image within page while preserving aspect ratio
                const imgAspect = img.naturalWidth / img.naturalHeight;
                const pageAspect = pageWidth / pageHeight;

                let drawWidth, drawHeight, x, y;

                if (imgAspect > pageAspect) {
                    // Image is wider — fit to page width
                    drawWidth = pageWidth;
                    drawHeight = pageWidth / imgAspect;
                    x = 0;
                    y = (pageHeight - drawHeight) / 2;
                } else {
                    // Image is taller — fit to page height
                    drawHeight = pageHeight;
                    drawWidth = pageHeight * imgAspect;
                    x = (pageWidth - drawWidth) / 2;
                    y = 0;
                }

                page.drawImage(embedded, {
                    x,
                    y,
                    width: drawWidth,
                    height: drawHeight,
                });
            }

            const pdfBytes = await pdfDoc.save();
            const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            setPdfUrl(url);
        } catch (err) {
            console.error('PDF generation failed:', err);
        } finally {
            setGenerating(false);
        }
    }, [images]);

    const handleDownload = () => {
        if (!pdfUrl) return;
        const a = document.createElement('a');
        a.href = pdfUrl;
        a.download = `manasik-pdf-${Date.now()}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    return (
        <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-4xl">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-foreground">{t('title')}</h1>
                    <p className="mt-1 text-secondary">{t('subtitle')}</p>
                </div>

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
                                variant="primary"
                                onClick={handleGenerate}
                                disabled={generating}
                                className="gap-2"
                            >
                                {generating ? (
                                    <LuLoader className="h-5 w-5 animate-spin" />
                                ) : (
                                    <LuFileText className="h-5 w-5" />
                                )}
                                {generating ? t('generating') : t('generate')}
                            </Button>

                            {pdfUrl && (
                                <Button
                                    variant="outline"
                                    onClick={handleDownload}
                                    className="gap-2"
                                >
                                    <LuDownload className="h-5 w-5" />
                                    {t('download')}
                                </Button>
                            )}

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

                {/* PDF preview iframe */}
                {pdfUrl && (
                    <div className="mb-6 overflow-hidden rounded-xl border border-stroke bg-card-bg">
                        <iframe
                            src={pdfUrl}
                            className="h-150 w-full"
                            title="PDF Preview"
                        />
                    </div>
                )}

                {/* Images list */}
                {images.length === 0 ? (
                    <EmptyState
                        title={t('empty')}
                        description={t('emptyHint')}
                    />
                ) : (
                    <div className="space-y-3">
                        {images.map((img, index) => (
                            <Card
                                key={img.id}
                                padding="none"
                                className="flex items-center gap-4 p-3"
                            >
                                {/* Page number */}
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-sm font-bold text-brand-primary">
                                    {index + 1}
                                </div>

                                {/* Thumbnail */}
                                <div className="h-20 w-28 shrink-0 overflow-hidden rounded-lg border border-stroke bg-muted">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={img.uri}
                                        alt={`${t('page')} ${index + 1}`}
                                        className="h-full w-full object-cover"
                                    />
                                </div>

                                {/* Info */}
                                <div className="flex-1 text-sm text-secondary">
                                    <p className="font-medium text-foreground">
                                        {t('page')} {index + 1}
                                    </p>
                                    <p className="text-xs">
                                        {img.naturalWidth} × {img.naturalHeight}
                                    </p>
                                </div>

                                {/* Controls */}
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => handleMoveUp(index)}
                                        disabled={index === 0}
                                        className="flex h-8 w-8 items-center justify-center rounded-lg text-secondary transition-colors hover:bg-muted disabled:opacity-30"
                                        aria-label={t('moveUp')}
                                    >
                                        <LuArrowUp className="h-4 w-4" />
                                    </button>
                                    <button
                                        onClick={() => handleMoveDown(index)}
                                        disabled={index === images.length - 1}
                                        className="flex h-8 w-8 items-center justify-center rounded-lg text-secondary transition-colors hover:bg-muted disabled:opacity-30"
                                        aria-label={t('moveDown')}
                                    >
                                        <LuArrowDown className="h-4 w-4" />
                                    </button>
                                    <button
                                        onClick={() => handleRemove(img.id)}
                                        className="flex h-8 w-8 items-center justify-center rounded-lg text-error transition-colors hover:bg-error/10"
                                        aria-label={t('remove')}
                                    >
                                        <LuX className="h-4 w-4" />
                                    </button>
                                </div>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            {/* Clear confirmation */}
            <AlertDialog
                isOpen={confirmClear}
                onClose={() => setConfirmClear(false)}
                title={t('clear')}
                description={t('confirmClear')}
                confirmLabel={uiT('confirm')}
                cancelLabel={uiT('cancel')}
                onConfirm={handleClear}
            />
        </main>
    );
}
