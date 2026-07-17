'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { useTranslations } from '@/lib/i18n/strings';

export interface ImageCropModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The original (uncropped) image URI */
  imageUri: string;
  naturalWidth: number;
  naturalHeight: number;
  onApply: (croppedUri: string, newWidth: number, newHeight: number) => void;
}

interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se' | null;

const MIN_CROP_SIZE = 20;

export default function ImageCropModal({
  isOpen,
  onClose,
  imageUri,
  naturalWidth,
  naturalHeight,
  onApply,
}: ImageCropModalProps) {
  const t = useTranslations('editor.modals.imageCrop');
  const uiT = useTranslations('ui');

  const imgRef = useRef<HTMLImageElement>(null);
  const cropRef = useRef<CropRect>({ x: 0, y: 0, width: 0, height: 0 });
  const dragModeRef = useRef<DragMode>(null);
  const moveOffsetRef = useRef<{ x: number; y: number } | null>(null);

  const [imgLoaded, setImgLoaded] = useState(false);
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });
  const [crop, setCrop] = useState<CropRect>({ x: 0, y: 0, width: 0, height: 0 });

  // Keep ref in sync for use in pointer handlers
  useEffect(() => {
    cropRef.current = crop;
  }, [crop]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setImgLoaded(false);
      setCrop({ x: 0, y: 0, width: 0, height: 0 });
      cropRef.current = { x: 0, y: 0, width: 0, height: 0 };
      dragModeRef.current = null;
      moveOffsetRef.current = null;
    }
  }, [isOpen]);

  const handleImageLoad = useCallback(() => {
    if (!imgRef.current) return;
    const img = imgRef.current;
    const w = img.offsetWidth;
    const h = img.offsetHeight;
    setDisplaySize({ width: w, height: h });
    const cropW = w * 0.8;
    const cropH = h * 0.8;
    const newCrop = {
      x: (w - cropW) / 2,
      y: (h - cropH) / 2,
      width: cropW,
      height: cropH,
    };
    setCrop(newCrop);
    cropRef.current = newCrop;
    setImgLoaded(true);
  }, []);

  const getRelativePos = (clientX: number, clientY: number) => {
    if (!imgRef.current) return { x: 0, y: 0 };
    const rect = imgRef.current.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(rect.width, clientX - rect.left)),
      y: Math.max(0, Math.min(rect.height, clientY - rect.top)),
    };
  };

  // --- Container pointer handler (for move mode) ---
  const handleContainerPointerDown = (e: React.PointerEvent) => {
    if (!imgLoaded) return;
    const pos = getRelativePos(e.clientX, e.clientY);
    const c = cropRef.current;

    // Check if clicking inside crop area → move mode
    if (pos.x >= c.x && pos.x <= c.x + c.width &&
      pos.y >= c.y && pos.y <= c.y + c.height) {
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      dragModeRef.current = 'move';
      moveOffsetRef.current = { x: pos.x - c.x, y: pos.y - c.y };
    }
  };

  const handleContainerPointerMove = (e: React.PointerEvent) => {
    if (!dragModeRef.current || dragModeRef.current !== 'move') return;
    e.preventDefault();

    const pos = getRelativePos(e.clientX, e.clientY);
    const rect = imgRef.current!.getBoundingClientRect();
    const c = cropRef.current;

    let newX = pos.x - moveOffsetRef.current!.x;
    let newY = pos.y - moveOffsetRef.current!.y;
    newX = Math.max(0, Math.min(newX, rect.width - c.width));
    newY = Math.max(0, Math.min(newY, rect.height - c.height));

    const newCrop = { ...c, x: newX, y: newY };
    cropRef.current = newCrop;
    setCrop(newCrop);
  };

  const handleContainerPointerUp = (e: React.PointerEvent) => {
    if (dragModeRef.current === 'move') {
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    }
    dragModeRef.current = null;
    moveOffsetRef.current = null;
  };

  // --- Corner handle pointer handlers (for resize) ---
  const handleCornerPointerDown = (e: React.PointerEvent, corner: 'nw' | 'ne' | 'sw' | 'se') => {
    if (!imgLoaded) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    dragModeRef.current = corner;
  };

  const handleCornerPointerMove = (e: React.PointerEvent) => {
    const mode = dragModeRef.current;
    if (!mode || mode === 'move' || !imgRef.current) return;
    e.preventDefault();

    const pos = getRelativePos(e.clientX, e.clientY);
    const rect = imgRef.current.getBoundingClientRect();
    const c = cropRef.current;

    let { x, y, width, height } = c;

    if (mode === 'nw') {
      const newRight = c.x + c.width;
      const newBottom = c.y + c.height;
      x = Math.max(0, Math.min(pos.x, newRight - MIN_CROP_SIZE));
      y = Math.max(0, Math.min(pos.y, newBottom - MIN_CROP_SIZE));
      width = newRight - x;
      height = newBottom - y;
    } else if (mode === 'ne') {
      const newBottom = c.y + c.height;
      y = Math.max(0, Math.min(pos.y, newBottom - MIN_CROP_SIZE));
      width = Math.max(MIN_CROP_SIZE, Math.min(pos.x - c.x, rect.width - c.x));
      height = newBottom - y;
    } else if (mode === 'sw') {
      const newRight = c.x + c.width;
      x = Math.max(0, Math.min(pos.x, newRight - MIN_CROP_SIZE));
      width = newRight - x;
      height = Math.max(MIN_CROP_SIZE, Math.min(pos.y - c.y, rect.height - c.y));
    } else if (mode === 'se') {
      width = Math.max(MIN_CROP_SIZE, Math.min(pos.x - c.x, rect.width - c.x));
      height = Math.max(MIN_CROP_SIZE, Math.min(pos.y - c.y, rect.height - c.y));
    }

    const newCrop = { x, y, width, height };
    cropRef.current = newCrop;
    setCrop(newCrop);
  };

  const handleCornerPointerUp = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    dragModeRef.current = null;
  };

  const applyCrop = () => {
    if (crop.width < 5 || crop.height < 5 || !imgRef.current) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const scaleX = naturalWidth / displaySize.width;
    const scaleY = naturalHeight / displaySize.height;

    const cropX = crop.x * scaleX;
    const cropY = crop.y * scaleY;
    const cropW = crop.width * scaleX;
    const cropH = crop.height * scaleY;

    canvas.width = Math.round(cropW);
    canvas.height = Math.round(cropH);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);
      const dataUri = canvas.toDataURL('image/png');
      onApply(dataUri, canvas.width, canvas.height);
      onClose();
    };
    img.src = imageUri;
  };

  const handleReset = () => {
    if (!imgLoaded) return;
    const w = displaySize.width;
    const h = displaySize.height;
    const cropW = w * 0.8;
    const cropH = h * 0.8;
    const newCrop = { x: (w - cropW) / 2, y: (h - cropH) / 2, width: cropW, height: cropH };
    setCrop(newCrop);
    cropRef.current = newCrop;
  };

  const corners: { corner: 'nw' | 'ne' | 'sw' | 'se'; x: number; y: number; cursor: string }[] = [
    { corner: 'nw', x: crop.x, y: crop.y, cursor: 'cursor-nwse-resize' },
    { corner: 'ne', x: crop.x + crop.width, y: crop.y, cursor: 'cursor-nesw-resize' },
    { corner: 'sw', x: crop.x, y: crop.y + crop.height, cursor: 'cursor-nesw-resize' },
    { corner: 'se', x: crop.x + crop.width, y: crop.y + crop.height, cursor: 'cursor-nwse-resize' },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('title')}
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{uiT('cancel')}</Button>
          <Button variant="ghost" onClick={handleReset}>{t('reset')}</Button>
          <Button
            variant="primary"
            onClick={applyCrop}
            disabled={!imgLoaded || crop.width < 5 || crop.height < 5}
          >
            {t('apply')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div
          className="relative flex select-none items-center justify-center overflow-hidden rounded-lg bg-black/90 touch-none"
          style={{ minHeight: '300px' }}
          onPointerDown={handleContainerPointerDown}
          onPointerMove={handleContainerPointerMove}
          onPointerUp={handleContainerPointerUp}
          onPointerCancel={handleContainerPointerUp}
        >
          <div className="relative inline-block">
            <img
              ref={imgRef}
              src={imageUri}
              alt="Crop preview"
              draggable={false}
              onLoad={handleImageLoad}
              className="max-h-[60vh] max-w-full select-none"
            />

            {imgLoaded && crop.width > 0 && crop.height > 0 && (
              <>
                {/* Dark overlay + crop border */}
                <div
                  className="pointer-events-none absolute border-2 border-brand-primary shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"
                  style={{ left: crop.x, top: crop.y, width: crop.width, height: crop.height }}
                />
                {/* Grid lines */}
                <div
                  className="pointer-events-none absolute"
                  style={{ left: crop.x, top: crop.y, width: crop.width, height: crop.height }}
                >
                  <div className="absolute left-1/3 top-0 h-full w-px bg-white/30" />
                  <div className="absolute left-2/3 top-0 h-full w-px bg-white/30" />
                  <div className="absolute top-1/3 h-px w-full bg-white/30" />
                  <div className="absolute top-2/3 h-px w-full bg-white/30" />
                </div>
                {/* Corner handles — draggable to resize */}
                {corners.map(({ corner, x, y, cursor }) => (
                  <div
                    key={corner}
                    className={`absolute h-4 w-4 rounded-full border-2 border-white bg-brand-primary shadow-lg ${cursor} touch-none`}
                    style={{ left: x - 8, top: y - 8 }}
                    onPointerDown={(e) => handleCornerPointerDown(e, corner)}
                    onPointerMove={handleCornerPointerMove}
                    onPointerUp={handleCornerPointerUp}
                    onPointerCancel={handleCornerPointerUp}
                  />
                ))}
              </>
            )}

            {!imgLoaded && (
              <div className="flex h-75 items-center justify-center">
                <div className="text-sm text-white/60">...</div>
              </div>
            )}
          </div>
        </div>

        {imgLoaded && (
          <p className="text-center text-sm text-secondary">{t('hint')}</p>
        )}
      </div>
    </Modal>
  );
}
