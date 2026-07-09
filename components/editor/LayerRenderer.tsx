'use client';

import type { AnyLayer, TextLayer, ImageLayer, ShapeLayer, DynamicFieldLayer } from '@/types';
import { cn } from '@/lib/utils/cn';

export interface LayerRendererProps {
  layer: AnyLayer;
  isSelected?: boolean;
  onMouseDown?: (e: React.MouseEvent) => void;
}

interface LayerComponentProps extends LayerRendererProps {
  className: string;
  style: React.CSSProperties;
}

export default function LayerRenderer({ layer, isSelected, onMouseDown }: LayerRendererProps) {
  const baseStyles = cn(
    'absolute cursor-move',
    !layer.visible && 'hidden',
    layer.locked && 'cursor-not-allowed',
    isSelected && 'ring-2 ring-layer-selected'
  );

  const commonProps = {
    className: baseStyles,
    style: {
      left: layer.x,
      top: layer.y,
      width: layer.width,
      height: layer.height,
      transform: `rotate(${layer.rotation}deg)`,
      zIndex: layer.zIndex,
    },
    onMouseDown,
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

function TextLayerComponent({ layer, className, style, onMouseDown }: LayerComponentProps & { layer: TextLayer }) {
  return (
    <div
      className={className}
      style={{
        ...style,
        color: layer.color,
        fontFamily: layer.fontFamily,
        fontSize: layer.fontSize,
        fontWeight: layer.bold ? 'bold' : 'normal',
        fontStyle: layer.italic ? 'italic' : 'normal',
        textAlign: layer.align,
        lineHeight: layer.lineHeight,
        direction: layer.direction as React.CSSProperties['direction'],
        display: 'flex',
        alignItems: 'center',
        justifyContent: layer.align,
        whiteSpace: 'pre-wrap',
        wordWrap: 'break-word',
      }}
      onMouseDown={onMouseDown}
    >
      {layer.text}
    </div>
  );
}

function ImageLayerComponent({ layer, className, style, onMouseDown }: LayerComponentProps & { layer: ImageLayer }) {
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
      onMouseDown={onMouseDown}
    >
      <img
        src={layer.uri}
        alt="Layer"
        style={{
          width: layer.naturalWidth * layer.imageScale,
          height: layer.naturalHeight * layer.imageScale,
          objectFit: 'cover',
          transform: `translate(${layer.offsetX}px, ${layer.offsetY}px)`,
        }}
      />
    </div>
  );
}

function ShapeLayerComponent({ layer, className, style, onMouseDown }: LayerComponentProps & { layer: ShapeLayer }) {
  const getBorderRadius = () => {
    if (layer.shape === 'circle') return '50%';
    if (layer.shape === 'rectangle_free') return `${layer.cornerRadius || 20}px`;
    return '0';
  };

  return (
    <div
      className={className}
      style={{
        ...style,
        backgroundColor: layer.fillColor,
        border: `${layer.strokeWidth}px solid ${layer.strokeColor}`,
        borderRadius: getBorderRadius(),
      }}
      onMouseDown={onMouseDown}
    />
  );
}

function DynamicFieldLayerComponent({ layer, className, style, onMouseDown }: LayerComponentProps & { layer: DynamicFieldLayer }) {
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
      onMouseDown={onMouseDown}
    >
      {layer.placeholder}
    </div>
  );
}