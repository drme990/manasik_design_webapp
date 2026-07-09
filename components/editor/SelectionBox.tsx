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
  onResizeStart?: (e: React.MouseEvent, direction: ResizeDirection) => void;
  onProportionalResizeStart?: (e: React.MouseEvent) => void;
  onRotateStart?: (e: React.MouseEvent) => void;
}

const ICON_BTN =
  'flex h-8 w-8 items-center justify-center rounded-full border border-layer-selected bg-white text-layer-selected shadow-sm transition-colors hover:bg-layer-selected hover:text-white';
const DELETE_BTN =
  'flex h-8 w-8 items-center justify-center rounded-full border border-error bg-white text-error shadow-sm transition-colors hover:bg-error hover:text-white';

const HANDLES: { direction: ResizeDirection; className: string; cursor: string }[] = [
  { direction: 'nw', className: '-top-1.5 -left-1.5', cursor: 'cursor-nw-resize' },
  { direction: 'n', className: '-top-1.5 left-1/2 -translate-x-1/2', cursor: 'cursor-n-resize' },
  { direction: 'ne', className: '-top-1.5 -right-1.5', cursor: 'cursor-ne-resize' },
  { direction: 'e', className: 'top-1/2 -right-1.5 -translate-y-1/2', cursor: 'cursor-e-resize' },
  { direction: 'se', className: '-bottom-1.5 -right-1.5', cursor: 'cursor-se-resize' },
  { direction: 's', className: '-bottom-1.5 left-1/2 -translate-x-1/2', cursor: 'cursor-s-resize' },
  { direction: 'sw', className: '-bottom-1.5 -left-1.5', cursor: 'cursor-sw-resize' },
  { direction: 'w', className: 'top-1/2 -left-1.5 -translate-y-1/2', cursor: 'cursor-w-resize' },
];

export default function SelectionBox({
  layer,
  onMouseDown,
  onDuplicate,
  onDelete,
  onResizeStart,
  onProportionalResizeStart,
  onRotateStart,
}: SelectionBoxProps) {
  if (!layer) return null;

  const handle = 'absolute h-3 w-3 rounded-full bg-layer-selected border-2 border-white shadow-sm';

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
        onClick={onDelete}
        className={cn(DELETE_BTN, 'pointer-events-auto absolute -top-5 -left-5')}
        aria-label="Delete"
      >
        <LuTrash2 className="h-4 w-4" />
      </button>

      {/* Duplicate — top-right */}
      <button
        type="button"
        onClick={onDuplicate}
        className={cn(ICON_BTN, 'pointer-events-auto absolute -top-5 -right-5')}
        aria-label="Duplicate"
      >
        <LuCopy className="h-4 w-4" />
      </button>

      {/* Rotate — bottom-left */}
      <button
        type="button"
        onMouseDown={onRotateStart}
        className={cn(ICON_BTN, 'pointer-events-auto absolute -bottom-5 -left-5 cursor-grab active:cursor-grabbing')}
        aria-label="Rotate"
      >
        <LuRotateCw className="h-4 w-4" />
      </button>

      {/* Proportional resize — bottom-right */}
      <button
        type="button"
        onMouseDown={onProportionalResizeStart}
        className={cn(ICON_BTN, 'pointer-events-auto absolute -bottom-5 -right-5 cursor-nwse-resize')}
        aria-label="Scale"
      >
        <LuMaximize className="h-4 w-4" />
      </button>

      {/* Border resize dots — free scaling (shapes only) */}
      {layer.type === 'shape' && HANDLES.map(({ direction, className, cursor }) => (
        <div
          key={direction}
          className={cn('pointer-events-auto absolute', className, cursor)}
        >
          <div
            className={handle}
            onMouseDown={(e) => onResizeStart?.(e, direction)}
          />
        </div>
      ))}
    </div>
  );
}
