'use client';

import { cn } from '@/lib/utils/cn';
import type { AnyLayer } from '@/types';
import { getLayerTypeLabel } from '@/lib/utils/layer-utils';
import { useTranslations } from 'next-intl';

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
            <svg className="h-4 w-4 cursor-grab text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
            </svg>
            <span className="flex-1 truncate">{layer.name}</span>
            <span className="text-xs text-secondary">
              {getLayerTypeLabel(layer.type)}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); onToggleVisibility(layer.id); }}
              className="p-1 rounded hover:bg-muted text-secondary"
            >
              {layer.visible ? (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              )}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onToggleLock(layer.id); }}
              className="p-1 rounded hover:bg-muted text-secondary"
            >
              {layer.locked ? (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                </svg>
              )}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(layer.id); }}
              className="p-1 rounded hover:bg-error/10 text-error"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}