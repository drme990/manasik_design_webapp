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
  onLayerChange: (id: string, updates: Partial<AnyLayer>, recordHistory?: boolean) => void;
  onLayerDragStart?: (id: string) => void;
  onDuplicateLayer?: (id: string) => void;
  onDeleteLayer?: (id: string) => void;
  scale?: number;
  className?: string;
}

function getLayerIdFromPoint(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const layerEl = el.closest('[data-layer-id]');
  return layerEl?.getAttribute('data-layer-id') || null;
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
  onLayerDragStart,
  onDuplicateLayer,
  onDeleteLayer,
  scale = 1,
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

  const [resizeState, setResizeState] = useState<{
    layerId: string;
    startX: number;
    startY: number;
    startXPos: number;
    startYPos: number;
    startWidth: number;
    startHeight: number;
    mode: 'proportional' | 'free';
    direction: 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
  } | null>(null);

  const [rotateState, setRotateState] = useState<{
    isRotating: boolean;
    layerId: string;
    centerX: number;
    centerY: number;
    startAngle: number;
    startRotation: number;
  } | null>(null);

  const startDrag = useCallback((clientX: number, clientY: number, layerId: string) => {
    const layer = layers.find((l) => l.id === layerId);
    if (!layer || layer.locked) return;

    setDragState({
      isDragging: true,
      layerId,
      startX: clientX,
      startY: clientY,
      initialX: layer.x,
      initialY: layer.y,
    });
  }, [layers]);

  const handleMouseDown = useCallback((e: React.MouseEvent, layerId: string) => {
    e.stopPropagation();
    onSelectLayer(layerId);
    onLayerDragStart?.(layerId);
    startDrag(e.clientX, e.clientY, layerId);
  }, [onSelectLayer, onLayerDragStart, startDrag]);

  const startResize = useCallback(
    (e: React.MouseEvent, mode: 'proportional' | 'free', direction: 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w') => {
      e.stopPropagation();
      if (!selectedLayerId) return;
      const layer = layers.find((l) => l.id === selectedLayerId);
      if (!layer || layer.locked) return;

      onLayerDragStart?.(selectedLayerId);
      setResizeState({
        layerId: selectedLayerId,
        startX: e.clientX,
        startY: e.clientY,
        startXPos: layer.x,
        startYPos: layer.y,
        startWidth: layer.width,
        startHeight: layer.height,
        mode,
        direction,
      });
    },
    [selectedLayerId, layers, onLayerDragStart]
  );

  const handleProportionalResizeStart = useCallback(
    (e: React.MouseEvent) => startResize(e, 'proportional', 'se'),
    [startResize]
  );

  const handleResizeStart = useCallback(
    (e: React.MouseEvent, direction: 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w') =>
      startResize(e, 'free', direction),
    [startResize]
  );

  const handleRotateStart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedLayerId || !canvasRef.current) return;
    const layer = layers.find((l) => l.id === selectedLayerId);
    if (!layer || layer.locked) return;

    onLayerDragStart?.(selectedLayerId);
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) / scale;
    const mouseY = (e.clientY - rect.top) / scale;
    const centerX = layer.x + layer.width / 2;
    const centerY = layer.y + layer.height / 2;

    setRotateState({
      isRotating: true,
      layerId: selectedLayerId,
      centerX,
      centerY,
      startAngle: Math.atan2(mouseY - centerY, mouseX - centerX),
      startRotation: layer.rotation,
    });
  }, [selectedLayerId, layers, onLayerDragStart, scale]);

  const handleDuplicate = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedLayerId) onDuplicateLayer?.(selectedLayerId);
  }, [selectedLayerId, onDuplicateLayer]);

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (selectedLayerId) onDeleteLayer?.(selectedLayerId);
  }, [selectedLayerId, onDeleteLayer]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragState.isDragging && dragState.layerId) {
      const deltaX = (e.clientX - dragState.startX) / scale;
      const deltaY = (e.clientY - dragState.startY) / scale;

      onLayerChange(dragState.layerId, {
        x: dragState.initialX + deltaX,
        y: dragState.initialY + deltaY,
      }, false);
      return;
    }

    if (resizeState) {
      const deltaX = (e.clientX - resizeState.startX) / scale;
      const deltaY = (e.clientY - resizeState.startY) / scale;
      let newWidth = resizeState.startWidth;
      let newHeight = resizeState.startHeight;
      let newX = resizeState.startXPos;
      let newY = resizeState.startYPos;

      if (resizeState.mode === 'proportional') {
        const ratio = resizeState.startWidth / resizeState.startHeight;
        const sizeDelta = Math.max(deltaX, deltaY);
        newWidth = Math.max(10, resizeState.startWidth + sizeDelta);
        newHeight = newWidth / ratio;
      } else {
        const { direction } = resizeState;
        const minSize = 10;

        if (direction.includes('e')) {
          newWidth = Math.max(minSize, resizeState.startWidth + deltaX);
        }
        if (direction.includes('w')) {
          newWidth = Math.max(minSize, resizeState.startWidth - deltaX);
          newX = resizeState.startXPos + (resizeState.startWidth - newWidth);
        }
        if (direction.includes('s')) {
          newHeight = Math.max(minSize, resizeState.startHeight + deltaY);
        }
        if (direction.includes('n')) {
          newHeight = Math.max(minSize, resizeState.startHeight - deltaY);
          newY = resizeState.startYPos + (resizeState.startHeight - newHeight);
        }
      }

      onLayerChange(resizeState.layerId, {
        x: newX,
        y: newY,
        width: newWidth,
        height: newHeight,
      }, false);
      return;
    }

    if (rotateState && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left) / scale;
      const mouseY = (e.clientY - rect.top) / scale;
      const currentAngle = Math.atan2(mouseY - rotateState.centerY, mouseX - rotateState.centerX);
      const delta = (currentAngle - rotateState.startAngle) * (180 / Math.PI);

      onLayerChange(rotateState.layerId, {
        rotation: rotateState.startRotation + delta,
      }, false);
    }
  }, [dragState, resizeState, rotateState, onLayerChange, scale]);

  const handleMouseUp = useCallback(() => {
    setDragState((prev) => ({ ...prev, isDragging: false, layerId: null }));
    setResizeState(null);
    setRotateState(null);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    e.preventDefault();

    const touch = e.touches[0];
    const layerId = getLayerIdFromPoint(touch.clientX, touch.clientY);

    if (layerId) {
      e.stopPropagation();
      onSelectLayer(layerId);
      onLayerDragStart?.(layerId);
      startDrag(touch.clientX, touch.clientY, layerId);
    } else {
      onSelectLayer(null);
    }
  }, [onSelectLayer, onLayerDragStart, startDrag]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragState.isDragging || !dragState.layerId || e.touches.length !== 1) return;
    e.preventDefault();

    const touch = e.touches[0];
    const deltaX = (touch.clientX - dragState.startX) / scale;
    const deltaY = (touch.clientY - dragState.startY) / scale;

    onLayerChange(dragState.layerId, {
      x: dragState.initialX + deltaX,
      y: dragState.initialY + deltaY,
    }, false);
  }, [dragState, onLayerChange, scale]);

  const handleTouchEnd = useCallback(() => {
    setDragState((prev) => ({ ...prev, isDragging: false, layerId: null }));
    setResizeState(null);
    setRotateState(null);
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
        touchAction: 'none',
      }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={() => onSelectLayer(null)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
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
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
          onResizeStart={handleResizeStart}
          onProportionalResizeStart={handleProportionalResizeStart}
          onRotateStart={handleRotateStart}
        />
      )}
    </div>
  );
}
