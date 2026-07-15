'use client';

import { cn } from '@/lib/utils/cn';
import type { AnyLayer } from '@/types';
import { getLayerTypeLabel } from '@/lib/utils/layer-utils';
import { useTranslations } from '@/lib/i18n/strings';
import { LuGripVertical, LuEye, LuEyeOff, LuLock, LuLockOpen, LuTrash2 } from 'react-icons/lu';

export interface DraggableLayerListProps {
  layers: AnyLayer[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onDelete: (id: string) => void;
  className?: string;
}

export default function DraggableLayerList({
  layers,
  selectedId,
  onSelect,
  onReorder,
  onToggleVisibility,
  onToggleLock,
  onDelete,
  className,
}: DraggableLayerListProps) {
  const t = useTranslations('editor');
  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    const fromIndex = Number(e.dataTransfer.getData('text/plain'));
    if (fromIndex !== toIndex) {
      onReorder(fromIndex, toIndex);
    }
  };

  const sortedLayers = [...layers].sort((a, b) => b.zIndex - a.zIndex);

  const isSelected = (id: string) => selectedId === id;

  return (
    <div className={cn('w-full rounded-lg border border-stroke bg-card-bg p-2', className)}>
      <h3 className="mb-2 px-2 text-sm font-semibold text-foreground">
        {t('layers')}
      </h3>
      <div className="max-h-75 space-y-1 overflow-y-auto">
        {sortedLayers.map((layer, index) => (
          <div
            key={layer.id}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, index)}
            onClick={() => onSelect(layer.id)}
            className={cn(
              'flex cursor-pointer items-center gap-2 rounded-lg border px-2 py-2 text-sm transition-colors',
              isSelected(layer.id)
                ? 'border-brand-primary bg-brand-primary text-white shadow-sm'
                : 'border-transparent text-foreground hover:bg-brand-primary-light/40 hover:text-brand-primary-dark'
            )}
          >
            <LuGripVertical
              className={cn(
                'h-4 w-4 cursor-grab',
                isSelected(layer.id) ? 'text-white/70' : 'text-secondary'
              )}
            />
            <span className="flex-1 truncate">{layer.name}</span>
            <span
              className={cn(
                'text-xs',
                isSelected(layer.id) ? 'text-white/70' : 'text-secondary'
              )}
            >
              {getLayerTypeLabel(layer.type)}
            </span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleVisibility(layer.id); }}
              className={cn(
                'rounded p-1 transition-colors',
                isSelected(layer.id)
                  ? 'text-white/80 hover:bg-white/20'
                  : 'text-secondary hover:bg-muted'
              )}
            >
              {layer.visible ? (
                <LuEye className="h-4 w-4" />
              ) : (
                <LuEyeOff className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleLock(layer.id); }}
              className={cn(
                'rounded p-1 transition-colors',
                isSelected(layer.id)
                  ? 'text-white/80 hover:bg-white/20'
                  : 'text-secondary hover:bg-muted'
              )}
            >
              {layer.locked ? (
                <LuLock className="h-4 w-4" />
              ) : (
                <LuLockOpen className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(layer.id); }}
              className={cn(
                'rounded p-1 transition-colors',
                isSelected(layer.id)
                  ? 'text-white/80 hover:bg-white/20'
                  : 'text-error hover:bg-error/10'
              )}
            >
              <LuTrash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
