'use client';

import { useRef, useLayoutEffect, useState, useMemo, useEffect } from 'react';
import { LuRefreshCw, LuLoaderCircle, LuImage } from 'react-icons/lu';
import type { AnyLayer, TextLayer, ImageLayer, ShapeLayer, DynamicFieldLayer } from '@/types';
import { cn } from '@/lib/utils/cn';
import { resolveFontFamily } from '@/lib/constants/fonts';
import { COLLAGE_LAYOUTS } from '@/lib/constants/presets';
import { ORDER_FIELD_MAP } from '@/lib/constants/order-fields';
import ShapeRenderer from './ShapeRenderer';
import CollageCellImage from './CollageCellImage';
import Image from 'next/image';

// ─── Gender symbol rendering (client-side) ───────────────────────────────
// Gender symbols (♂ ♀) are rendered as SVG images from R2 instead of
// Unicode text, so the editor preview matches the server-rendered output
// exactly. The SVGs are:
//   ♂ → https://storage.manasik.net/design/shapes/genderM.svg
//   ♀ → https://storage.manasik.net/design/shapes/genderF.svg
const GENDER_SVG_MALE = 'https://storage.manasik.net/design/shapes/genderM.svg';
const GENDER_SVG_FEMALE = 'https://storage.manasik.net/design/shapes/genderF.svg';

/**
 * Check if a string is a gender symbol (♂, ♀), ignoring any leading
 * RLM (U+200F) or whitespace. Returns 'male', 'female', or undefined.
 * Note: "both" (♀♂/♂♀) is NOT supported — the field is hidden for both.
 */
function getGenderSymbolKind(text: string): 'male' | 'female' | undefined {
  const stripped = text.replace(/[\u200F\s]/g, '');
  if (stripped === '♂') return 'male';
  if (stripped === '♀') return 'female';
  return undefined;
}

/**
 * Render a gender symbol as an inline <img> sized to match the font.
 * Falls back to the Unicode character if the SVG fails to load.
 */
function GenderSymbolImg({ symbol, fontSize, color }: { symbol: 'male' | 'female'; fontSize: number; color?: string }) {
  const src = symbol === 'male' ? GENDER_SVG_MALE : GENDER_SVG_FEMALE;
  const fallbackChar = symbol === 'male' ? '♂' : '♀';
  return (
    // eslint-disable-next-line @next/next/no-img-element -- intentional: tiny inline SVG icon needs synchronous rendering with onError fallback, not next/image optimization
    <img
      src={src}
      alt={fallbackChar}
      style={{
        height: `${fontSize}px`,
        width: 'auto',
        display: 'inline-block',
        verticalAlign: 'middle',
        // Apply the layer color via CSS filter (SVGs are black, we tint them)
        // This works for simple monochrome SVGs.
        ...(color && color !== '#000000' ? { filter: `brightness(0) saturate(100%) ${colorToFilter(color)}` } : {}),
      }}
      onError={(e) => {
        // Fallback: replace the broken image with the Unicode character
        const img = e.currentTarget;
        const parent = img.parentElement;
        if (parent) {
          parent.textContent = fallbackChar;
        }
      }}
    />
  );
}

/**
 * Convert a hex color to a CSS filter that tints a black SVG.
 * Uses the technique: brightness(0) saturate(100%) + sepia + hue-rotate.
 */
function colorToFilter(hex: string): string {
  // Parse hex color (#RGB or #RRGGBB)
  const m = hex.match(/^#?([\da-f]{3}|[\da-f]{6})$/i);
  if (!m) return '';
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  // Convert RGB to HSL
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let s = 0;
  let hue = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: hue = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: hue = ((b - r) / d + 2) / 6; break;
      case b: hue = ((r - g) / d + 4) / 6; break;
    }
  }
  const hueDeg = hue * 360;
  const satPct = s * 100;
  return `sepia(1) saturate(${satPct}) hue-rotate(${hueDeg}deg)`;
}

/**
 * Render text content, replacing gender symbols (♂ ♀) with SVG images.
 * Non-symbol text is rendered as-is.
 */
function renderTextWithGenderSymbols(text: string, fontSize: number, color?: string): React.ReactNode {
  const symbol = getGenderSymbolKind(text);
  if (symbol) {
    return <GenderSymbolImg symbol={symbol} fontSize={fontSize} color={color} />;
  }
  return text;
}

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
      // Use inline display:none instead of Tailwind 'hidden' class —
      // child components set display:flex in inline styles which would
      // override the class-based display:none.
      display: layer.visible ? undefined : 'none',
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

// ─── Auto-fit font size hook ──────────────────────────────────────────────
// Finds the largest font size where text fits inside the box, using binary
// search. To keep resizing smooth AND accurate on every frame:
//   1. Computes an instant proportional estimate during render (scales the
//      previous result by the box ratio — no measurement needed)
//   2. Runs a BOUNDED binary search synchronously in useLayoutEffect, starting
//      from a narrow range around the estimate (±40%). Only 6 iterations
//      needed → minimal reflows → no flicker, but size updates every frame.
function useAutoFitFontSize(
  textRef: React.RefObject<HTMLDivElement | null>,
  text: string,
  boxWidth: number,
  boxHeight: number,
  deps: React.DependencyList,
  onConverged?: (size: number) => void,
): number {
  // State holds the last binary-searched font size + the box dimensions it
  // was measured against. Used to compute a proportional estimate during
  // render when the box changes (before the binary search runs).
  const [measured, setMeasured] = useState({ w: 0, h: 0, size: 16 });

  // Keep the callback in a ref so the layout effect always calls the
  // latest version without re-triggering on every render.
  const onConvergedRef = useRef(onConverged);
  useEffect(() => { onConvergedRef.current = onConverged; });

  // Instant proportional estimate — computed during render from STATE.
  // When the box dimensions change, scale the last known font size by the
  // geometric mean of the width/height ratios. Not rounded so even small
  // box changes produce a visible size change.
  let renderSize = measured.size;
  if (measured.w > 0 && measured.h > 0 && (measured.w !== boxWidth || measured.h !== boxHeight)) {
    const ratio = Math.sqrt((boxWidth / measured.w) * (boxHeight / measured.h));
    renderSize = Math.max(1, measured.size * ratio);
  }

  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const boxW = el.clientWidth;
    const boxH = el.clientHeight;
    if (boxW <= 0 || boxH <= 0) return;

    // Full-range binary search over [1, max(boxW, boxH)] to find the
    // largest font size where the text fits within the box. This matches
    // the server-side renderer's approach and guarantees the optimal size
    // is found regardless of the initial estimate. ~10 iterations for a
    // 1000px box — fast enough to avoid visible flicker.
    let lo = 1;
    let hi = Math.ceil(Math.max(boxW, boxH));
    let best = lo;
    while (lo <= hi) {
      const mid = (lo + hi) / 2;
      el.style.fontSize = `${mid}px`;
      const fits = el.scrollWidth <= boxW && el.scrollHeight <= boxH;
      if (fits) { best = mid; lo = mid + 1; } else { hi = mid - 1; }
    }
    el.style.fontSize = '';
    const result = Math.max(1, Math.floor(best));
    setMeasured({ w: boxW, h: boxH, size: result });
    // Notify the caller synchronously (before paint) with the calculated
    // size. This is used by the design editor to "bake" the auto-fit size
    // into the layer's fontSize and remove autoFit.
    if (onConvergedRef.current) onConvergedRef.current(result);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return renderSize;
}

function TextLayerComponent({ layer, className, style, onPointerDown, onLayerChange, onDoubleClick }: LayerComponentProps & { layer: TextLayer }) {
  const measureRef = useRef<HTMLDivElement>(null);
  const autoFitTextRef = useRef<HTMLDivElement>(null);
  // Track the last measured size to avoid redundant updates
  const lastMeasuredRef = useRef({ w: 0, h: 0 });
  // Track previous fontSize to detect resize vs content change
  const prevFontSizeRef = useRef(layer.fontSize);
  // Track whether we've already baked the auto-fit size into the layer
  const bakedAutoFitRef = useRef(false);

  const hasBoxWidth = layer.boxWidth !== undefined && layer.boxWidth > 0;
  const isAutoFit = layer.autoFit === true;

  // ── Auto-fit: binary search for the largest font that fits ────────
  // Uses the shared useAutoFitFontSize hook which returns an instant
  // proportional estimate during resize, then refines via binary search
  // in a requestAnimationFrame callback (smooth, no flicker).
  //
  // The onConverged callback "bakes" the calculated font size into the
  // layer: sets fontSize to the calculated value, removes autoFit, and
  // sets boxWidth to the layer's width so the normal text path wraps
  // text at the box boundary. This runs synchronously inside the hook's
  // useLayoutEffect (before paint) with the correct calculated value.
  // After baking, the text renders via the normal text path with a
  // concrete font size — resizing the box re-flows the text but keeps
  // the font size fixed, just like a normal text layer.
  const autoFitFontSize = useAutoFitFontSize(
    autoFitTextRef,
    layer.text || '',
    layer.width || 100,
    layer.height || 100,
    [isAutoFit, layer.text, layer.width, layer.height, layer.fontFamily, layer.bold, layer.italic, layer.align, layer.lineHeight, layer.direction],
    isAutoFit && onLayerChange ? (size: number) => {
      if (bakedAutoFitRef.current || size <= 1) return;
      bakedAutoFitRef.current = true;
      onLayerChange(layer.id, {
        fontSize: Math.round(size),
        autoFit: undefined,
        _needsInitialFit: false,
        boxWidth: layer.width,
      }, false);
    } : undefined,
  );

  // Measure actual text content and resize the layer box to fit tightly.
  // Skip when autoFit is true — the box stays fixed, font adjusts via CSS.
  // Skip when boxWidth is set — the user controls the width.
  useLayoutEffect(() => {
    if (!onLayerChange || hasBoxWidth || isAutoFit) return;
    const el = measureRef.current;
    if (!el) return;

    const w = Math.ceil(el.scrollWidth);
    const h = Math.ceil(el.scrollHeight);
    if (w <= 0 || h <= 0) return;

    if (w !== lastMeasuredRef.current.w || h !== lastMeasuredRef.current.h) {
      const isFirstMeasure = lastMeasuredRef.current.w === 0 && lastMeasuredRef.current.h === 0;
      // On the first measure, lastMeasuredRef is {0,0} — use the layer's
      // actual dimensions for recentering so the layer stays centered at
      // the same position as the original (template) box.
      const oldW = isFirstMeasure ? layer.width : lastMeasuredRef.current.w;
      const oldH = isFirstMeasure ? layer.height : lastMeasuredRef.current.h;
      lastMeasuredRef.current = { w, h };
      // On the very first measurement, normally skip the resize — the
      // box was already sized correctly when the user created the text.
      // But if this layer was inflated from a dynamic field (marked with
      // _needsInitialFit), the box was sized for autoFit and is much
      // bigger than the text at layer.fontSize. Shrink it now.
      if (isFirstMeasure && !layer._needsInitialFit) {
        prevFontSizeRef.current = layer.fontSize;
        return;
      }
      const fontSizeChanged = prevFontSizeRef.current !== layer.fontSize;
      // Strip the _needsInitialFit flag so it doesn't trigger again.
      const extra: Partial<TextLayer> = isFirstMeasure
        ? { _needsInitialFit: false }
        : {};
      if (fontSizeChanged) {
        onLayerChange(layer.id, { width: w, height: h, ...extra }, false);
      } else {
        const newX = layer.x + (oldW - w) / 2;
        const newY = layer.y + (oldH - h) / 2;
        onLayerChange(layer.id, { width: w, height: h, x: newX, y: newY, ...extra }, false);
      }
    }
    prevFontSizeRef.current = layer.fontSize;
  }, [layer.text, layer.fontSize, layer.fontFamily, layer.bold, layer.italic, layer.lineHeight, layer.direction, onLayerChange, layer.id, hasBoxWidth, isAutoFit, layer.x, layer.y, layer.width, layer.height, layer._needsInitialFit]);

  // When boxWidth is set, measure height only (width is user-controlled)
  useLayoutEffect(() => {
    if (!onLayerChange || !hasBoxWidth || isAutoFit) return;
    const el = measureRef.current;
    if (!el) return;

    const h = Math.ceil(el.scrollHeight);
    if (h <= 0) return;

    if (h !== lastMeasuredRef.current.h) {
      const oldH = lastMeasuredRef.current.h;
      const isFirstMeasure = oldH === 0;
      lastMeasuredRef.current = { w: layer.boxWidth!, h };
      if (isFirstMeasure) {
        prevFontSizeRef.current = layer.fontSize;
        return;
      }
      const fontSizeChanged = prevFontSizeRef.current !== layer.fontSize;
      if (fontSizeChanged) {
        onLayerChange(layer.id, { height: h }, false);
      } else {
        const newY = layer.y + (oldH - h) / 2;
        onLayerChange(layer.id, { height: h, y: newY }, false);
      }
    }
    prevFontSizeRef.current = layer.fontSize;
  }, [layer.text, layer.fontSize, layer.fontFamily, layer.bold, layer.italic, layer.lineHeight, layer.direction, layer.boxWidth, onLayerChange, layer.id, hasBoxWidth, isAutoFit, layer.y]);

  // ── Auto-fit render path ──────────────────────────────────────────
  // Binary search finds the largest font size that fills the box.
  if (isAutoFit) {
    return (
      <div
        className={className}
        style={{
          ...style,
          color: layer.color,
          fontFamily: resolveFontFamily(layer.fontFamily),
          fontWeight: layer.bold ? 700 : (layer.fontWeight || 400),
          fontStyle: layer.italic ? 'italic' : 'normal',
          textAlign: layer.align,
          lineHeight: layer.lineHeight,
          direction: layer.direction as React.CSSProperties['direction'],
          display: style.display === 'none' ? 'none' : 'flex',
          alignItems: layer.verticalAlign === 'top' ? 'flex-start' : layer.verticalAlign === 'bottom' ? 'flex-end' : 'center',
          justifyContent: layer.align,
          wordBreak: 'break-word',
          overflowWrap: 'anywhere',
          overflow: 'hidden',
        }}
        onPointerDown={onPointerDown}
        onDoubleClick={onDoubleClick}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          ref={autoFitTextRef}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
            textAlign: layer.align,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            overflowWrap: 'anywhere',
            overflow: 'hidden',
            fontSize: `${autoFitFontSize}px`,
          }}
        >
          {renderTextWithGenderSymbols(layer.text, autoFitFontSize, layer.color)}
        </div>
      </div>
    );
  }

  // ── Normal text render path ───────────────────────────────────────
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
        display: style.display === 'none' ? 'none' : 'flex',
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
      {renderTextWithGenderSymbols(layer.text, layer.fontSize, layer.color)}
    </div>
  );
}

function ImageLayerComponent({ layer, className, style, useThumbnail, onPointerDown, onDoubleClick, onRetryUpload }: LayerComponentProps & { layer: ImageLayer; useThumbnail?: boolean; onRetryUpload?: (id: string) => void }) {
  // Use thumbnail for galleries/lists when available (smaller payload)
  let displayUri = (useThumbnail && layer.thumbnailUri) ? layer.thumbnailUri : layer.uri;
  // Safety: if uri is a JSON-encoded array of URLs (e.g. reservation.photo
  // with multiple pictures), extract the first URL.
  if (displayUri && displayUri.startsWith('[')) {
    try {
      const parsed = JSON.parse(displayUri);
      if (Array.isArray(parsed) && parsed.length > 0) {
        displayUri = parsed[0] as string;
      }
    } catch { /* not JSON, use as-is */ }
  }
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
        unoptimized
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
 * Text dynamic field — the font size auto-fills the box based on the
 * text content + box dimensions. The saved fontSize is NOT used.
 *
 * Uses CSS Container Queries (cqw/cqh units) for instant responsive
 * sizing with NO JavaScript measurement. A tiny JS safety net
 * (useLayoutEffect) catches edge cases where the CSS formula overflows
 * and scales down by a few percent until it fits.
 */
function DynamicFieldText({ layer, className, style, onPointerDown }: LayerComponentProps & { layer: DynamicFieldLayer }) {
  const textRef = useRef<HTMLDivElement>(null);

  // Text properties with defaults (matching inflate-template.ts)
  const fontFamily = layer.fontFamily || 'Expo Arabic';
  const fontWeight = layer.fontWeight || 700;
  const bold = layer.bold ?? true;
  const italic = layer.italic ?? false;
  const align = layer.align || 'center';
  const verticalAlign = layer.verticalAlign || 'middle';
  const lineHeight = layer.lineHeight ?? 1.2;
  const direction = layer.direction || 'rtl';

  const hasCombined = layer.combinedFields && layer.combinedFields.length > 0;
  const combineDirection = layer.combineDirection ?? 'row';
  const fieldStyles = layer.combinedFieldStyles ?? {};
  const hasIndividualStyles = Object.keys(fieldStyles).length > 0;

  // All field IDs for combined fields
  const allFieldIds = hasCombined
    ? [layer.variableId, ...layer.combinedFields!]
    : [];

  // For combined fields, show all field labels joined together so the
  // user sees what the combined text will look like. The separator
  // respects the combine direction:
  //   row    → space (fields flow inline on one line, wrap naturally)
  //   column → newline (fields stacked vertically, each on its own line)
  const text = hasCombined
    ? allFieldIds
      .map((id) => ORDER_FIELD_MAP[id]?.label || ORDER_FIELD_MAP[id]?.placeholder || id)
      .join(combineDirection === 'column' ? '\n' : ' ')
    : layer.placeholder;

  // Helper: get effective style for a specific field (per-field overrides)
  const getFieldStyle = (varId: string) => {
    const fs = fieldStyles[varId] ?? {};
    return {
      color: fs.color ?? layer.color,
      fontFamily: resolveFontFamily(fs.fontFamily ?? fontFamily),
      fontWeight: (fs.bold ?? bold) ? 700 : (fontWeight || 400),
      fontStyle: (fs.italic ?? italic) ? 'italic' as const : 'normal' as const,
    };
  };

  // ── Auto-fit: binary search for the largest font that fits ────────
  // Uses the shared useAutoFitFontSize hook — instant proportional
  // estimate during resize, refined via binary search in rAF.
  // The hook measures scrollWidth/scrollHeight of the textRef div,
  // which reflects the actual rendered content (inline spans with
  // per-field styles), so the font size is accurate regardless of
  // whether we render plain text or styled spans.
  const fontSize = useAutoFitFontSize(
    textRef,
    text,
    layer.width || 100,
    layer.height || 100,
    [text, layer.width, layer.height, fontFamily, fontWeight, bold, italic, align, lineHeight, direction],
  );

  // Build the content: if combined fields have individual styles,
  // render each field as a styled span (inline for row, block for column).
  // Otherwise, render plain text.
  const content = (hasCombined && hasIndividualStyles) ? (
    combineDirection === 'column' ? (
      // Column: each field on its own line, with per-field style
      allFieldIds.map((varId) => {
        const fs = getFieldStyle(varId);
        const label = ORDER_FIELD_MAP[varId]?.label || ORDER_FIELD_MAP[varId]?.placeholder || varId;
        return (
          <span
            key={varId}
            style={{
              color: fs.color,
              fontFamily: fs.fontFamily,
              fontWeight: fs.fontWeight,
              fontStyle: fs.fontStyle,
              display: 'block',
              textAlign: align,
            }}
          >
            {label}
          </span>
        );
      })
    ) : (
      // Row: inline flowing text, each field is a styled span separated
      // by a space. The browser handles wrapping naturally.
      allFieldIds.map((varId, idx) => {
        const fs = getFieldStyle(varId);
        const label = ORDER_FIELD_MAP[varId]?.label || ORDER_FIELD_MAP[varId]?.placeholder || varId;
        return (
          <span key={varId}>
            {idx > 0 && ' '}
            <span
              style={{
                color: fs.color,
                fontFamily: fs.fontFamily,
                fontWeight: fs.fontWeight,
                fontStyle: fs.fontStyle,
              }}
            >
              {label}
            </span>
          </span>
        );
      })
    )
  ) : (
    renderTextWithGenderSymbols(text, fontSize, layer.color)
  );

  return (
    <div
      className={className}
      style={{
        ...style,
        display: style.display === 'none' ? 'none' : 'flex',
        alignItems: verticalAlign === 'top' ? 'flex-start' : verticalAlign === 'bottom' ? 'flex-end' : 'center',
        justifyContent: align,
        color: layer.color,
        fontFamily: resolveFontFamily(fontFamily),
        fontWeight: bold ? 700 : (fontWeight || 400),
        fontStyle: italic ? 'italic' : 'normal',
        textAlign: align,
        lineHeight: lineHeight,
        direction: direction as React.CSSProperties['direction'],
        wordBreak: 'break-word',
        overflowWrap: 'anywhere',
        padding: '2px 4px',
        overflow: 'hidden',
      }}
      onPointerDown={onPointerDown}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        ref={textRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          textAlign: align,
          // pre-wrap preserves newlines (e.g. ref.phoneNumbers multi-line)
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          overflowWrap: 'anywhere',
          overflow: 'hidden',
          fontSize: `${fontSize}px`,
        }}
      >
        {content}
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
          display: style.display === 'none' ? 'none' : 'flex',
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
        display: style.display === 'none' ? 'none' : 'flex',
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