'use client';

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils/cn';
import type { ImageLayerCollageCell } from '@/types';
import Image from 'next/image';

export interface CollageCellImageProps {
  cell: ImageLayerCollageCell;
  /** Cell frame width in px (the clipping mask size, in real canvas coords) */
  cellWidth: number;
  /** Cell frame height in px (the clipping mask size, in real canvas coords) */
  cellHeight: number;
  /** Scale factor applied to everything for preview rendering (1 = real canvas size) */
  displayScale?: number;
  className?: string;
  /** Called when natural dimensions are measured (for caching in parent) */
  onDimensionsLoaded?: (index: number, w: number, h: number) => void;
  /** Cell index — passed to onDimensionsLoaded */
  index?: number;
}

/**
 * Shared collage cell image renderer — used by BOTH LayerRenderer (canvas) and
 * CollageEditModal (preview) so the image always looks identical everywhere.
 *
 * Scale convention: `cell.scale = 1.0` means "100% zoom = image fills the box"
 * (cover mode). This is the default for new/replaced/reset images.
 *
 * How it works:
 * - `object-fit: scale-down` renders the image at contain-scale (full image
 *   visible, letterboxed if aspect ratios differ).
 * - `fillScale = coverScale / containScale` is the multiplier that takes the
 *   image from contain → cover (fills the cell).
 * - The CSS transform applies `scale(cell.scale * fillScale)`:
 *     cell.scale = 1.0  →  scale(fillScale)  →  fills box (100%)
 *     cell.scale = 0.5  →  scale(fillScale * 0.5)  →  zoomed out, more visible
 *     cell.scale = 2.0  →  scale(fillScale * 2)  →  zoomed in 2× past cover
 * - `cell.offsetX/Y` pan the image (stored in real canvas px).
 * - The cell's `overflow: hidden` clips everything outside the frame.
 */
export default function CollageCellImage({
  cell,
  cellWidth,
  cellHeight,
  displayScale = 1,
  className,
  onDimensionsLoaded,
  index,
}: CollageCellImageProps) {
  const [natW, setNatW] = useState(cell.naturalWidth ?? 0);
  const [natH, setNatH] = useState(cell.naturalHeight ?? 0);

  const measure = useCallback((img: HTMLImageElement) => {
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      setNatW(img.naturalWidth);
      setNatH(img.naturalHeight);
      if (onDimensionsLoaded && index !== undefined) {
        onDimensionsLoaded(index, img.naturalWidth, img.naturalHeight);
      }
    }
  }, [onDimensionsLoaded, index]);

  // Ref callback — handles cached images where onLoad already fired
  const refCallback = useCallback((img: HTMLImageElement | null) => {
    if (img && img.complete && img.naturalWidth > 0 && natW === 0) {
      measure(img);
    }
  }, [measure, natW]);

  const handleLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    measure(e.currentTarget);
  }, [measure]);

  // fillScale: the multiplier from contain → cover.
  // At cell.scale=1, transform scale = fillScale → image fills the cell.
  const hasNat = natW > 0 && natH > 0;
  const containScale = hasNat ? Math.min(cellWidth / natW, cellHeight / natH) : 1;
  const coverScale = hasNat ? Math.max(cellWidth / natW, cellHeight / natH) : 1;
  const fillScale = containScale > 0 ? coverScale / containScale : 1;
  const transformScale = (cell.scale ?? 1) * fillScale;

  // Offsets are stored in real-canvas px; scale down for preview display
  const offX = cell.offsetX * displayScale;
  const offY = cell.offsetY * displayScale;

  return (
    <Image
      ref={refCallback}
      src={cell.uri}
      alt=""
      draggable={false}
      onLoad={handleLoad}
      className={cn('pointer-events-none h-full w-full select-none', className)}
      style={{
        objectFit: 'scale-down' as const,
        transform: `translate(${offX}px, ${offY}px) scale(${transformScale}) rotate(${cell.rotation ?? 0}deg)`,
        transformOrigin: 'center',
      }}
      width={cellWidth}
      height={cellHeight}
      loading='eager'
    />
  );
}

/**
 * Compute the clamp bounds for a collage cell image.
 *
 * With the normalized scale convention (1.0 = cover/fill), the displayed size is:
 *   coverScale = max(cellW / natW, cellH / natH)
 *   displayW = natW * coverScale * cell.scale
 *   displayH = natH * coverScale * cell.scale
 *
 * At cell.scale=1: displayW >= cellW (cover), so panning is possible.
 * At cell.scale < containScale/coverScale: displayW < cellW, no panning.
 */
export function getCellClampBounds(
  natW: number,
  natH: number,
  cellW: number,
  cellH: number,
  scale: number
): { maxX: number; maxY: number } {
  if (natW <= 0 || natH <= 0) return { maxX: 0, maxY: 0 };
  const coverScale = Math.max(cellW / natW, cellH / natH);
  const displayW = natW * coverScale * scale;
  const displayH = natH * coverScale * scale;
  return {
    maxX: Math.max(0, (displayW - cellW) / 2),
    maxY: Math.max(0, (displayH - cellH) / 2),
  };
}

/**
 * Clamp pan offsets so the image can't be dragged into empty space.
 */
export function clampCellOffset(
  offsetX: number,
  offsetY: number,
  maxX: number,
  maxY: number
): { offsetX: number; offsetY: number } {
  return {
    offsetX: Math.min(maxX, Math.max(-maxX, offsetX)),
    offsetY: Math.min(maxY, Math.max(-maxY, offsetY)),
  };
}
