'use client';

import { cn } from '@/lib/utils/cn';
import { LuCopy, LuTrash2, LuMaximize, LuRotateCw, LuAlignLeft, LuAlignCenter, LuAlignRight, LuAlignStartVertical, LuAlignCenterVertical, LuAlignEndVertical } from 'react-icons/lu';
import type { AnyLayer, TextLayer, ShapeLayer } from '@/types';

export type ResizeDirection = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export interface SelectionBoxProps {
  layer?: AnyLayer;
  onPointerDown?: (e: React.PointerEvent) => void;
  onDuplicate?: (e: React.MouseEvent) => void;
  onDelete?: (e: React.MouseEvent) => void;
  onResizeStart?: (e: React.PointerEvent, direction: ResizeDirection, mode?: 'free' | 'proportional') => void;
  onRotateStart?: (e: React.PointerEvent) => void;
  onAlign?: (align: 'left' | 'center' | 'right') => void;
  onVerticalAlign?: (align: 'top' | 'middle' | 'bottom') => void;
}

const ICON_BTN =
  'touch-none flex h-14 w-14 items-center justify-center rounded-full border-2 border-layer-selected bg-white text-layer-selected shadow-lg transition-colors hover:bg-layer-selected hover:text-white';
const DELETE_BTN =
  'touch-none flex h-14 w-14 items-center justify-center rounded-full border-2 border-error bg-white text-error shadow-lg transition-colors hover:bg-error hover:text-white';

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

export default function SelectionBox({
  layer,
  onPointerDown,
  onDuplicate,
  onDelete,
  onResizeStart,
  onRotateStart,
  onAlign,
  onVerticalAlign,
}: SelectionBoxProps) {
  if (!layer) return null;

  const isText = layer.type === 'text';
  const isFreeSquare = layer.type === 'shape' && (layer as ShapeLayer).shape === 'rectangle_free';
  const currentAlign = isText ? (layer as TextLayer).align : undefined;
  const currentVAlign = isText ? (layer as TextLayer).verticalAlign : undefined;
  const handle = 'touch-none absolute h-6 w-6 rounded-full bg-layer-selected border-2 border-white shadow-lg';

  const ALIGN_BTN =
    'touch-none flex h-10 w-10 items-center justify-center rounded-full border-2 border-layer-selected bg-white text-layer-selected shadow-lg transition-colors hover:bg-layer-selected hover:text-white';

  const alignButtons: { align: 'left' | 'center' | 'right'; icon: typeof LuAlignLeft; label: string }[] = [
    { align: 'left', icon: LuAlignLeft, label: 'Left' },
    { align: 'center', icon: LuAlignCenter, label: 'Center' },
    { align: 'right', icon: LuAlignRight, label: 'Right' },
  ];

  const vAlignButtons: { align: 'top' | 'middle' | 'bottom'; icon: typeof LuAlignStartVertical; label: string }[] = [
    { align: 'top', icon: LuAlignStartVertical, label: 'Top' },
    { align: 'middle', icon: LuAlignCenterVertical, label: 'Middle' },
    { align: 'bottom', icon: LuAlignEndVertical, label: 'Bottom' },
  ];

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

      {/* Text alignment — top-center */}
      {isText && onAlign && (
        <div className="pointer-events-auto absolute -top-14 left-1/2 flex -translate-x-1/2 gap-1.5">
          {alignButtons.map(({ align, icon: Icon, label }) => (
            <button
              key={align}
              type="button"
              data-action="align"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onAlign(align); }}
              className={cn(
                ALIGN_BTN,
                currentAlign === align && 'bg-layer-selected text-white'
              )}
              aria-label={label}
            >
              <Icon className="h-5 w-5" />
            </button>
          ))}
        </div>
      )}

      {/* Text vertical alignment — bottom-center */}
      {isText && onVerticalAlign && (
        <div className="pointer-events-auto absolute -bottom-14 left-1/2 flex -translate-x-1/2 gap-1.5">
          {vAlignButtons.map(({ align, icon: Icon, label }) => (
            <button
              key={align}
              type="button"
              data-action="valign"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onVerticalAlign(align); }}
              className={cn(
                ALIGN_BTN,
                currentVAlign === align && 'bg-layer-selected text-white'
              )}
              aria-label={label}
            >
              <Icon className="h-5 w-5" />
            </button>
          ))}
        </div>
      )}

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
