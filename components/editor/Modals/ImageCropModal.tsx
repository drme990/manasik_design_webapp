'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { cn } from '@/lib/utils/cn';
import { useTranslations } from '@/lib/i18n/strings';
import { LuCrop, LuRotateCw } from 'react-icons/lu';

export interface ImageCropModalProps {
  isOpen: boolean;
  onClose: () => void;
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

const ASPECT_RATIOS: { label: string; value: number | null }[] = [
  { label: 'Free', value: null },
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:4', value: 3 / 4 },
  { label: '16:9', value: 16 / 9 },
  { label: '9:16', value: 9 / 16 },
];

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

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const [imgLoaded, setImgLoaded] = useState(false);
  const [displaySize, setDisplaySize] = useState({ width: 0, height: 0 });
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragMode, setDragMode] = useState<'create' | 'move' | null>(null);
  const [moveOffset, setMoveOffset] = useState<{ x: number; y: number } | null>(null);
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  const [rotation, setRotation] = useState(0);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setCrop(null);
      setDragStart(null);
      setDragMode(null);
      setMoveOffset(null);
      setAspectRatio(null);
      setRotation(0);
      setImgLoaded(false);
    }
  }, [isOpen]);

  // Calculate display size that fits in the modal
  const handleImageLoad = useCallback(() => {
    if (!imgRef.current) return;
    const img = imgRef.current;
    setDisplaySize({ width: img.offsetWidth, height: img.offsetHeight });
    setImgLoaded(true);
  }, []);

  const getRelativePos = (e: React.MouseEvent | React.TouchEvent) => {
    if (!imgRef.current) return { x: 0, y: 0 };
    const rect = imgRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    return {
      x: Math.max(0, Math.min(rect.width, clientX - rect.left)),
      y: Math.max(0, Math.min(rect.height, clientY - rect.top)),
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const pos = getRelativePos(e);

    // Check if clicking inside existing crop (move mode)
    if (crop && pos.x >= crop.x && pos.x <= crop.x + crop.width &&
      pos.y >= crop.y && pos.y <= crop.y + crop.height) {
      setDragMode('move');
      setMoveOffset({ x: pos.x - crop.x, y: pos.y - crop.y });
    } else {
      setDragMode('create');
      setDragStart(pos);
      setCrop({ x: pos.x, y: pos.y, width: 0, height: 0 });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragMode || !imgRef.current) return;
    e.preventDefault();
    const pos = getRelativePos(e);
    const rect = imgRef.current.getBoundingClientRect();

    if (dragMode === 'create' && dragStart) {
      let newCrop = {
        x: Math.min(dragStart.x, pos.x),
        y: Math.min(dragStart.y, pos.y),
        width: Math.abs(pos.x - dragStart.x),
        height: Math.abs(pos.y - dragStart.y),
      };

      // Apply aspect ratio constraint
      if (aspectRatio) {
        if (newCrop.width / aspectRatio > newCrop.height) {
          newCrop.height = newCrop.width / aspectRatio;
        } else {
          newCrop.width = newCrop.height * aspectRatio;
        }
      }

      // Clamp to image bounds
      newCrop.x = Math.max(0, Math.min(newCrop.x, rect.width - newCrop.width));
      newCrop.y = Math.max(0, Math.min(newCrop.y, rect.height - newCrop.height));
      newCrop.width = Math.min(newCrop.width, rect.width - newCrop.x);
      newCrop.height = Math.min(newCrop.height, rect.height - newCrop.y);

      setCrop(newCrop);
    } else if (dragMode === 'move' && crop && moveOffset) {
      let newX = pos.x - moveOffset.x;
      let newY = pos.y - moveOffset.y;
      newX = Math.max(0, Math.min(newX, rect.width - crop.width));
      newY = Math.max(0, Math.min(newY, rect.height - crop.height));
      setCrop({ ...crop, x: newX, y: newY });
    }
  };

  const handleMouseUp = () => {
    setDragMode(null);
    setDragStart(null);
    setMoveOffset(null);
  };

  const applyCrop = () => {
    if (!crop || crop.width < 5 || crop.height < 5 || !imgRef.current) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Calculate scale from display to natural
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
      // Handle rotation
      if (rotation !== 0) {
        const rotCanvas = document.createElement('canvas');
        const rotCtx = rotCanvas.getContext('2d');
        if (!rotCtx) return;

        const rad = (rotation * Math.PI) / 180;
        const absCos = Math.abs(Math.cos(rad));
        const absSin = Math.abs(Math.sin(rad));
        rotCanvas.width = Math.round(naturalWidth * absCos + naturalHeight * absSin);
        rotCanvas.height = Math.round(naturalHeight * absCos + naturalWidth * absSin);

        rotCtx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
        rotCtx.rotate(rad);
        rotCtx.drawImage(img, -naturalWidth / 2, -naturalHeight / 2);

        // Recalculate crop position based on rotation
        ctx.drawImage(
          rotCanvas,
          cropX, cropY, cropW, cropH,
          0, 0, canvas.width, canvas.height
        );
      } else {
        ctx.drawImage(
          img,
          cropX, cropY, cropW, cropH,
          0, 0, canvas.width, canvas.height
        );
      }

      const dataUri = canvas.toDataURL('image/png');
      onApply(dataUri, canvas.width, canvas.height);
      onClose();
    };
    img.src = imageUri;
  };

  const handleReset = () => {
    setCrop(null);
    setRotation(0);
  };

  const handleRotate = () => {
    setRotation((r) => (r + 90) % 360);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('title')}
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {uiT('cancel')}
          </Button>
          <Button variant="ghost" onClick={handleReset}>
            {t('reset')}
          </Button>
          <Button
            variant="primary"
            onClick={applyCrop}
            disabled={!crop || crop.width < 5 || crop.height < 5}
          >
            {t('apply')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Aspect ratio buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">{t('aspectRatio')}:</span>
          {ASPECT_RATIOS.map((ratio) => (
            <button
              key={ratio.label}
              type="button"
              onClick={() => setAspectRatio(ratio.value)}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-sm transition-colors',
                aspectRatio === ratio.value
                  ? 'border-brand-primary bg-brand-primary text-white'
                  : 'border-stroke bg-background text-foreground hover:bg-muted'
              )}
            >
              {ratio.label}
            </button>
          ))}
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" size="sm" onClick={handleRotate} className="gap-1.5">
              <LuRotateCw className="h-4 w-4" />
              {t('rotate')}
            </Button>
          </div>
        </div>

        {/* Crop area */}
        <div
          ref={containerRef}
          className="relative flex select-none items-center justify-center overflow-hidden rounded-lg bg-black/90"
          style={{ minHeight: '300px' }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div className="relative inline-block">
            <img
              ref={imgRef}
              src={imageUri}
              alt="Crop preview"
              draggable={false}
              onLoad={handleImageLoad}
              className="max-h-[60vh] max-w-full select-none"
              style={{
                transform: `rotate(${rotation}deg)`,
                transition: 'transform 0.2s',
              }}
            />

            {/* Crop overlay */}
            {imgLoaded && crop && crop.width > 0 && crop.height > 0 && (
              <>
                {/* Dark overlay outside crop */}
                <div className="pointer-events-none absolute inset-0 bg-black/50" />
                {/* Clear the crop area using box-shadow trick */}
                <div
                  className="pointer-events-none absolute border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"
                  style={{
                    left: crop.x,
                    top: crop.y,
                    width: crop.width,
                    height: crop.height,
                  }}
                />
                {/* Grid lines inside crop (rule of thirds) */}
                <div
                  className="pointer-events-none absolute"
                  style={{
                    left: crop.x,
                    top: crop.y,
                    width: crop.width,
                    height: crop.height,
                  }}
                >
                  <div className="absolute left-1/3 top-0 h-full w-px bg-white/30" />
                  <div className="absolute left-2/3 top-0 h-full w-px bg-white/30" />
                  <div className="absolute top-1/3 h-px w-full bg-white/30" />
                  <div className="absolute top-2/3 h-px w-full bg-white/30" />
                </div>
                {/* Corner handles */}
                {[
                  { x: crop.x, y: crop.y, cursor: 'cursor-nwse-resize' },
                  { x: crop.x + crop.width, y: crop.y, cursor: 'cursor-nesw-resize' },
                  { x: crop.x, y: crop.y + crop.height, cursor: 'cursor-nesw-resize' },
                  { x: crop.x + crop.width, y: crop.y + crop.height, cursor: 'cursor-nwse-resize' },
                ].map((corner, i) => (
                  <div
                    key={i}
                    className={cn('pointer-events-none absolute h-3 w-3 rounded-full border-2 border-white bg-brand-primary', corner.cursor)}
                    style={{
                      left: corner.x - 6,
                      top: corner.y - 6,
                    }}
                  />
                ))}
              </>
            )}

            {/* Hint when no crop selected */}
            {imgLoaded && (!crop || crop.width === 0) && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="rounded-lg bg-black/60 px-4 py-2 text-sm text-white">
                  {t('hint')}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Crop info */}
        {crop && crop.width > 0 && crop.height > 0 && (
          <div className="flex items-center gap-4 text-sm text-secondary">
            <span>{t('cropSize')}: {Math.round(crop.width)} × {Math.round(crop.height)}</span>
            {rotation !== 0 && <span>{t('rotation')}: {rotation}°</span>}
          </div>
        )}
      </div>
    </Modal>
  );
}
