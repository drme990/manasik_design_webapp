'use client';

import { cn } from '@/lib/utils/cn';
import Image from 'next/image';
import { LuImageOff } from 'react-icons/lu';

export interface CollageLayoutCell {
  x: number;
  y: number;
  width: number;
  height: number;
  uri?: string;
}

export interface CollageRendererProps {
  cells: CollageLayoutCell[];
  canvasWidth: number;
  canvasHeight: number;
  width: number;
  height: number;
  onCellClick?: (index: number) => void;
  selectedCell?: number;
  className?: string;
}

export default function CollageRenderer({
  cells,
  canvasWidth,
  canvasHeight,
  width,
  height,
  onCellClick,
  selectedCell,
  className,
}: CollageRendererProps) {
  const scaleX = width / canvasWidth;
  const scaleY = height / canvasHeight;

  return (
    <div
      className={cn('relative overflow-hidden rounded-lg bg-canvas-bg', className)}
      style={{ width, height }}
    >
      {cells.map((cell, index) => {
        const cellX = cell.x * scaleX;
        const cellY = cell.y * scaleY;
        const cellWidth = cell.width * scaleX;
        const cellHeight = cell.height * scaleY;
        const isSelected = selectedCell === index;

        return (
          <button
            key={index}
            onClick={() => onCellClick?.(index)}
            className={cn(
              'absolute overflow-hidden rounded-md transition-all',
              isSelected
                ? 'ring-2 ring-brand-primary ring-offset-1'
                : 'hover:ring-1 hover:ring-brand-primary/50'
            )}
            style={{
              left: cellX,
              top: cellY,
              width: cellWidth,
              height: cellHeight,
            }}
          >
            {cell.uri ? (
              <Image
                src={cell.uri}
                alt={`collage cell ${index + 1}`}
                className="h-full w-full object-cover"
                width={cellWidth}
                height={cellHeight}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-muted text-secondary">
                <LuImageOff className="h-8 w-8" />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}