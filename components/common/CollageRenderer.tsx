'use client';

import { cn } from '@/lib/utils/cn';

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
              <img
                src={cell.uri}
                alt={`collage cell ${index + 1}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-muted text-secondary">
                <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}