'use client';

import { useRef, useLayoutEffect } from 'react';
import type { AnyLayer, TextLayer, ImageLayer, ShapeLayer, DynamicFieldLayer } from '@/types';
import { cn } from '@/lib/utils/cn';
import { resolveFontFamily } from '@/lib/constants/fonts';
import { COLLAGE_LAYOUTS } from '@/lib/constants/presets';
import ShapeRenderer from './ShapeRenderer';

export interface LayerRendererProps {
  layer: AnyLayer;
  isSelected?: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
  onLayerChange?: (id: string, updates: Partial<AnyLayer>, recordHistory?: boolean) => void;
  onDoubleClick?: () => void;
}

interface LayerComponentProps extends LayerRendererProps {
  className: string;
  style: React.CSSProperties;
}

export default function LayerRenderer({ layer, isSelected, onPointerDown, onLayerChange, onDoubleClick }: LayerRendererProps) {
  const baseStyles = cn(
    'absolute cursor-move select-none touch-none',
    !layer.visible && 'hidden',
    layer.locked && 'cursor-not-allowed',
    isSelected && 'ring-2 ring-layer-selected'
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
      return <ImageLayerComponent layer={layer as ImageLayer} {...commonProps} />;
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
      lastMeasuredRef.current = { w, h };
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
  }, [layer.text, layer.fontSize, layer.fontFamily, layer.bold, layer.italic, layer.lineHeight, layer.direction, onLayerChange, layer.id, hasBoxWidth]);

  // When boxWidth is set, measure height only (width is user-controlled)
  useLayoutEffect(() => {
    if (!onLayerChange || !hasBoxWidth) return;
    const el = measureRef.current;
    if (!el) return;

    const h = Math.ceil(el.scrollHeight);
    if (h <= 0) return;

    if (h !== lastMeasuredRef.current.h) {
      const oldH = lastMeasuredRef.current.h;
      lastMeasuredRef.current = { w: layer.boxWidth!, h };
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
  }, [layer.text, layer.fontSize, layer.fontFamily, layer.bold, layer.italic, layer.lineHeight, layer.direction, layer.boxWidth, onLayerChange, layer.id, hasBoxWidth]);

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

function ImageLayerComponent({ layer, className, style, onPointerDown }: LayerComponentProps & { layer: ImageLayer }) {
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
              className="absolute overflow-hidden bg-muted"
              style={{
                left: cellX,
                top: cellY,
                width: cellW,
                height: cellH,
                borderRadius: layer.borderRadius,
              }}
            >
              {cellUri ? (
                <img
                  src={cellUri}
                  alt={`collage ${i + 1}`}
                  draggable={false}
                  className="pointer-events-none h-full w-full select-none object-cover"
                  style={{
                    transform: `scale(${cell?.scale ?? 1}) translate(${cell?.offsetX ?? 0}px, ${cell?.offsetY ?? 0}px)`,
                  }}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-muted" />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // Single image rendering
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
      onClick={(e) => e.stopPropagation()}
    >
      <img
        src={layer.uri}
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
      />
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
        className="h-full w-full"
      />
    </div>
  );
}

function DynamicFieldLayerComponent({ layer, className, style, onPointerDown }: LayerComponentProps & { layer: DynamicFieldLayer }) {
  return (
    <div
      className={className}
      style={{
        ...style,
        backgroundColor: layer.backgroundColor || 'transparent',
        border: `${layer.borderWidth ?? 0}px solid ${layer.borderColor ?? 'transparent'}`,
        borderRadius: layer.borderRadius ?? 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: layer.color,
        fontSize: layer.fontSize,
        direction: 'rtl',
      }}
      onPointerDown={onPointerDown}
      onClick={(e) => e.stopPropagation()}
    >
      {layer.placeholder}
    </div>
  );
}