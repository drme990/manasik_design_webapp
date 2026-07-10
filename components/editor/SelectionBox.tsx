'use client';

import { cn } from '@/lib/utils/cn';
import { LuCopy, LuTrash2, LuMaximize, LuRotateCw } from 'react-icons/lu';
import type { AnyLayer } from '@/types';

export type ResizeDirection = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export interface SelectionBoxProps {
  layer?: AnyLayer;
  onMouseDown?: (e: React.MouseEvent) => void;
  onDuplicate?: (e: React.MouseEvent) => void;
  onDelete?: (e: React.MouseEvent) => void;
  onResizeStart?: (e: React.MouseEvent, direction: ResizeDirection, mode?: 'free' | 'proportional') => void;
  onRotateStart?: (e: React.MouseEvent) => void;
}

const ICON_BTN =
  'flex h-14 w-14 items-center justify-center rounded-full border-2 border-layer-selected bg-white text-layer-selected shadow-lg transition-colors hover:bg-layer-selected hover:text-white';
const DELETE_BTN =
  'flex h-14 w-14 items-center justify-center rounded-full border-2 border-error bg-white text-error shadow-lg transition-colors hover:bg-error hover:text-white';

const HANDLES: { direction: ResizeDirection; className: string; cursor: string }[] = [
  { direction: 'nw', className: '-top-3 -left-3', cursor: 'cursor-nw-resize' },
  { direction: 'n', className: '-top-3 left-1/2 -translate-x-1/2', cursor: 'cursor-n-resize' },
  { direction: 'ne', className: '-top-3 right-3', cursor: 'cursor-ne-resize' },
  { direction: 'e', className: 'top-1/2 right-3 -translate-y-1/2', cursor: 'cursor-e-resize' },
  { direction: 'se', className: 'bottom-3 right-3', cursor: 'cursor-se-resize' },
  { direction: 's', className: 'bottom-3 left-1/2 -translate-x-1/2', cursor: 'cursor-s-resize' },
  { direction: 'sw', className: 'bottom-3 -left-3', cursor: 'cursor-sw-resize' },
  { direction: 'w', className: 'top-1/2 -left-3 -translate-y-1/2', cursor: 'cursor-w-resize' },
];

export default function SelectionBox({
  layer,
  onMouseDown,
  onDuplicate,
  onDelete,
  onResizeStart,
  onRotateStart,
}: SelectionBoxProps) {
  if (!layer) return null;

  const canFreeScale = layer.type === 'shape' || layer.type === 'image';
  const handle = 'absolute h-6 w-6 rounded-full bg-layer-selected border-2 border-white shadow-lg';

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: layer.x - 2,
        top: layer.y - 2,
        width: layer.width + 4,
        height: layer.height + 4,
        transform: `rotate(${layer.rotation}deg)`,
        zIndex: layer.zIndex + 1000,
      }}
    >
      <div className="absolute inset-0 border-2 border-dashed border-layer-selected" />

      {/* Delete — top-left */}
      <button
        type="button"
        data-action="delete"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={onDelete}
        onTouchStart={(e) => e.stopPropagation()}
        className={cn(DELETE_BTN, 'pointer-events-auto absolute -top-16 -left-16')}
        aria-label="Delete"
      >
        <LuTrash2 className="h-7 w-7" />
      </button>

      {/* Duplicate — top-right */}
      <button
        type="button"
        data-action="duplicate"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={onDuplicate}
        onTouchStart={(e) => e.stopPropagation()}
        className={cn(ICON_BTN, 'pointer-events-auto absolute -top-16 -right-16')}
        aria-label="Duplicate"
      >
        <LuCopy className="h-7 w-7" />
      </button>

      {/* Rotate — bottom-left */}
      <button
        type="button"
        data-action="rotate"
        onMouseDown={onRotateStart}
        className={cn(ICON_BTN, 'pointer-events-auto absolute -bottom-16 -left-16 cursor-grab active:cursor-grabbing')}
        aria-label="Rotate"
      >
        <LuRotateCw className="h-7 w-7" />
      </button>

      {/* Proportional resize — bottom-right */}
      <button
        type="button"
        data-action="resize"
        data-direction="se"
        data-mode="proportional"
        onMouseDown={(e) => onResizeStart?.(e, 'se', 'proportional')}
        className={cn(ICON_BTN, 'pointer-events-auto absolute -bottom-16 -right-16 cursor-nwse-resize')}
        aria-label="Scale"
      >
        <LuMaximize className="h-7 w-7" />
      </button>

      {/* Border resize dots — free scaling (shapes & images) */}
      {canFreeScale && HANDLES.map(({ direction, className, cursor }) => (
        <div
          key={direction}
          data-action="resize"
          data-direction={direction}
          data-mode="free"
          className={cn('pointer-events-auto absolute', className, cursor)}
        >
          <div
            className={handle}
            onMouseDown={(e) => onResizeStart?.(e, direction, 'free')}
          />
        </div>
      ))}
    </div>
  );
}
