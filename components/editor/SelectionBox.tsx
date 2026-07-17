'use client';

import { useState, useEffect } from 'react';
import {
  LuCopy,
  LuTrash2,
  LuMaximize,
  LuRotateCw,
  LuAlignLeft,
  LuAlignCenter,
  LuAlignRight,
  LuPencil,
  LuMoveHorizontal,
  LuMoveVertical,
} from 'react-icons/lu';
import type { AnyLayer, TextLayer, ShapeLayer } from '@/types';

export type ResizeDirection = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export interface SelectionBoxProps {
  layer?: AnyLayer;
  scale?: number;
  onDuplicate?: (e: React.MouseEvent) => void;
  onDelete?: (e: React.MouseEvent) => void;
  onResizeStart?: (e: React.PointerEvent, direction: ResizeDirection, mode?: 'free' | 'proportional') => void;
  onRotateStart?: (e: React.PointerEvent) => void;
  onAlign?: (align: 'left' | 'center' | 'right') => void;
  onEditText?: () => void;
  onBoxWidthDragStart?: (e: React.PointerEvent) => void;
  onHeightDragStart?: (e: React.PointerEvent) => void;
  onWidthDragStart?: (e: React.PointerEvent) => void;
}

// Visual sizes (px on screen) — bigger on mobile, smaller on large screens
const BTN_SIZE_MOBILE = 32;
const BTN_SIZE_DESKTOP = 44;
const ICON_SIZE_MOBILE = 16;
const ICON_SIZE_DESKTOP = 22;
const BTN_OFFSET = 32; // base offset (mobile)
const BTN_OFFSET_LG = 36; // base offset (mobile)

const ALIGN_ICONS = { left: LuAlignLeft, center: LuAlignCenter, right: LuAlignRight };

export default function SelectionBox({
  layer,
  scale = 1,
  onDuplicate,
  onDelete,
  onResizeStart,
  onRotateStart,
  onAlign,
  onEditText,
  onBoxWidthDragStart,
  onHeightDragStart,
  onWidthDragStart,
}: SelectionBoxProps) {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  if (!layer) return null;

  // Target visual size depends on screen — bigger on mobile, smaller on desktop
  const targetBtnSize = isDesktop ? BTN_SIZE_DESKTOP : BTN_SIZE_MOBILE;
  const targetIconSize = isDesktop ? ICON_SIZE_DESKTOP : ICON_SIZE_MOBILE;

  // Counter-scale so icons stay at the target visual size regardless of canvas zoom
  const s = 1 / scale;
  const size = targetBtnSize * s;
  const iconSize = targetIconSize * s;
  const offset = (isDesktop ? BTN_SIZE_DESKTOP : BTN_OFFSET) * s;
  const offsetLg = (isDesktop ? BTN_SIZE_DESKTOP + 8 : BTN_OFFSET_LG) * s;

  const isText = layer.type === 'text';
  const isRectangle = layer.type === 'shape' && (layer as ShapeLayer).shape === 'rectangle';
  const textLayer = layer as TextLayer;

  // Current align + next in cycle
  const currentAlign = textLayer.align;
  const nextAlign = currentAlign === 'right' ? 'center' : currentAlign === 'center' ? 'left' : 'right';
  const AlignIcon = ALIGN_ICONS[currentAlign];

  // Shared button style — counter-scaled to stay constant on screen
  const btnStyle = (extra?: React.CSSProperties): React.CSSProperties => ({
    width: size,
    height: size,
    ...extra,
  });

  const iconClass = `shrink-0`;
  const iconStyle: React.CSSProperties = { width: iconSize, height: iconSize };

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
          <button
            type="button"
            data-action="edit"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onEditText(); }}
            className="touch-none pointer-events-auto absolute flex items-center justify-center rounded-full border-2 border-layer-selected bg-white text-layer-selected shadow-lg transition-colors hover:bg-layer-selected hover:text-white"
            style={btnStyle({ top: -offset, left: -offset, transformOrigin: 'bottom right' })}
            aria-label="Edit text"
          >
            <LuPencil className={iconClass} style={iconStyle} />
          </button>
        )}

        {/* Align — top-center */}
        {onAlign && (
          <button
            type="button"
            data-action="align"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onAlign(nextAlign); }}
            className="touch-none pointer-events-auto absolute flex items-center justify-center rounded-full border-2 border-layer-selected bg-white text-layer-selected shadow-lg transition-colors hover:bg-layer-selected hover:text-white"
            style={btnStyle({ top: -offset, left: '50%', transform: `translateX(-50%)`, transformOrigin: 'center' })}
            aria-label="Align"
          >
            <AlignIcon className={iconClass} style={iconStyle} />
          </button>
        )}

        {/* Box width — top-right (drag to change box width on X axis) */}
        {onBoxWidthDragStart && (
          <button
            type="button"
            data-action="boxWidth"
            onPointerDown={(e) => { e.stopPropagation(); onBoxWidthDragStart(e); }}
            className="touch-none pointer-events-auto absolute flex cursor-ew-resize items-center justify-center rounded-full border-2 border-layer-selected bg-white text-layer-selected shadow-lg transition-colors hover:bg-layer-selected hover:text-white active:cursor-grabbing"
            style={btnStyle({ top: -offset, right: -offset, transformOrigin: 'bottom left' })}
            aria-label="Change box width"
          >
            <LuMoveHorizontal className={iconClass} style={iconStyle} />
          </button>
        )}

        {/* Delete — bottom-left */}
        <button
          type="button"
          data-action="delete"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onDelete}
          className="touch-none pointer-events-auto absolute flex items-center justify-center rounded-full border-2 border-error bg-white text-error shadow-lg transition-colors hover:bg-error hover:text-white"
          style={btnStyle({ bottom: -offset, left: -offset, transformOrigin: 'top right' })}
          aria-label="Delete"
        >
          <LuTrash2 className={iconClass} style={iconStyle} />
        </button>

        {/* Duplicate — bottom-center */}
        <button
          type="button"
          data-action="duplicate"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onDuplicate}
          className="touch-none pointer-events-auto absolute flex items-center justify-center rounded-full border-2 border-layer-selected bg-white text-layer-selected shadow-lg transition-colors hover:bg-layer-selected hover:text-white"
          style={btnStyle({ bottom: -offset, left: '50%', transform: `translateX(-50%)`, transformOrigin: 'center' })}
          aria-label="Duplicate"
        >
          <LuCopy className={iconClass} style={iconStyle} />
        </button>

        {/* Proportional resize — bottom-right */}
        <button
          type="button"
          data-action="resize"
          data-direction="se"
          data-mode="proportional"
          onPointerDown={(e) => onResizeStart?.(e, 'se', 'proportional')}
          className="touch-none pointer-events-auto absolute flex cursor-nwse-resize items-center justify-center rounded-full border-2 border-layer-selected bg-white text-layer-selected shadow-lg transition-colors hover:bg-layer-selected hover:text-white"
          style={btnStyle({ bottom: -offset, right: -offset, transformOrigin: 'top left' })}
          aria-label="Scale"
        >
          <LuMaximize className={iconClass} style={iconStyle} />
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
      {/* Delete — top-left */}
      <button
        type="button"
        data-action="delete"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onDelete}
        className="touch-none pointer-events-auto absolute flex items-center justify-center rounded-full border-2 border-error bg-white text-error shadow-lg transition-colors hover:bg-error hover:text-white"
        style={btnStyle({ top: -offsetLg, left: -offsetLg, transformOrigin: 'bottom right' })}
        aria-label="Delete"
      >
        <LuTrash2 className={iconClass} style={iconStyle} />
      </button>

      {/* Duplicate — top-right */}
      <button
        type="button"
        data-action="duplicate"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onDuplicate}
        className="touch-none pointer-events-auto absolute flex items-center justify-center rounded-full border-2 border-layer-selected bg-white text-layer-selected shadow-lg transition-colors hover:bg-layer-selected hover:text-white"
        style={btnStyle({ top: -offsetLg, right: -offsetLg, transformOrigin: 'bottom left' })}
        aria-label="Duplicate"
      >
        <LuCopy className={iconClass} style={iconStyle} />
      </button>

      {/* Rotate — bottom-left */}
      <button
        type="button"
        data-action="rotate"
        onPointerDown={onRotateStart}
        className="touch-none pointer-events-auto absolute flex cursor-grab items-center justify-center rounded-full border-2 border-layer-selected bg-white text-layer-selected shadow-lg transition-colors hover:bg-layer-selected hover:text-white active:cursor-grabbing"
        style={btnStyle({ bottom: -offsetLg, left: -offsetLg, transformOrigin: 'top right' })}
        aria-label="Rotate"
      >
        <LuRotateCw className={iconClass} style={iconStyle} />
      </button>

      {/* Proportional resize — bottom-right (scales from center) */}
      <button
        type="button"
        data-action="resize"
        data-direction="se"
        data-mode="proportional"
        onPointerDown={(e) => onResizeStart?.(e, 'se', 'proportional')}
        className="touch-none pointer-events-auto absolute flex cursor-nwse-resize items-center justify-center rounded-full border-2 border-layer-selected bg-white text-layer-selected shadow-lg transition-colors hover:bg-layer-selected hover:text-white"
        style={btnStyle({ bottom: -offsetLg, right: -offsetLg, transformOrigin: 'top left' })}
        aria-label="Scale"
      >
        <LuMaximize className={iconClass} style={iconStyle} />
      </button>

      {/* Increase height — top-center (rectangle only, drag up/down) */}
      {isRectangle && onHeightDragStart && (
        <button
          type="button"
          data-action="increaseHeight"
          onPointerDown={(e) => { e.stopPropagation(); onHeightDragStart(e); }}
          className="touch-none pointer-events-auto absolute flex cursor-ns-resize items-center justify-center rounded-full border-2 border-layer-selected bg-white text-layer-selected shadow-lg transition-colors hover:bg-layer-selected hover:text-white active:cursor-grabbing"
          style={btnStyle({ top: -offsetLg, left: '50%', transform: `translateX(-50%)`, transformOrigin: 'center' })}
          aria-label="Increase height"
        >
          <LuMoveVertical className={iconClass} style={iconStyle} />
        </button>
      )}

      {/* Increase width — right-center (rectangle only, drag left/right) */}
      {isRectangle && onWidthDragStart && (
        <button
          type="button"
          data-action="increaseWidth"
          onPointerDown={(e) => { e.stopPropagation(); onWidthDragStart(e); }}
          className="touch-none pointer-events-auto absolute flex cursor-ew-resize items-center justify-center rounded-full border-2 border-layer-selected bg-white text-layer-selected shadow-lg transition-colors hover:bg-layer-selected hover:text-white active:cursor-grabbing"
          style={btnStyle({ top: '50%', right: -offsetLg, transform: `translateY(-50%)`, transformOrigin: 'center' })}
          aria-label="Increase width"
        >
          <LuMoveHorizontal className={iconClass} style={iconStyle} />
        </button>
      )}
    </div>
  );
}
