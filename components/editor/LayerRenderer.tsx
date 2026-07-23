'use client';

import { useRef, useLayoutEffect, useState, useMemo } from 'react';
import { LuRefreshCw, LuLoaderCircle, LuImage } from 'react-icons/lu';
import type { AnyLayer, TextLayer, ImageLayer, ShapeLayer, DynamicFieldLayer } from '@/types';
import { cn } from '@/lib/utils/cn';
import { resolveFontFamily } from '@/lib/constants/fonts';
import { COLLAGE_LAYOUTS } from '@/lib/constants/presets';
import ShapeRenderer from './ShapeRenderer';
import CollageCellImage from './CollageCellImage';
import Image from 'next/image';

export interface LayerRendererProps {
  layer: AnyLayer;
  isSelected?: boolean;
  dangerZone?: boolean;
  /** When true, use thumbnailUri instead of uri for image layers (for galleries/lists) */
  useThumbnail?: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
  onLayerChange?: (id: string, updates: Partial<AnyLayer>, recordHistory?: boolean) => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
  /** Retry a failed background upload for this layer */
  onRetryUpload?: (id: string) => void;
}

interface LayerComponentProps extends LayerRendererProps {
  className: string;
  style: React.CSSProperties;
}

/**
 * Overlay shown on image layers while a background upload is in progress
 * or has failed. For 'uploading', shows a small spinner badge. For 'error',
 * shows a tappable "re-upload" button so the user can retry.
 */
function UploadStatusOverlay({ layer, onRetryUpload }: { layer: ImageLayer; onRetryUpload?: (id: string) => void }) {
  if (!layer.uploadStatus) return null;
  if (layer.uploadStatus === 'uploading') {
    return (
      <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-end p-1.5">
        <div className="flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] font-medium text-white backdrop-blur-sm">
          <LuLoaderCircle className="h-3 w-3 animate-spin" />
        </div>
      </div>
    );
  }
  // error
  return (
    <div className="absolute inset-0 z-10 flex items-start justify-end p-1.5">
      <button
        type="button"
        onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
        onClick={(e) => {
          e.stopPropagation();
          onRetryUpload?.(layer.id);
        }}
        className="flex items-center gap-1 rounded-full bg-error px-2 py-1 text-[10px] font-semibold text-white shadow-lg transition-transform active:scale-95"
        aria-label="Re-upload"
      >
        <LuRefreshCw className="h-3 w-3" />
      </button>
    </div>
  );
}

export default function LayerRenderer({ layer, isSelected, dangerZone, useThumbnail, onPointerDown, onLayerChange, onDoubleClick, onRetryUpload }: LayerRendererProps) {
  const baseStyles = cn(
    'absolute cursor-move select-none touch-none',
    !layer.visible && 'hidden',
    layer.locked && 'cursor-not-allowed',
    isSelected && 'ring-2 ring-layer-selected',
    dangerZone && 'ring-2 ring-error shadow-[0_0_12px_2px_rgba(239,68,68,0.5)] animate-pulse'
  );

  const commonProps = {
    'data-layer-id': layer.id,
    className: baseStyles,
    style: {
      left: layer.x,
      top: layer.y,
      width: layer.width,
      height: layer.height,
      transform: `translate3d(0, 0, 0) rotate(${layer.rotation}deg)`,
      opacity: layer.opacity,
      zIndex: layer.zIndex,
      willChange: 'transform',
    },
    onPointerDown,
    onLayerChange,
    onDoubleClick,
  };

  switch (layer.type) {
    case 'text':
      return <TextLayerComponent layer={layer as TextLayer} {...commonProps} />;
    case 'image':
      return <ImageLayerComponent layer={layer as ImageLayer} useThumbnail={useThumbnail} onRetryUpload={onRetryUpload} {...commonProps} />;
    case 'shape':
      return <ShapeLayerComponent layer={layer as ShapeLayer} {...commonProps} />;
    case 'dynamic_field':
      return <DynamicFieldLayerComponent layer={layer as DynamicFieldLayer} {...commonProps} />;
    default:
      return null;
  }
}

function TextLayerComponent({ layer, className, style, onPointerDown, onLayerChange, onDoubleClick }: LayerComponentProps & { layer: TextLayer }) {
  const measureRef = useRef<HTMLDivElement>(null);
  // Track the last measured size to avoid redundant updates
  const lastMeasuredRef = useRef({ w: 0, h: 0 });
  // Track previous fontSize to detect resize vs content change
  const prevFontSizeRef = useRef(layer.fontSize);

  const hasBoxWidth = layer.boxWidth !== undefined && layer.boxWidth > 0;

  // Measure actual text content and resize the layer box to fit tightly.
  // useLayoutEffect runs BEFORE the browser paints, so the user never sees
  // an intermediate frame where fontSize changed but width/height didn't.
  // No rAF needed — synchronous measurement eliminates flicker entirely.
  // Skip auto-measure when boxWidth is set — the user controls the width.
  useLayoutEffect(() => {
    if (!onLayerChange || hasBoxWidth) return;
    const el = measureRef.current;
    if (!el) return;

    const w = Math.ceil(el.scrollWidth);
    const h = Math.ceil(el.scrollHeight);
    if (w <= 0 || h <= 0) return;

    // Only update if the measured size actually changed since last time
    if (w !== lastMeasuredRef.current.w || h !== lastMeasuredRef.current.h) {
      const oldW = lastMeasuredRef.current.w;
      const oldH = lastMeasuredRef.current.h;
      const isFirstMeasure = oldW === 0 && oldH === 0;
      lastMeasuredRef.current = { w, h };
      // On the first measure (initial mount / project reopen), just record
      // the size WITHOUT calling onLayerChange. The layer already has the
      // correct width/height/x/y from the saved project — re-centering here
      // would shift the text by half its size (oldW=0 → newX = x - w/2).
      if (isFirstMeasure) {
        prevFontSizeRef.current = layer.fontSize;
        return;
      }
      // Only re-center when text content changed (not font size).
      // Font size changes are handled by the slider/resize handler
      // which already adjust x/y — re-centering here would fight them.
      const fontSizeChanged = prevFontSizeRef.current !== layer.fontSize;
      if (fontSizeChanged) {
        onLayerChange(layer.id, { width: w, height: h }, false);
      } else {
        const newX = layer.x + (oldW - w) / 2;
        const newY = layer.y + (oldH - h) / 2;
        onLayerChange(layer.id, { width: w, height: h, x: newX, y: newY }, false);
      }
    }
    prevFontSizeRef.current = layer.fontSize;
    // Only re-measure when text content or font properties change —
    // deliberately exclude width/height to prevent feedback loops.
  }, [layer.text, layer.fontSize, layer.fontFamily, layer.bold, layer.italic, layer.lineHeight, layer.direction, onLayerChange, layer.id, hasBoxWidth, layer.x, layer.y]);

  // When boxWidth is set, measure height only (width is user-controlled)
  useLayoutEffect(() => {
    if (!onLayerChange || !hasBoxWidth) return;
    const el = measureRef.current;
    if (!el) return;

    const h = Math.ceil(el.scrollHeight);
    if (h <= 0) return;

    if (h !== lastMeasuredRef.current.h) {
      const oldH = lastMeasuredRef.current.h;
      const isFirstMeasure = oldH === 0;
      lastMeasuredRef.current = { w: layer.boxWidth!, h };
      // On the first measure (initial mount / project reopen), just record
      // the size WITHOUT calling onLayerChange — the saved height/y are correct.
      if (isFirstMeasure) {
        prevFontSizeRef.current = layer.fontSize;
        return;
      }
      // Font size changes are handled by handleFontSizeChange which already
      // adjusts x/y/height/boxWidth — only update height here, don't re-center.
      const fontSizeChanged = prevFontSizeRef.current !== layer.fontSize;
      if (fontSizeChanged) {
        onLayerChange(layer.id, { height: h }, false);
      } else {
        // Keep vertical center fixed
        const newY = layer.y + (oldH - h) / 2;
        onLayerChange(layer.id, { height: h, y: newY }, false);
      }
    }
    prevFontSizeRef.current = layer.fontSize;
  }, [layer.text, layer.fontSize, layer.fontFamily, layer.bold, layer.italic, layer.lineHeight, layer.direction, layer.boxWidth, onLayerChange, layer.id, hasBoxWidth, layer.y]);

  return (
    <div
      className={className}
      style={{
        ...style,
        color: layer.color,
        fontFamily: resolveFontFamily(layer.fontFamily),
        fontSize: layer.fontSize,
        fontWeight: layer.bold ? 700 : (layer.fontWeight || 400),
        fontStyle: layer.italic ? 'italic' : 'normal',
        textAlign: layer.align,
        lineHeight: layer.lineHeight,
        direction: layer.direction as React.CSSProperties['direction'],
        display: 'flex',
        alignItems: layer.verticalAlign === 'top' ? 'flex-start' : layer.verticalAlign === 'bottom' ? 'flex-end' : 'center',
        justifyContent: layer.align,
        whiteSpace: hasBoxWidth ? 'pre-wrap' : 'pre',
        wordBreak: hasBoxWidth ? 'break-word' : 'normal',
        overflowWrap: hasBoxWidth ? 'anywhere' : 'normal',
        overflow: 'visible',
        ...(hasBoxWidth ? { width: layer.boxWidth } : {}),
      }}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Hidden measuring element — completely independent of the layer's
          width/height so measurement only depends on text + font properties.
          Positioned off-screen so it never affects layout. */}
      <div
        ref={measureRef}
        style={{
          position: 'fixed',
          left: -9999,
          top: -9999,
          visibility: 'hidden',
          whiteSpace: hasBoxWidth ? 'pre-wrap' : 'pre',
          wordBreak: hasBoxWidth ? 'break-word' : 'normal',
          overflowWrap: hasBoxWidth ? 'anywhere' : 'normal',
          ...(hasBoxWidth ? { width: layer.boxWidth } : {}),
          color: layer.color,
          fontFamily: resolveFontFamily(layer.fontFamily),
          fontSize: layer.fontSize,
          fontWeight: layer.bold ? 700 : (layer.fontWeight || 400),
          fontStyle: layer.italic ? 'italic' : 'normal',
          lineHeight: layer.lineHeight,
          direction: layer.direction as React.CSSProperties['direction'],
          pointerEvents: 'none',
        }}
      >
        {layer.text || ' '}
      </div>
      {layer.text}
    </div>
  );
}

function ImageLayerComponent({ layer, className, style, useThumbnail, onPointerDown, onDoubleClick, onRetryUpload }: LayerComponentProps & { layer: ImageLayer; useThumbnail?: boolean; onRetryUpload?: (id: string) => void }) {
  // Use thumbnail for galleries/lists when available (smaller payload)
  const displayUri = (useThumbnail && layer.thumbnailUri) ? layer.thumbnailUri : layer.uri;
  // Collage rendering
  if (layer.collage) {
    const layout = COLLAGE_LAYOUTS.find(l => l.id === layer.collage!.layout) || COLLAGE_LAYOUTS[0];
    const gap = layer.collage.gap ?? 4;
    const bgColor = layer.collage.bgColor ?? '#000000';
    const containerRadius = layer.collage.containerRadius ?? 0;
    return (
      <div
        className={className}
        style={{
          ...style,
          borderRadius: containerRadius,
          border: 'none',
          overflow: 'hidden',
          backgroundColor: bgColor,
          transform: `${style.transform} scaleX(${layer.flipX ? -1 : 1}) scaleY(${layer.flipY ? -1 : 1})`,
        }}
        onPointerDown={onPointerDown}
        onDoubleClick={onDoubleClick}
        onClick={(e) => e.stopPropagation()}
      >
        {layout.cells.map((cellDef, i) => {
          const cell = layer.collage!.cells[i];
          const cellUri = cell?.uri;
          const cellW = cellDef.w * layer.width - gap;
          const cellH = cellDef.h * layer.height - gap;
          const cellX = cellDef.x * layer.width + gap / 2;
          const cellY = cellDef.y * layer.height + gap / 2;
          return (
            <div
              key={i}
              className="pointer-events-none absolute overflow-hidden bg-muted"
              style={{
                left: cellX,
                top: cellY,
                width: cellW,
                height: cellH,
                borderRadius: layer.borderRadius,
              }}
            >
              {cellUri ? (
                <CollageCellImage
                  cell={cell}
                  cellWidth={cellW}
                  cellHeight={cellH}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-muted" />
              )}
            </div>
          );
        })}
        <UploadStatusOverlay layer={layer} onRetryUpload={onRetryUpload} />
      </div>
    );
  }

  // Single image rendering — non-destructive crop via CSS
  // When cropRect is set, we show only the cropped region of the original image
  // by using background-image with precise positioning. The original image is never modified.
  const hasCrop = !!layer.cropRect;
  const crop = layer.cropRect;

  if (hasCrop) {
    // Non-destructive crop: use background-image to show only the crop region.
    // The background is the ORIGINAL full image (layer.uri), so backgroundSize
    // must use the ORIGINAL dimensions (originalNaturalWidth/Height), not the
    // cropped ones (naturalWidth/Height which were updated to cropRect size).
    const origW = layer.originalNaturalWidth || layer.naturalWidth;
    const origH = layer.originalNaturalHeight || layer.naturalHeight;
    const scaledW = origW * layer.imageScale;
    const scaledH = origH * layer.imageScale;
    const bgX = -(crop!.x * layer.imageScale) + layer.offsetX;
    const bgY = -(crop!.y * layer.imageScale) + layer.offsetY;
    return (
      <div
        className={className}
        style={{
          ...style,
          borderRadius: layer.borderRadius,
          border: `${layer.borderWidth}px solid ${layer.borderColor}`,
          overflow: 'hidden',
          transform: `${style.transform} scaleX(${layer.flipX ? -1 : 1}) scaleY(${layer.flipY ? -1 : 1})`,
        }}
        onPointerDown={onPointerDown}
        onDoubleClick={onDoubleClick}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="pointer-events-none h-full w-full"
          style={{
            backgroundImage: `url(${displayUri})`,
            backgroundSize: `${scaledW}px ${scaledH}px`,
            backgroundPosition: `${bgX}px ${bgY}px`,
            backgroundRepeat: 'no-repeat',
            userSelect: 'none',
          }}
        />
        <UploadStatusOverlay layer={layer} onRetryUpload={onRetryUpload} />
      </div>
    );
  }

  // No crop — standard image rendering
  return (
    <div
      className={className}
      style={{
        ...style,
        borderRadius: layer.borderRadius,
        border: `${layer.borderWidth}px solid ${layer.borderColor}`,
        overflow: 'hidden',
        transform: `${style.transform} scaleX(${layer.flipX ? -1 : 1}) scaleY(${layer.flipY ? -1 : 1})`,
      }}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      onClick={(e) => e.stopPropagation()}
    >
      <Image
        src={displayUri}
        alt="Layer"
        draggable={false}
        className="pointer-events-none select-none"
        style={{
          width: layer.naturalWidth * layer.imageScale,
          height: layer.naturalHeight * layer.imageScale,
          objectFit: 'cover',
          transform: `translate(${layer.offsetX}px, ${layer.offsetY}px)`,
          userSelect: 'none',
        }}
        width={layer.naturalWidth * layer.imageScale}
        height={layer.naturalHeight * layer.imageScale}
        loading="eager"
      />
      <UploadStatusOverlay layer={layer} onRetryUpload={onRetryUpload} />
    </div>
  );
}

function ShapeLayerComponent({ layer, className, style, onPointerDown }: LayerComponentProps & { layer: ShapeLayer }) {
  return (
    <div
      className={className}
      style={{
        ...style,
        backgroundColor: 'transparent',
      }}
      onPointerDown={onPointerDown}
      onClick={(e) => e.stopPropagation()}
    >
      <ShapeRenderer
        shape={layer.shape}
        width={layer.width}
        height={layer.height}
        fillColor={layer.fillColor}
        strokeColor={layer.strokeColor}
        strokeWidth={layer.strokeWidth}
        filled={layer.filled}
        cornerRadius={layer.cornerRadius}
        uri={layer.uri}
        className="h-full w-full"
      />
    </div>
  );
}

function DynamicFieldLayerComponent({ layer, className, style, onPointerDown }: LayerComponentProps & { layer: DynamicFieldLayer }) {
  const containerStyle: React.CSSProperties = {
    ...style,
    backgroundColor: layer.backgroundColor || 'transparent',
    border: `${layer.borderWidth ?? 0}px solid ${layer.borderColor ?? 'transparent'}`,
    borderRadius: layer.borderRadius ?? 0,
    overflow: 'hidden',
  };

  if (layer.fieldType === 'image') {
    return <DynamicFieldImage layer={layer} className={className} style={containerStyle} onPointerDown={onPointerDown} />;
  }

  return <DynamicFieldText layer={layer} className={className} style={containerStyle} onPointerDown={onPointerDown} />;
}

/**
 * Text dynamic field — auto-shrinks the font size so the placeholder
 * text always fits inside the box. The user can resize the box freely;
 * the text scales down (never up beyond the set fontSize) to fit.
 */
function DynamicFieldText({ layer, className, style, onPointerDown }: LayerComponentProps & { layer: DynamicFieldLayer }) {
  const measureRef = useRef<HTMLDivElement>(null);
  const [adjustedFontSize, setAdjustedFontSize] = useState(layer.fontSize);

  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;

    const boxW = el.clientWidth;
    const boxH = el.clientHeight;
    if (boxW <= 0 || boxH <= 0) return;

    // Binary search for the largest font size that fits
    let lo = 4;
    let hi = layer.fontSize;
    let best = lo;

    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      el.style.fontSize = `${mid}px`;
      const fits = el.scrollWidth <= boxW && el.scrollHeight <= boxH;
      if (fits) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    el.style.fontSize = ''; // reset — we set it via state
    setAdjustedFontSize(best);
  }, [layer.fontSize, layer.placeholder, layer.width, layer.height]);

  return (
    <div
      className={className}
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: layer.color,
        fontSize: adjustedFontSize,
        direction: 'rtl',
        textAlign: 'center',
        wordBreak: 'break-word',
        padding: '2px 4px',
      }}
      onPointerDown={onPointerDown}
      onClick={(e) => e.stopPropagation()}
    >
      <div ref={measureRef} style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', overflow: 'hidden' }}>
        {layer.placeholder}
      </div>
    </div>
  );
}

/**
 * Image dynamic field — shows an image placeholder that fills the box
 * with object-fit: cover. If the field supports multiple photos
 * (collageLayout is set), shows a collage preview of the layout.
 */
function DynamicFieldImage({ layer, className, style, onPointerDown }: LayerComponentProps & { layer: DynamicFieldLayer }) {
  // Find the collage layout if one is set
  const layout = useMemo(
    () => COLLAGE_LAYOUTS.find((l) => l.id === layer.collageLayout),
    [layer.collageLayout],
  );

  // Single image placeholder
  if (!layout) {
    return (
      <div
        className={className}
        style={{
          ...style,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onPointerDown={onPointerDown}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex h-full w-full items-center justify-center"
          style={{
            background: 'repeating-linear-gradient(45deg, #e5e7eb, #e5e7eb 8px, #f3f4f6 8px, #f3f4f6 16px)',
          }}
        >
          <div className="flex flex-col items-center gap-1 opacity-50">
            <LuImage className="h-1/3 w-1/3" style={{ maxHeight: 40, maxWidth: 40 }} />
            <span className="text-[10px] text-secondary">{layer.placeholder}</span>
          </div>
        </div>
      </div>
    );
  }

  // Collage preview — show the layout cells with placeholder backgrounds
  const gap = layer.collageGap ?? 4;
  return (
    <div
      className={className}
      style={{
        ...style,
        display: 'flex',
        padding: 0,
      }}
      onPointerDown={onPointerDown}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="relative h-full w-full" style={{ padding: gap / 2 }}>
        {layout.cells.map((cell, i) => (
          <div
            key={i}
            className="absolute flex items-center justify-center"
            style={{
              left: `calc(${cell.x * 100}% + ${gap / 2}px)`,
              top: `calc(${cell.y * 100}% + ${gap / 2}px)`,
              width: `calc(${cell.w * 100}% - ${gap}px)`,
              height: `calc(${cell.h * 100}% - ${gap}px)`,
              background: 'repeating-linear-gradient(45deg, #e5e7eb, #e5e7eb 8px, #f3f4f6 8px, #f3f4f6 16px)',
              borderRadius: 4,
              overflow: 'hidden',
            }}
          >
            {i === 0 && (
              <div className="flex flex-col items-center gap-0.5 opacity-50">
                <LuImage className="h-5 w-5" />
                <span className="text-[8px] text-secondary">{layer.placeholder}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}