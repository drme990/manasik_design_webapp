'use client';

import { cn } from '@/lib/utils/cn';
import type { AnyLayer } from '@/types';

export interface SelectionBoxProps {
  layer?: AnyLayer;
  onMouseDown?: (e: React.MouseEvent) => void;
}

export default function SelectionBox({ layer, onMouseDown }: SelectionBoxProps) {
  if (!layer) return null;

  const handle = 'absolute h-3 w-3 rounded-full bg-layer-selected border-2 border-white shadow-sm';

  return (
    <div
      className={cn('absolute pointer-events-none')}
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

      <div className="pointer-events-auto absolute -top-1.5 -left-1.5 cursor-nw-resize">
        <div className={handle} onMouseDown={onMouseDown} />
      </div>
      <div className="pointer-events-auto absolute -top-1.5 left-1/2 -translate-x-1/2 cursor-n-resize">
        <div className={handle} onMouseDown={onMouseDown} />
      </div>
      <div className="pointer-events-auto absolute -top-1.5 -right-1.5 cursor-ne-resize">
        <div className={handle} onMouseDown={onMouseDown} />
      </div>
      <div className="pointer-events-auto absolute top-1/2 -left-1.5 -translate-y-1/2 cursor-w-resize">
        <div className={handle} onMouseDown={onMouseDown} />
      </div>
      <div className="pointer-events-auto absolute top-1/2 -right-1.5 -translate-y-1/2 cursor-e-resize">
        <div className={handle} onMouseDown={onMouseDown} />
      </div>
      <div className="pointer-events-auto absolute -bottom-1.5 -left-1.5 cursor-sw-resize">
        <div className={handle} onMouseDown={onMouseDown} />
      </div>
      <div className="pointer-events-auto absolute -bottom-1.5 left-1/2 -translate-x-1/2 cursor-s-resize">
        <div className={handle} onMouseDown={onMouseDown} />
      </div>
      <div className="pointer-events-auto absolute -bottom-1.5 -right-1.5 cursor-se-resize">
        <div className={handle} onMouseDown={onMouseDown} />
      </div>
    </div>
  );
}