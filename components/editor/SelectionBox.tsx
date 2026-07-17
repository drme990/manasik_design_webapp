'use client';

import { cn } from '@/lib/utils/cn';
import {
  LuCopy,
  LuTrash2,
  LuMaximize,
  LuRotateCw,
  LuAlignLeft,
  LuAlignCenter,
  LuAlignRight,
  LuAlignStartVertical,
  LuAlignCenterVertical,
  LuAlignEndVertical,
  LuPencil,
  LuMoveHorizontal,
} from 'react-icons/lu';
import type { AnyLayer, TextLayer, ShapeLayer } from '@/types';

export type ResizeDirection = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export interface SelectionBoxProps {
  layer?: AnyLayer;
  onDuplicate?: (e: React.MouseEvent) => void;
  onDelete?: (e: React.MouseEvent) => void;
  onResizeStart?: (e: React.PointerEvent, direction: ResizeDirection, mode?: 'free' | 'proportional') => void;
  onRotateStart?: (e: React.PointerEvent) => void;
  onAlign?: (align: 'left' | 'center' | 'right') => void;
  onEditText?: () => void;
  onBoxWidthDragStart?: (e: React.PointerEvent) => void;
}

const ICON_BTN =
  'touch-none flex h-12 w-12 items-center justify-center rounded-full border-2 border-layer-selected bg-white text-layer-selected shadow-lg transition-colors hover:bg-layer-selected hover:text-white';
const DELETE_BTN =
  'touch-none flex h-12 w-12 items-center justify-center rounded-full border-2 border-error bg-white text-error shadow-lg transition-colors hover:bg-error hover:text-white';

// Free resize handles — only shown for "free square" (rectangle_free) shapes
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

const ALIGN_ICONS = { left: LuAlignLeft, center: LuAlignCenter, right: LuAlignRight };
const VALIGN_ICONS = { top: LuAlignStartVertical, middle: LuAlignCenterVertical, bottom: LuAlignEndVertical };

export default function SelectionBox({
  layer,
  onDuplicate,
  onDelete,
  onResizeStart,
  onRotateStart,
  onAlign,
  onEditText,
  onBoxWidthDragStart,
}: SelectionBoxProps) {
  if (!layer) return null;

  const isText = layer.type === 'text';
  const isFreeSquare = layer.type === 'shape' && (layer as ShapeLayer).shape === 'rectangle_free';
  const textLayer = layer as TextLayer;
  const handle = 'touch-none absolute h-6 w-6 rounded-full bg-layer-selected border-2 border-white shadow-lg';

  // Current align + next in cycle
  const currentAlign = textLayer.align;
  const currentVAlign = textLayer.verticalAlign;
  const nextAlign = currentAlign === 'right' ? 'center' : currentAlign === 'center' ? 'left' : 'right';
  const nextVAlign = currentVAlign === 'bottom' ? 'middle' : currentVAlign === 'middle' ? 'top' : 'bottom';
  const AlignIcon = ALIGN_ICONS[currentAlign];
  const VAlignIcon = VALIGN_ICONS[currentVAlign];

  if (isText) {
    // Text layer — custom icon layout:
    // Top-left: Edit | Top-center: Align | Top-right: Box width
    // Bottom-right: Resize | Bottom-center: Duplicate | Bottom-left: Delete
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
        {/* Edit — top-left */}
        {onEditText && (
          <div className="pointer-events-auto absolute -top-14 -left-14">
            <button
              type="button"
              data-action="edit"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onEditText(); }}
              className={ICON_BTN}
              aria-label="Edit text"
            >
              <LuPencil className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* Align — top-center */}
        {onAlign && (
          <div className="pointer-events-auto absolute -top-14 left-1/2 -translate-x-1/2">
            <button
              type="button"
              data-action="align"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onAlign(nextAlign); }}
              className={ICON_BTN}
              aria-label="Align"
            >
              <AlignIcon className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* Box width — top-right (drag to change box width on X axis) */}
        {onBoxWidthDragStart && (
          <div className="pointer-events-auto absolute -top-14 -right-14">
            <button
              type="button"
              data-action="boxWidth"
              onPointerDown={(e) => { e.stopPropagation(); onBoxWidthDragStart(e); }}
              className={cn(ICON_BTN, 'cursor-ew-resize active:cursor-grabbing')}
              aria-label="Change box width"
            >
              <LuMoveHorizontal className="h-5 w-5" />
            </button>
          </div>
        )}

        {/* Delete — bottom-left */}
        <button
          type="button"
          data-action="delete"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onDelete}
          className={cn(DELETE_BTN, 'pointer-events-auto absolute -bottom-14 -left-14')}
          aria-label="Delete"
        >
          <LuTrash2 className="h-5 w-5" />
        </button>

        {/* Duplicate — bottom-center */}
        <button
          type="button"
          data-action="duplicate"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onDuplicate}
          className={cn(ICON_BTN, 'pointer-events-auto absolute -bottom-14 left-1/2 -translate-x-1/2')}
          aria-label="Duplicate"
        >
          <LuCopy className="h-5 w-5" />
        </button>

        {/* Proportional resize — bottom-right */}
        <button
          type="button"
          data-action="resize"
          data-direction="se"
          data-mode="proportional"
          onPointerDown={(e) => onResizeStart?.(e, 'se', 'proportional')}
          className={cn(ICON_BTN, 'pointer-events-auto absolute -bottom-14 -right-14 cursor-nwse-resize')}
          aria-label="Scale"
        >
          <LuMaximize className="h-5 w-5" />
        </button>
      </div>
    );
  }

  // Non-text layers — original layout
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
      {/* No dashed border box — clean canvas */}

      {/* Delete — top-left */}
      <button
        type="button"
        data-action="delete"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onDelete}
        className={cn(DELETE_BTN, 'pointer-events-auto absolute -top-16 -left-16')}
        aria-label="Delete"
      >
        <LuTrash2 className="h-7 w-7" />
      </button>

      {/* Duplicate — top-right */}
      <button
        type="button"
        data-action="duplicate"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onDuplicate}
        className={cn(ICON_BTN, 'pointer-events-auto absolute -top-16 -right-16')}
        aria-label="Duplicate"
      >
        <LuCopy className="h-7 w-7" />
      </button>

      {/* Rotate — bottom-left */}
      <button
        type="button"
        data-action="rotate"
        onPointerDown={onRotateStart}
        className={cn(ICON_BTN, 'pointer-events-auto absolute -bottom-16 -left-16 cursor-grab active:cursor-grabbing')}
        aria-label="Rotate"
      >
        <LuRotateCw className="h-7 w-7" />
      </button>

      {/* Proportional resize — bottom-right (scales from center) */}
      <button
        type="button"
        data-action="resize"
        data-direction="se"
        data-mode="proportional"
        onPointerDown={(e) => onResizeStart?.(e, 'se', 'proportional')}
        className={cn(ICON_BTN, 'pointer-events-auto absolute -bottom-16 -right-16 cursor-nwse-resize')}
        aria-label="Scale"
      >
        <LuMaximize className="h-7 w-7" />
      </button>

      {/* Free border handles — ONLY for "free square" (rectangle_free) shapes */}
      {isFreeSquare && HANDLES.map(({ direction, className, cursor }) => (
        <div
          key={direction}
          data-action="resize"
          data-direction={direction}
          data-mode="free"
          className={cn('pointer-events-auto absolute', className, cursor)}
        >
          <div
            className={handle}
            onPointerDown={(e) => onResizeStart?.(e, direction, 'free')}
          />
        </div>
      ))}
    </div>
  );
}
