'use client';

import { useRef, useState, useEffect } from 'react';
import { useDrag, useDrop, useDragLayer } from 'react-dnd';
import { cn } from '@/lib/utils/cn';
import type { AnyLayer } from '@/types';
import { getLayerTypeLabel } from '@/lib/utils/layer-utils';
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

const ITEM_TYPE = 'LAYER';

interface DragItem {
  index: number;
  id: string;
  layer: AnyLayer;
  selected: boolean;
}

/* --- Custom drag layer: clean floating preview --- */
function DragLayerView() {
  const { item, isDragging, currentOffset } = useDragLayer((monitor) => ({
    item: monitor.getItem() as DragItem | null,
    isDragging: monitor.isDragging(),
    currentOffset: monitor.getSourceClientOffset(),
  }));

  if (!isDragging || !item || !currentOffset) return null;

  return (
    <div
      className="pointer-events-none fixed z-9999 rotate-1"
      style={{ left: currentOffset.x, top: currentOffset.y, width: 300 }}
    >
      <div
        className={cn(
          'flex items-center gap-2 rounded-lg border-2 px-3 py-2.5 text-sm shadow-2xl',
          item.selected
            ? 'border-brand-primary bg-brand-primary text-white'
            : 'border-brand-primary bg-card-bg text-foreground'
        )}
      >
        <LuGripVertical className={cn('h-4 w-4 shrink-0', item.selected ? 'text-white/70' : 'text-secondary')} />
        <span className="flex-1 truncate">{item.layer.name}</span>
        <span className={cn('shrink-0 text-xs', item.selected ? 'text-white/70' : 'text-secondary')}>
          {getLayerTypeLabel(item.layer.type)}
        </span>
      </div>
    </div>
  );
}

/* --- Single row --- */
function LayerRow({
  layer,
  index,
  selected,
  onSelect,
  onReorder,
  onToggleVisibility,
  onToggleLock,
  onDelete,
}: {
  layer: AnyLayer;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onReorder: (from: number, to: number) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [dropAbove, setDropAbove] = useState(false);
  const [dropBelow, setDropBelow] = useState(false);

  const [{ isDragging }, drag] = useDrag({
    type: ITEM_TYPE,
    item: { index, id: layer.id, layer, selected },
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  });

  const [{ isOver }, drop] = useDrop({
    accept: ITEM_TYPE,
    hover: (_item: DragItem, monitor) => {
      if (!ref.current) return;
      const clientOffset = monitor.getClientOffset();
      if (!clientOffset) return;

      const rect = ref.current.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      const isAbove = clientOffset.y < midY;

      setDropAbove(isAbove);
      setDropBelow(!isAbove);
    },
    drop: (item: DragItem, monitor) => {
      if (!ref.current || item.index === index) return;
      const clientOffset = monitor.getClientOffset();
      if (!clientOffset) return;

      const rect = ref.current.getBoundingClientRect();
      const isAbove = clientOffset.y < rect.top + rect.height / 2;

      // If dropping above this row, insert before (same index)
      // If dropping below, insert after (index + 1, but account for removal)
      let targetIndex = isAbove ? index : index + 1;
      if (item.index < targetIndex) targetIndex -= 1; // account for removal shifting indices
      if (item.index !== targetIndex) onReorder(item.index, targetIndex);

      setDropAbove(false);
      setDropBelow(false);
    },
    collect: (monitor) => ({ isOver: monitor.isOver() }),
  });

  drag(drop(ref));

  useEffect(() => {
    if (!isOver) {
      setDropAbove(false);
      setDropBelow(false);
    }
  }, [isOver]);

  return (
    <div className="relative">
      {/* Drop indicator — thick line showing exact insertion point */}
      {dropAbove && (
        <div className="absolute -top-1.5 left-1 right-1 z-10 h-1 rounded-full bg-brand-primary shadow-lg" />
      )}
      {dropBelow && (
        <div className="absolute -bottom-1.5 left-1 right-1 z-10 h-1 rounded-full bg-brand-primary shadow-lg" />
      )}

      <div
        ref={ref}
        onClick={onSelect}
        className={cn(
          'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors',
          selected
            ? 'border-brand-primary bg-brand-primary text-white shadow-sm'
            : 'border-stroke bg-card-bg text-foreground hover:bg-muted',
          isDragging && 'opacity-25',
        )}
      >
        <LuGripVertical className={cn('h-4 w-4 shrink-0 cursor-grab', selected ? 'text-white/70' : 'text-secondary')} />
        <span className="flex-1 truncate">{layer.name}</span>
        <span className={cn('shrink-0 text-xs', selected ? 'text-white/70' : 'text-secondary')}>
          {getLayerTypeLabel(layer.type)}
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleVisibility(layer.id); }}
          className={cn('shrink-0 rounded p-1 transition-colors', selected ? 'text-white/80 hover:bg-white/20' : 'text-secondary hover:bg-muted')}
        >
          {layer.visible ? <LuEye className="h-4 w-4" /> : <LuEyeOff className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleLock(layer.id); }}
          className={cn('shrink-0 rounded p-1 transition-colors', selected ? 'text-white/80 hover:bg-white/20' : 'text-secondary hover:bg-muted')}
        >
          {layer.locked ? <LuLock className="h-4 w-4" /> : <LuLockOpen className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(layer.id); }}
          className={cn('shrink-0 rounded p-1 transition-colors', selected ? 'text-white/80 hover:bg-white/20' : 'text-error hover:bg-error/10')}
        >
          <LuTrash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
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
  const sortedLayers = [...layers].sort((a, b) => b.zIndex - a.zIndex);

  return (
    <>
      <DragLayerView />
      <div className={cn('w-full space-y-2.5', className)}>
        {sortedLayers.map((layer, index) => (
          <LayerRow
            key={layer.id}
            layer={layer}
            index={index}
            selected={selectedId === layer.id}
            onSelect={() => onSelect(layer.id)}
            onReorder={onReorder}
            onToggleVisibility={onToggleVisibility}
            onToggleLock={onToggleLock}
            onDelete={onDelete}
          />
        ))}
      </div>
    </>
  );
}
