'use client';

import { cn } from '@/lib/utils/cn';
import type { AnyLayer } from '@/types';
import { useRef, useCallback, useState } from 'react';
import LayerRenderer from './LayerRenderer';
import SelectionBox from './SelectionBox';

export interface CanvasProps {
  width: number;
  height: number;
  backgroundColor?: string;
  backgroundUri?: string;
  layers: AnyLayer[];
  selectedLayerId?: string;
  onSelectLayer: (id: string | null) => void;
  onLayerChange: (id: string, updates: Partial<AnyLayer>) => void;
  className?: string;
}

export default function Canvas({
  width,
  height,
  backgroundColor = '#ffffff',
  backgroundUri,
  layers,
  selectedLayerId,
  onSelectLayer,
  onLayerChange,
  className,
}: CanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<{
    isDragging: boolean;
    layerId: string | null;
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
  }>({ isDragging: false, layerId: null, startX: 0, startY: 0, initialX: 0, initialY: 0 });

  const handleMouseDown = useCallback((e: React.MouseEvent, layerId: string) => {
    e.stopPropagation();
    onSelectLayer(layerId);

    const layer = layers.find((l) => l.id === layerId);
    if (!layer || layer.locked) return;

    setDragState({
      isDragging: true,
      layerId,
      startX: e.clientX,
      startY: e.clientY,
      initialX: layer.x,
      initialY: layer.y,
    });
  }, [layers, onSelectLayer]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragState.isDragging || !dragState.layerId) return;

    const deltaX = e.clientX - dragState.startX;
    const deltaY = e.clientY - dragState.startY;

    onLayerChange(dragState.layerId, {
      x: dragState.initialX + deltaX,
      y: dragState.initialY + deltaY,
    });
  }, [dragState, onLayerChange]);

  const handleMouseUp = useCallback(() => {
    setDragState((prev) => ({ ...prev, isDragging: false, layerId: null }));
  }, []);

  const sortedLayers = [...layers].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <div
      ref={canvasRef}
      className={cn(
        'relative overflow-hidden shadow-2xl',
        className
      )}
      style={{
        width,
        height,
        backgroundColor,
        backgroundImage: backgroundUri ? `url(${backgroundUri})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={() => onSelectLayer(null)}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage: `
            linear-gradient(var(--canvas-grid) 1px, transparent 1px),
            linear-gradient(90deg, var(--canvas-grid) 1px, transparent 1px)
          `,
          backgroundSize: '20px 20px',
        }}
      />

      {sortedLayers.map((layer) => (
        <LayerRenderer
          key={layer.id}
          layer={layer}
          isSelected={layer.id === selectedLayerId}
          onMouseDown={(e) => handleMouseDown(e, layer.id)}
        />
      ))}

      {selectedLayerId && (
        <SelectionBox
          layer={layers.find((l) => l.id === selectedLayerId)}
          onMouseDown={(e) => handleMouseDown(e, selectedLayerId)}
        />
      )}
    </div>
  );
}