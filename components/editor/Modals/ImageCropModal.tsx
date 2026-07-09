'use client';

import { useState, useRef, useEffect } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { cn } from '@/lib/utils/cn';
import { useTranslations } from 'next-intl';

export interface ImageCropModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUri: string;
  onCrop: (croppedUri: string) => void;
}

export default function ImageCropModal({ isOpen, onClose, imageUri, onCrop }: ImageCropModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0, width: 100, height: 100 });
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const t = useTranslations('editor.modals.imageCrop');
  const uiT = useTranslations('ui');

  useEffect(() => {
    if (!imageUri) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setImage(img);
      setCrop({ x: 0, y: 0, width: img.width, height: img.height });
    };
    img.src = imageUri;
  }, [imageUri]);

  const handleCrop = () => {
    if (!canvasRef.current || !image) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = crop.width;
    canvas.height = crop.height;
    ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height);

    const croppedUri = canvas.toDataURL('image/png');
    onCrop(croppedUri);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('title')}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {uiT('cancel')}
          </Button>
          <Button variant="primary" onClick={handleCrop}>
            {t('cropAndSave')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-stroke bg-muted">
          {image && (
            <img
              src={imageUri}
              alt="Crop preview"
              className="h-full w-full object-contain"
            />
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>
        <div className="grid grid-cols-4 gap-3">
          <div>
            <label className="mb-1 block text-xs text-secondary">{t('x')}</label>
            <input
              type="number"
              value={crop.x}
              onChange={(e) => setCrop({ ...crop, x: Number(e.target.value) })}
              className="w-full rounded border border-stroke bg-background px-2 py-1 text-sm text-foreground"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-secondary">{t('y')}</label>
            <input
              type="number"
              value={crop.y}
              onChange={(e) => setCrop({ ...crop, y: Number(e.target.value) })}
              className="w-full rounded border border-stroke bg-background px-2 py-1 text-sm text-foreground"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-secondary">{t('width')}</label>
            <input
              type="number"
              value={crop.width}
              onChange={(e) => setCrop({ ...crop, width: Number(e.target.value) })}
              className="w-full rounded border border-stroke bg-background px-2 py-1 text-sm text-foreground"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-secondary">{t('height')}</label>
            <input
              type="number"
              value={crop.height}
              onChange={(e) => setCrop({ ...crop, height: Number(e.target.value) })}
              className="w-full rounded border border-stroke bg-background px-2 py-1 text-sm text-foreground"
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
