'use client';

import { cn } from '@/lib/utils/cn';
import type { AnyLayer } from '@/types';
import { getLayerTypeLabel } from '@/lib/utils/layer-utils';
import { useTranslations } from 'next-intl';
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

  return (
    <div className={cn('w-full rounded-lg border border-stroke bg-card-bg p-2', className)}>
      <h3 className="mb-2 px-2 text-sm font-semibold text-foreground">
        {t('layers')}
      </h3>
      <div className="space-y-1 max-h-75 overflow-y-auto">
        {sortedLayers.map((layer, index) => (
          <div
            key={layer.id}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, index)}
            onClick={() => onSelect(layer.id)}
            className={cn(
              'flex items-center gap-2 rounded-lg px-2 py-2 text-sm cursor-pointer transition-colors',
              selectedId === layer.id
                ? 'bg-brand-primary-light text-brand-primary-dark'
                : 'hover:bg-muted text-foreground'
            )}
          >
            <LuGripVertical className="h-4 w-4 cursor-grab text-secondary" />
            <span className="flex-1 truncate">{layer.name}</span>
            <span className="text-xs text-secondary">
              {getLayerTypeLabel(layer.type)}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); onToggleVisibility(layer.id); }}
              className="p-1 rounded hover:bg-muted text-secondary"
            >
              {layer.visible ? (
                <LuEye className="h-4 w-4" />
              ) : (
                <LuEyeOff className="h-4 w-4" />
              )}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onToggleLock(layer.id); }}
              className="p-1 rounded hover:bg-muted text-secondary"
            >
              {layer.locked ? (
                <LuLock className="h-4 w-4" />
              ) : (
                <LuLockOpen className="h-4 w-4" />
              )}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(layer.id); }}
              className="p-1 rounded hover:bg-error/10 text-error"
            >
              <LuTrash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}