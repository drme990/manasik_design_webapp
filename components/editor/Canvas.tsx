'use client';

import { cn } from '@/lib/utils/cn';
import type { AnyLayer } from '@/types';
import { useRef, useCallback, useState, forwardRef } from 'react';
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
  showGrid?: boolean;
  className?: string;
  onAlign?: (align: 'left' | 'center' | 'right') => void;
  onVerticalAlign?: (align: 'top' | 'middle' | 'bottom') => void;
  onEditText?: (id: string) => void;
}

function capturePointer(e: React.PointerEvent) {
  const target = e.currentTarget as HTMLElement;
  try {
    target.setPointerCapture?.(e.pointerId);
  } catch {
    // Pointer capture can fail (e.g. already released); safe to ignore.
  }
}

function releasePointer(e: React.PointerEvent) {
  const target = e.target as HTMLElement;
  try {
    target.releasePointerCapture?.(e.pointerId);
  } catch {
    // Ignore if the pointer was never captured or already released.
  }
}

const Canvas = forwardRef<HTMLDivElement, CanvasProps>(function Canvas(
  {
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
    showGrid = true,
    className,
    onAlign,
    onVerticalAlign,
    onEditText,
  }: CanvasProps,
  forwardedRef
) {
  const canvasRef = useRef<HTMLDivElement>(null);

  const setCanvasRef = useCallback(
    (node: HTMLDivElement | null) => {
      canvasRef.current = node;
      if (typeof forwardedRef === 'function') {
        forwardedRef(node);
      } else if (forwardedRef) {
        (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }
    },
    [forwardedRef]
  );
  const [dragState, setDragState] = useState<{
    isDragging: boolean;
    layerId: string | null;
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
  }>({ isDragging: false, layerId: null, startX: 0, startY: 0, initialX: 0, initialY: 0 });

  // Center guide lines — shown when dragged element aligns with canvas center
  const [showCenterX, setShowCenterX] = useState(false);
  const [showCenterY, setShowCenterY] = useState(false);

  const [resizeState, setResizeState] = useState<{
    layerId: string;
    startX: number;
    startY: number;
    startXPos: number;
    startYPos: number;
    startWidth: number;
    startHeight: number;
    startFontSize?: number;
    startStrokeWidth?: number;
    startImageScale?: number;
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

  const handlePointerDown = useCallback((e: React.PointerEvent, layerId: string) => {
    if (!e.isPrimary) return;
    e.stopPropagation();
    e.preventDefault();
    capturePointer(e);
    onSelectLayer(layerId);
    onLayerDragStart?.(layerId);
    startDrag(e.clientX, e.clientY, layerId);
  }, [onSelectLayer, onLayerDragStart, startDrag]);

  const startResize = useCallback(
    (e: React.PointerEvent, mode: 'proportional' | 'free', direction: 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w') => {
      if (!e.isPrimary) return;
      e.stopPropagation();
      e.preventDefault();
      if (!selectedLayerId) return;
      const layer = layers.find((l) => l.id === selectedLayerId);
      if (!layer || layer.locked) return;

      capturePointer(e);
      onLayerDragStart?.(selectedLayerId);
      setResizeState({
        layerId: selectedLayerId,
        startX: e.clientX,
        startY: e.clientY,
        startXPos: layer.x,
        startYPos: layer.y,
        startWidth: layer.width,
        startHeight: layer.height,
        startFontSize: layer.type === 'text' ? layer.fontSize : layer.type === 'dynamic_field' ? layer.fontSize : undefined,
        startStrokeWidth: layer.type === 'shape' ? layer.strokeWidth : undefined,
        startImageScale: layer.type === 'image' ? layer.imageScale : undefined,
        mode,
        direction,
      });
    },
    [selectedLayerId, layers, onLayerDragStart]
  );

  const handleResizeStart = useCallback(
    (e: React.PointerEvent, direction: 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w', mode: 'free' | 'proportional' = 'free') =>
      startResize(e, mode, direction),
    [startResize]
  );

  const handleRotateStart = useCallback((e: React.PointerEvent) => {
    if (!e.isPrimary) return;
    e.stopPropagation();
    e.preventDefault();
    if (!selectedLayerId || !canvasRef.current) return;
    const layer = layers.find((l) => l.id === selectedLayerId);
    if (!layer || layer.locked) return;

    capturePointer(e);
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

  const updateLayerPosition = useCallback((layerId: string, newX: number, newY: number) => {
    // Clamp: ensure at least 10% of the layer stays visible inside the canvas
    const layer = layers.find((l) => l.id === layerId);
    if (layer) {
      const minVisible = 0.1; // 10% of the dimension must stay inside
      const minX = -layer.width * (1 - minVisible);
      const maxX = width - layer.width * minVisible;
      const minY = -layer.height * (1 - minVisible);
      const maxY = height - layer.height * minVisible;
      newX = Math.max(minX, Math.min(maxX, newX));
      newY = Math.max(minY, Math.min(maxY, newY));
    }

    onLayerChange(layerId, { x: newX, y: newY }, false);

    // Check if element center aligns with canvas center (within 5px tolerance)
    if (layer) {
      const elemCenterX = newX + layer.width / 2;
      const elemCenterY = newY + layer.height / 2;
      const canvasCenterX = width / 2;
      const canvasCenterY = height / 2;
      setShowCenterY(Math.abs(elemCenterX - canvasCenterX) < 5);
      setShowCenterX(Math.abs(elemCenterY - canvasCenterY) < 5);
    }
  }, [width, height]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!e.isPrimary) return;

    if (dragState.isDragging && dragState.layerId) {
      e.preventDefault();
      const deltaX = (e.clientX - dragState.startX) / scale;
      const deltaY = (e.clientY - dragState.startY) / scale;
      updateLayerPosition(dragState.layerId, dragState.initialX + deltaX, dragState.initialY + deltaY);
      return;
    }

    if (resizeState) {
      e.preventDefault();
      const deltaX = (e.clientX - resizeState.startX) / scale;
      const deltaY = (e.clientY - resizeState.startY) / scale;
      const { direction } = resizeState;
      const minSize = 10;
      const ratio = resizeState.startWidth / resizeState.startHeight;

      let rawWidth = resizeState.startWidth;
      let rawHeight = resizeState.startHeight;
      let newX = resizeState.startXPos;
      let newY = resizeState.startYPos;

      if (resizeState.mode === 'proportional') {
        // Proportional resize scales from CENTER — the layer grows/shrinks
        // equally in all directions, keeping its midpoint fixed.
        const signX = direction.includes('w') ? -1 : 1;
        const signY = direction.includes('n') ? -1 : 1;
        const widthDelta = signX * deltaX;
        const heightDelta = signY * deltaY;

        // Use the axis that has moved more to drive proportional scaling
        if (Math.abs(widthDelta / ratio) > Math.abs(heightDelta)) {
          rawWidth = Math.max(minSize, resizeState.startWidth + widthDelta * 2);
          rawHeight = rawWidth / ratio;
        } else {
          rawHeight = Math.max(minSize, resizeState.startHeight + heightDelta * 2);
          rawWidth = rawHeight * ratio;
        }

        // Keep center fixed: shift position by half the size change
        newX = resizeState.startXPos + (resizeState.startWidth - rawWidth) / 2;
        newY = resizeState.startYPos + (resizeState.startHeight - rawHeight) / 2;
      } else {
        // Free resize — only for "free square" shapes, drag borders freely
        if (direction.includes('e')) {
          rawWidth = Math.max(minSize, resizeState.startWidth + deltaX);
        }
        if (direction.includes('w')) {
          rawWidth = Math.max(minSize, resizeState.startWidth - deltaX);
          newX = resizeState.startXPos + (resizeState.startWidth - rawWidth);
        }
        if (direction.includes('s')) {
          rawHeight = Math.max(minSize, resizeState.startHeight + deltaY);
        }
        if (direction.includes('n')) {
          rawHeight = Math.max(minSize, resizeState.startHeight - deltaY);
          newY = resizeState.startYPos + (resizeState.startHeight - rawHeight);
        }
      }

      // Clamp: ensure at least 10% of the layer stays visible inside the canvas
      const minVisible = 0.1;
      const visW = rawWidth;
      const visH = rawHeight;
      newX = Math.max(-visW * (1 - minVisible), Math.min(width - visW * minVisible, newX));
      newY = Math.max(-visH * (1 - minVisible), Math.min(height - visH * minVisible, newY));

      const updates: Partial<AnyLayer> = {
        x: newX,
        y: newY,
        width: rawWidth,
        height: rawHeight,
      };

      // Proportional resize scales content too (font size, stroke width, image scale)
      if (resizeState.mode === 'proportional') {
        const scaleFactor = rawWidth / resizeState.startWidth;
        if (resizeState.startFontSize !== undefined) {
          const newFontSize = Math.max(1, Math.round(resizeState.startFontSize * scaleFactor));
          (updates as Record<string, unknown>).fontSize = newFontSize;
          // For text layers, don't set width/height — the auto-measure
          // effect in TextLayerComponent will fit the box to the text.
          // We still set x/y for centering based on the expected size.
          delete (updates as Record<string, unknown>).width;
          delete (updates as Record<string, unknown>).height;
        }
        if (resizeState.startStrokeWidth !== undefined) {
          (updates as Record<string, unknown>).strokeWidth = Math.max(0, resizeState.startStrokeWidth * scaleFactor);
        }
        // For images, scale the image content proportionally with the box
        if (resizeState.startImageScale !== undefined) {
          (updates as Record<string, unknown>).imageScale = Math.max(0.1, resizeState.startImageScale * scaleFactor);
        }
      }

      onLayerChange(resizeState.layerId, updates, false);
      return;
    }

    if (rotateState && canvasRef.current) {
      e.preventDefault();
      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left) / scale;
      const mouseY = (e.clientY - rect.top) / scale;
      const currentAngle = Math.atan2(mouseY - rotateState.centerY, mouseX - rotateState.centerX);
      const delta = (currentAngle - rotateState.startAngle) * (180 / Math.PI);

      onLayerChange(rotateState.layerId, {
        rotation: rotateState.startRotation + delta,
      }, false);
    }
  }, [dragState, resizeState, rotateState, onLayerChange, scale, updateLayerPosition]);

  const handlePointerEnd = useCallback((e: React.PointerEvent) => {
    if (dragState.isDragging || resizeState || rotateState) {
      e.stopPropagation();
      releasePointer(e);
    }
    setDragState((prev) => ({ ...prev, isDragging: false, layerId: null }));
    setResizeState(null);
    setRotateState(null);
    setShowCenterX(false);
    setShowCenterY(false);
  }, [dragState.isDragging, resizeState, rotateState]);

  const sortedLayers = [...layers].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <div
      ref={setCanvasRef}
      className={cn(
        'relative select-none overflow-hidden shadow-2xl',
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
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onClick={() => onSelectLayer(null)}
    >
      {sortedLayers.map((layer) => (
        <LayerRenderer
          key={layer.id}
          layer={layer}
          isSelected={layer.id === selectedLayerId}
          onPointerDown={(e) => handlePointerDown(e, layer.id)}
          onLayerChange={onLayerChange}
          onDoubleClick={() => {
            if (layer.type === 'text' && onEditText) onEditText(layer.id);
          }}
        />
      ))}

      {selectedLayerId && (
        <SelectionBox
          layer={layers.find((l) => l.id === selectedLayerId)}
          onPointerDown={(e) => handlePointerDown(e, selectedLayerId)}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
          onResizeStart={handleResizeStart}
          onRotateStart={handleRotateStart}
          onAlign={onAlign}
          onVerticalAlign={onVerticalAlign}
        />
      )}

      {/* Center guide lines — shown when dragged element aligns with canvas center */}
      {showCenterY && (
        <div
          className="pointer-events-none absolute top-0 bottom-0 left-1/2 z-50 -translate-x-1/2 border-l-8 border-dashed border-brand-primary"
          style={{ width: 0 }}
        />
      )}
      {showCenterX && (
        <div
          className="pointer-events-none absolute left-0 right-0 top-1/2 z-50 -translate-y-1/2 border-t-8 border-dashed border-brand-primary"
          style={{ height: 0 }}
        />
      )}
    </div>
  );
});

export default Canvas;
