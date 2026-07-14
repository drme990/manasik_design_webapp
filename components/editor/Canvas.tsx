'use client';

import { cn } from '@/lib/utils/cn';
import { getLayerIdFromPoint, getActionFromPoint } from '@/lib/utils/touch-utils';
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
}

function getOverlapArea(a: AnyLayer, b: AnyLayer): number {
  const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return xOverlap * yOverlap;
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
  }: CanvasProps,
  forwardedRef
) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const lastSwapRef = useRef<number>(0);

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

  const handleResizeStart = useCallback(
    (e: React.MouseEvent, direction: 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w', mode: 'free' | 'proportional' = 'free') =>
      startResize(e, mode, direction),
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

  const updateLayerPosition = useCallback((layerId: string, newX: number, newY: number) => {
    onLayerChange(layerId, { x: newX, y: newY }, false);

    const currentLayer = layers.find((l) => l.id === layerId);
    if (currentLayer && !currentLayer.locked) {
      const draggedArea = currentLayer.width * currentLayer.height;
      const now = Date.now();
      if (now - lastSwapRef.current > 300) {
        const overlapping = layers
          .filter((l) => l.id !== layerId && l.visible && !l.locked)
          .find((l) => {
            const overlap = getOverlapArea({ ...currentLayer, x: newX, y: newY }, l);
            return overlap > draggedArea * 0.5;
          });
        if (overlapping) {
          onLayerChange(layerId, { zIndex: overlapping.zIndex }, false);
          onLayerChange(overlapping.id, { zIndex: currentLayer.zIndex }, false);
          lastSwapRef.current = now;
        }
      }
    }
  }, [onLayerChange, layers]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragState.isDragging && dragState.layerId) {
      const deltaX = (e.clientX - dragState.startX) / scale;
      const deltaY = (e.clientY - dragState.startY) / scale;
      updateLayerPosition(dragState.layerId, dragState.initialX + deltaX, dragState.initialY + deltaY);
      return;
    }

    if (resizeState) {
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
        // Calculate size change from the dragged handle
        let sizeDelta = 0;
        if (direction.includes('e') || direction.includes('w')) {
          sizeDelta = Math.abs(deltaX);
        } else if (direction.includes('n') || direction.includes('s')) {
          sizeDelta = Math.abs(deltaY);
        } else {
          sizeDelta = Math.max(Math.abs(deltaX), Math.abs(deltaY));
        }

        const signX = direction.includes('w') ? -1 : 1;
        const signY = direction.includes('n') ? -1 : 1;
        const widthDelta = signX * deltaX;
        const heightDelta = signY * deltaY;

        // Use the axis that has moved more to drive proportional scaling
        if (Math.abs(widthDelta / ratio) > Math.abs(heightDelta)) {
          rawWidth = Math.max(minSize, resizeState.startWidth + widthDelta);
          rawHeight = rawWidth / ratio;
        } else {
          rawHeight = Math.max(minSize, resizeState.startHeight + heightDelta);
          rawWidth = rawHeight * ratio;
        }

        // Anchor to the opposite corner
        if (direction.includes('w')) {
          newX = resizeState.startXPos + resizeState.startWidth - rawWidth;
        }
        if (direction.includes('n')) {
          newY = resizeState.startYPos + resizeState.startHeight - rawHeight;
        }
      } else {
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

      onLayerChange(resizeState.layerId, {
        x: newX,
        y: newY,
        width: rawWidth,
        height: rawHeight,
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
  }, [dragState, resizeState, rotateState, onLayerChange, scale, updateLayerPosition]);

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
    const action = getActionFromPoint(touch.clientX, touch.clientY);

    if (action?.action === 'resize' && selectedLayerId && action.direction && action.mode) {
      e.stopPropagation();
      handleResizeStart(
        { clientX: touch.clientX, clientY: touch.clientY, stopPropagation: () => { }, preventDefault: () => { } } as React.MouseEvent,
        action.direction as 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w',
        action.mode as 'free' | 'proportional'
      );
      return;
    }

    if (action?.action === 'rotate' && selectedLayerId) {
      e.stopPropagation();
      handleRotateStart({ clientX: touch.clientX, clientY: touch.clientY, stopPropagation: () => { }, preventDefault: () => { } } as React.MouseEvent);
      return;
    }

    if (layerId) {
      e.stopPropagation();
      onSelectLayer(layerId);
      onLayerDragStart?.(layerId);
      startDrag(touch.clientX, touch.clientY, layerId);
    } else {
      onSelectLayer(null);
    }
  }, [onSelectLayer, onLayerDragStart, startDrag, handleResizeStart, handleRotateStart, selectedLayerId]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    e.preventDefault();

    const touch = e.touches[0];

    if (dragState.isDragging && dragState.layerId) {
      e.stopPropagation();
      const deltaX = (touch.clientX - dragState.startX) / scale;
      const deltaY = (touch.clientY - dragState.startY) / scale;
      updateLayerPosition(dragState.layerId, dragState.initialX + deltaX, dragState.initialY + deltaY);
      return;
    }

    if (resizeState) {
      e.stopPropagation();
      const deltaX = (touch.clientX - resizeState.startX) / scale;
      const deltaY = (touch.clientY - resizeState.startY) / scale;
      const { direction } = resizeState;
      const minSize = 10;
      const ratio = resizeState.startWidth / resizeState.startHeight;

      let rawWidth = resizeState.startWidth;
      let rawHeight = resizeState.startHeight;
      let newX = resizeState.startXPos;
      let newY = resizeState.startYPos;

      if (resizeState.mode === 'proportional') {
        const signX = direction.includes('w') ? -1 : 1;
        const signY = direction.includes('n') ? -1 : 1;
        const widthDelta = signX * deltaX;
        const heightDelta = signY * deltaY;

        if (Math.abs(widthDelta / ratio) > Math.abs(heightDelta)) {
          rawWidth = Math.max(minSize, resizeState.startWidth + widthDelta);
          rawHeight = rawWidth / ratio;
        } else {
          rawHeight = Math.max(minSize, resizeState.startHeight + heightDelta);
          rawWidth = rawHeight * ratio;
        }

        if (direction.includes('w')) {
          newX = resizeState.startXPos + resizeState.startWidth - rawWidth;
        }
        if (direction.includes('n')) {
          newY = resizeState.startYPos + resizeState.startHeight - rawHeight;
        }
      } else {
        if (direction.includes('e')) rawWidth = Math.max(minSize, resizeState.startWidth + deltaX);
        if (direction.includes('w')) {
          rawWidth = Math.max(minSize, resizeState.startWidth - deltaX);
          newX = resizeState.startXPos + (resizeState.startWidth - rawWidth);
        }
        if (direction.includes('s')) rawHeight = Math.max(minSize, resizeState.startHeight + deltaY);
        if (direction.includes('n')) {
          rawHeight = Math.max(minSize, resizeState.startHeight - deltaY);
          newY = resizeState.startYPos + (resizeState.startHeight - rawHeight);
        }
      }

      onLayerChange(resizeState.layerId, {
        x: newX,
        y: newY,
        width: rawWidth,
        height: rawHeight,
      }, false);
      return;
    }

    if (rotateState && canvasRef.current) {
      e.stopPropagation();
      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = (touch.clientX - rect.left) / scale;
      const mouseY = (touch.clientY - rect.top) / scale;
      const currentAngle = Math.atan2(mouseY - rotateState.centerY, mouseX - rotateState.centerX);
      const delta = (currentAngle - rotateState.startAngle) * (180 / Math.PI);

      onLayerChange(rotateState.layerId, {
        rotation: rotateState.startRotation + delta,
      }, false);
    }
  }, [dragState, resizeState, rotateState, onLayerChange, scale, updateLayerPosition]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (dragState.isDragging || resizeState || rotateState) {
      e.stopPropagation();
    }
    setDragState((prev) => ({ ...prev, isDragging: false, layerId: null }));
    setResizeState(null);
    setRotateState(null);
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
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={() => onSelectLayer(null)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {showGrid && (
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
      )}

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
          onRotateStart={handleRotateStart}
          onAlign={onAlign}
        />
      )}
    </div>
  );
});

export default Canvas;
