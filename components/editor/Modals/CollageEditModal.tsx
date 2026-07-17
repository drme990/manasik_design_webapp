'use client';

import { useState, useRef, useEffect } from 'react';
import FullPageDrawer from '@/components/ui/FullPageDrawer';
import Button from '@/components/ui/Button';
import { useTranslations } from '@/lib/i18n/strings';
import { cn } from '@/lib/utils/cn';
import { COLLAGE_LAYOUTS } from '@/lib/constants/presets';
import { LuReplace, LuRotateCcw, LuPlus } from 'react-icons/lu';
import type { ImageLayer, ImageLayerCollageCell } from '@/types';

export interface CollageEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  layer: ImageLayer | null;
  onUpdate: (updates: Partial<ImageLayer>) => void;
}

export default function CollageEditModal({
  isOpen,
  onClose,
  layer,
  onUpdate,
}: CollageEditModalProps) {
  const t = useTranslations('editor.modals.collageEdit');
  const uiT = useTranslations('ui');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addFileInputRef = useRef<HTMLInputElement>(null);

  const [selectedCell, setSelectedCell] = useState<number | null>(null);
  const [dragState, setDragState] = useState<{
    startX: number;
    startY: number;
    startOffsetX: number;
    startOffsetY: number;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedCell(null);
      setDragState(null);
    }
  }, [isOpen]);

  const collage = layer?.collage;
  const layout = collage ? COLLAGE_LAYOUTS.find(l => l.id === collage.layout) || COLLAGE_LAYOUTS[0] : null;

  const handleReplaceFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || selectedCell === null || !collage) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const uri = event.target?.result as string;
      const cells = [...collage.cells];
      cells[selectedCell] = { ...cells[selectedCell], uri };
      const uris = cells.map(c => c.uri);
      onUpdate({ collage: { ...collage, cells, uris } });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleCellUpdate = (index: number, updates: Partial<ImageLayerCollageCell>) => {
    if (!collage) return;
    const cells = [...collage.cells];
    cells[index] = { ...cells[index], ...updates };
    onUpdate({ collage: { ...collage, cells } });
  };

  const handleAddImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !collage) return;
    if (collage.cells.length >= 4) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const uri = event.target?.result as string;
      const newCells = [...collage.cells, { uri, offsetX: 0, offsetY: 0, scale: 1 }];
      const newUris = newCells.map(c => c.uri);
      const newLayout = COLLAGE_LAYOUTS.find(l => l.count === newCells.length);
      onUpdate({
        collage: {
          ...collage,
          cells: newCells,
          uris: newUris,
          layout: newLayout?.id ?? collage.layout,
        },
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleImagePointerDown = (e: React.PointerEvent, index: number) => {
    if (!collage || selectedCell !== index) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const cell = collage.cells[index];
    setDragState({
      startX: e.clientX,
      startY: e.clientY,
      startOffsetX: cell?.offsetX ?? 0,
      startOffsetY: cell?.offsetY ?? 0,
    });
  };

  const handleImagePointerMove = (e: React.PointerEvent) => {
    if (!dragState || selectedCell === null || !collage) return;
    e.preventDefault();
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    handleCellUpdate(selectedCell, {
      offsetX: dragState.startOffsetX + dx,
      offsetY: dragState.startOffsetY + dy,
    });
  };

  const handleImagePointerUp = (e: React.PointerEvent) => {
    if (dragState) {
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    }
    setDragState(null);
  };

  if (!collage || !layout || !layer) return null;

  const selectedCellData = selectedCell !== null ? collage.cells[selectedCell] : null;
  // Preview fills available width, max 500px
  const previewW = Math.min(layer.width, 500);
  const previewH = previewW * (layer.height / layer.width);
  const previewScale = previewW / layer.width;

  return (
    <FullPageDrawer
      isOpen={isOpen}
      onClose={onClose}
      title={t('title')}
      onDone={collage.cells.length < 4 ? () => addFileInputRef.current?.click() : undefined}
      doneIcon={<LuPlus className="h-5 w-5" />}
      doneLabel={t('addImage')}
    >
      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleReplaceFile} />
      <input ref={addFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAddImage} />

      <div className="mx-auto max-w-2xl space-y-6">
        {/* Collage preview */}
        <div className="flex justify-center">
          <div
            className="relative overflow-hidden touch-none shadow-lg"
            style={{
              width: previewW,
              height: previewH,
              backgroundColor: collage.bgColor,
              borderRadius: collage.containerRadius ?? 0,
            }}
          >
            {layout.cells.map((cellDef, i) => {
              const cell = collage.cells[i];
              const gap = collage.gap ?? 4;
              const cellW = cellDef.w * layer.width * previewScale - gap;
              const cellH = cellDef.h * layer.height * previewScale - gap;
              const cellX = cellDef.x * layer.width * previewScale + gap / 2;
              const cellY = cellDef.y * layer.height * previewScale + gap / 2;
              const isSelected = selectedCell === i;
              return (
                <div
                  key={i}
                  onClick={() => setSelectedCell(i)}
                  className={cn(
                    'absolute overflow-hidden transition-all cursor-pointer',
                    isSelected ? 'ring-2 ring-brand-primary ring-offset-1' : 'hover:ring-1 hover:ring-brand-primary/50'
                  )}
                  style={{
                    left: cellX,
                    top: cellY,
                    width: cellW,
                    height: cellH,
                    borderRadius: layer.borderRadius,
                  }}
                >
                  {cell?.uri ? (
                    <img
                      src={cell.uri}
                      alt={`cell ${i + 1}`}
                      draggable={false}
                      className={cn(
                        'h-full w-full select-none object-cover',
                        isSelected && 'cursor-move touch-none'
                      )}
                      style={{
                        transform: `scale(${cell.scale}) translate(${cell.offsetX}px, ${cell.offsetY}px)`,
                      }}
                      onPointerDown={isSelected ? (e) => handleImagePointerDown(e, i) : undefined}
                      onPointerMove={isSelected ? handleImagePointerMove : undefined}
                      onPointerUp={isSelected ? handleImagePointerUp : undefined}
                      onPointerCancel={isSelected ? handleImagePointerUp : undefined}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-muted text-secondary text-xs">
                      {i + 1}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected cell controls */}
        {selectedCell !== null && selectedCellData ? (
          <div className="space-y-4 rounded-xl border border-stroke bg-card-bg p-5">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">
                {t('cell', { index: selectedCell + 1 })}
              </h3>
              <button
                onClick={() => setSelectedCell(null)}
                className="text-xs text-secondary hover:text-foreground"
              >
                {uiT('done')}
              </button>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="gap-1.5"
              >
                <LuReplace className="h-4 w-4" />
                {t('replace')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleCellUpdate(selectedCell, { scale: 1, offsetX: 0, offsetY: 0 })}
                className="gap-1.5"
              >
                <LuRotateCcw className="h-4 w-4" />
                {t('reset')}
              </Button>
            </div>

            {/* Zoom slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-secondary">{t('zoom')}</label>
                <span className="text-xs font-medium text-foreground">{Math.round(selectedCellData.scale * 100)}%</span>
              </div>
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={selectedCellData.scale}
                onChange={(e) => handleCellUpdate(selectedCell, { scale: Number(e.target.value) })}
                className="w-full accent-brand-primary"
              />
            </div>

            {/* Drag hint */}
            <p className="text-center text-xs text-secondary">{t('dragHint')}</p>
          </div>
        ) : (
          <p className="text-center text-sm text-secondary">{t('selectHint')}</p>
        )}
      </div>
    </FullPageDrawer>
  );
}
