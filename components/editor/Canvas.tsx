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
  onCropImage?: (id: string) => void;
  onEditCollage?: (id: string) => void;
  freeDrag?: boolean;
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
    onCropImage,
    onEditCollage,
    freeDrag = false,
  }: CanvasProps,
  forwardedRef
) {
  const canvasRef = useRef<HTMLDivElement>(null);

  // Refs that mirror state for stable pointer handlers (prevents callback
  // recreation on every frame during drag/resize, which causes jumps)
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const layersRef = useRef(layers);
  layersRef.current = layers;
  const widthRef = useRef(width);
  widthRef.current = width;
  const heightRef = useRef(height);
  heightRef.current = height;
  const onLayerChangeRef = useRef(onLayerChange);
  onLayerChangeRef.current = onLayerChange;
  const freeDragRef = useRef(freeDrag);
  freeDragRef.current = freeDrag;
  const onCropImageRef = useRef(onCropImage);
  onCropImageRef.current = onCropImage;
  const onEditCollageRef = useRef(onEditCollage);
  onEditCollageRef.current = onEditCollage;

  // Double-tap detection for mobile — tracks last tap time + layer id
  const lastTapRef = useRef<{ id: string; time: number } | null>(null);
  const DOUBLE_TAP_MS = 300;

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
    startScale: number;
  }>({ isDragging: false, layerId: null, startX: 0, startY: 0, initialX: 0, initialY: 0, startScale: 1 });
  const dragStateRef = useRef(dragState);
  dragStateRef.current = dragState;

  // Center guide lines — shown when dragged element aligns with canvas center
  const [showCenterX, setShowCenterX] = useState(false);
  const [showCenterY, setShowCenterY] = useState(false);

  // Box width drag state — for text layers, drag to change boxWidth on X axis
  const [boxWidthState, setBoxWidthState] = useState<{
    layerId: string;
    startX: number;
    startBoxWidth: number | undefined;
    startLayerWidth: number;
    startScale: number;
  } | null>(null);
  const boxWidthStateRef = useRef(boxWidthState);
  boxWidthStateRef.current = boxWidthState;

  // Drag state for height/width adjustment buttons on shapes
  const [hwDragState, setHwDragState] = useState<{
    layerId: string;
    axis: 'height' | 'width';
    startClient: number;   // startX or startY depending on axis
    startSize: number;
    startScale: number;
    startY?: number;       // for height: keep bottom fixed, move top
  } | null>(null);
  const hwDragStateRef = useRef(hwDragState);
  hwDragStateRef.current = hwDragState;

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
    startBoxWidth?: number;
    startScale: number;
    mode: 'proportional' | 'free';
    direction: 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
  } | null>(null);
  const resizeStateRef = useRef(resizeState);
  resizeStateRef.current = resizeState;

  const [rotateState, setRotateState] = useState<{
    isRotating: boolean;
    layerId: string;
    centerX: number;
    centerY: number;
    startAngle: number;
    startRotation: number;
    startScale: number;
  } | null>(null);
  const rotateStateRef = useRef(rotateState);
  rotateStateRef.current = rotateState;

  // --- Two-finger pinch (zoom) + rotate gesture state ---
  // Tracks active pointers to detect two-finger gestures on the selected layer.
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const [pinchState, setPinchState] = useState<{
    layerId: string;
    startDistance: number;
    startAngle: number;       // angle between two fingers at gesture start
    startRotation: number;    // layer rotation at start
    startWidth: number;
    startHeight: number;
    startFontSize?: number;
    startStrokeWidth?: number;
    startImageScale?: number;
    startBoxWidth?: number;
    startScale: number;       // canvas zoom
    centerX: number;          // layer center in canvas coords
    centerY: number;
  } | null>(null);
  const pinchStateRef = useRef(pinchState);
  pinchStateRef.current = pinchState;

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
      startScale: scaleRef.current,
    });
  }, [layers]);

  const handlePointerDown = useCallback((e: React.PointerEvent, layerId: string) => {
    e.stopPropagation();
    e.preventDefault();
    // Track all pointers for multi-touch gestures
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Double-tap detection (mobile-friendly — fires faster than onDoubleClick)
    const now = Date.now();
    const lastTap = lastTapRef.current;
    if (lastTap && lastTap.id === layerId && now - lastTap.time < DOUBLE_TAP_MS) {
      // Double tap detected — open crop or collage editor
      lastTapRef.current = null;
      const layer = layers.find((l) => l.id === layerId);
      if (layer?.type === 'image') {
        const imgLayer = layer as import('@/types').ImageLayer;
        if (imgLayer.collage) {
          onEditCollageRef.current?.(layerId);
        } else {
          onCropImageRef.current?.(layerId);
        }
      }
      return;
    }
    lastTapRef.current = { id: layerId, time: now };

    // If this is the second pointer on the same layer, start a pinch/rotate gesture
    if (pointersRef.current.size === 2 && selectedLayerId === layerId) {
      const layer = layers.find((l) => l.id === layerId);
      if (!layer || layer.locked) return;
      const pts = Array.from(pointersRef.current.values());
      const dx = pts[1].x - pts[0].x;
      const dy = pts[1].y - pts[0].y;
      const startDistance = Math.hypot(dx, dy);
      const startAngle = Math.atan2(dy, dx);

      // Cancel any ongoing single-pointer drag
      setDragState((prev) => ({ ...prev, isDragging: false, layerId: null }));
      capturePointer(e);
      onLayerDragStart?.(layerId);

      setPinchState({
        layerId,
        startDistance,
        startAngle,
        startRotation: layer.rotation,
        startWidth: layer.width,
        startHeight: layer.height,
        startFontSize: layer.type === 'text' ? layer.fontSize : layer.type === 'dynamic_field' ? layer.fontSize : undefined,
        startStrokeWidth: layer.type === 'shape' ? layer.strokeWidth : undefined,
        startImageScale: layer.type === 'image' ? layer.imageScale : undefined,
        startBoxWidth: layer.type === 'text' ? layer.boxWidth : undefined,
        startScale: scaleRef.current,
        centerX: layer.x + layer.width / 2,
        centerY: layer.y + layer.height / 2,
      });
      return;
    }

    if (!e.isPrimary) return;
    capturePointer(e);
    onSelectLayer(layerId);
    onLayerDragStart?.(layerId);
    startDrag(e.clientX, e.clientY, layerId);
  }, [onSelectLayer, onLayerDragStart, startDrag, layers, selectedLayerId]);

  const handleBoxWidthDragStart = useCallback((e: React.PointerEvent) => {
    if (!e.isPrimary) return;
    e.stopPropagation();
    e.preventDefault();
    if (!selectedLayerId) return;
    const layer = layers.find((l) => l.id === selectedLayerId);
    if (!layer || layer.locked || layer.type !== 'text') return;

    capturePointer(e);
    onLayerDragStart?.(selectedLayerId);
    setBoxWidthState({
      layerId: selectedLayerId,
      startX: e.clientX,
      startBoxWidth: layer.type === 'text' ? layer.boxWidth : undefined,
      startLayerWidth: layer.width,
      startScale: scaleRef.current,
    });
  }, [selectedLayerId, layers, onLayerDragStart]);

  // Drag start for height/width adjustment buttons (all shapes)
  const handleHwDragStart = useCallback((e: React.PointerEvent, axis: 'height' | 'width') => {
    if (!e.isPrimary) return;
    e.stopPropagation();
    e.preventDefault();
    if (!selectedLayerId) return;
    const layer = layers.find((l) => l.id === selectedLayerId);
    if (!layer || layer.locked || layer.type !== 'shape') return;

    capturePointer(e);
    onLayerDragStart?.(selectedLayerId);
    setHwDragState({
      layerId: selectedLayerId,
      axis,
      startClient: axis === 'height' ? e.clientY : e.clientX,
      startSize: axis === 'height' ? layer.height : layer.width,
      startScale: scaleRef.current,
      startY: axis === 'height' ? layer.y : undefined,
    });
  }, [selectedLayerId, layers, onLayerDragStart]);

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
        startBoxWidth: layer.type === 'text' ? layer.boxWidth : undefined,
        startScale: scaleRef.current,
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
      startScale: scaleRef.current,
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
    const layer = layersRef.current.find((l) => l.id === layerId);
    const w = widthRef.current;
    const h = heightRef.current;
    // Clamp: when freeDrag is off, keep the element fully inside the canvas.
    // When freeDrag is on, allow dragging outside (10% visible minimum).
    if (layer) {
      if (freeDragRef.current) {
        const minVisible = 0.1;
        const minX = -layer.width * (1 - minVisible);
        const maxX = w - layer.width * minVisible;
        const minY = -layer.height * (1 - minVisible);
        const maxY = h - layer.height * minVisible;
        newX = Math.max(minX, Math.min(maxX, newX));
        newY = Math.max(minY, Math.min(maxY, newY));
      } else {
        // Keep element fully inside the canvas
        newX = Math.max(0, Math.min(w - layer.width, newX));
        newY = Math.max(0, Math.min(h - layer.height, newY));
      }
    }

    // Snap to center: if the layer center is within the snap threshold,
    // gravitate it exactly to the canvas center for a smooth feel.
    if (layer) {
      const SNAP_THRESHOLD = 12; // px — how close before snapping kicks in
      const elemCenterX = newX + layer.width / 2;
      const elemCenterY = newY + layer.height / 2;
      const canvasCenterX = w / 2;
      const canvasCenterY = h / 2;

      if (Math.abs(elemCenterX - canvasCenterX) < SNAP_THRESHOLD) {
        newX = canvasCenterX - layer.width / 2;
      }
      if (Math.abs(elemCenterY - canvasCenterY) < SNAP_THRESHOLD) {
        newY = canvasCenterY - layer.height / 2;
      }

      // Update guide visibility based on snapped position
      const finalCenterX = newX + layer.width / 2;
      const finalCenterY = newY + layer.height / 2;
      setShowCenterY(Math.abs(finalCenterX - canvasCenterX) < SNAP_THRESHOLD);
      setShowCenterX(Math.abs(finalCenterY - canvasCenterY) < SNAP_THRESHOLD);
    }

    onLayerChangeRef.current(layerId, { x: newX, y: newY }, false);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    // Update tracked pointer position for multi-touch
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    // --- Two-finger pinch + rotate ---
    const pinch = pinchStateRef.current;
    if (pinch && pointersRef.current.size >= 2) {
      e.preventDefault();
      const pts = Array.from(pointersRef.current.values());
      const dx = pts[1].x - pts[0].x;
      const dy = pts[1].y - pts[0].y;
      const currentDistance = Math.hypot(dx, dy);
      const currentAngle = Math.atan2(dy, dx);

      // Scale factor from pinch distance
      const scaleFactor = currentDistance / pinch.startDistance;
      const newWidth = Math.max(10, pinch.startWidth * scaleFactor);
      const newHeight = Math.max(10, pinch.startHeight * scaleFactor);

      // Keep center fixed
      const newX = pinch.centerX - newWidth / 2;
      const newY = pinch.centerY - newHeight / 2;

      // Rotation delta (degrees)
      const angleDelta = (currentAngle - pinch.startAngle) * (180 / Math.PI);
      let newRotation = pinch.startRotation + angleDelta;

      // Magnetic snapping to 45° increments
      const SNAP_THRESHOLD = 8; // degrees — how close before snapping
      const snapped = Math.round(newRotation / 45) * 45;
      if (Math.abs(newRotation - snapped) < SNAP_THRESHOLD) {
        newRotation = snapped;
      }

      const updates: Partial<AnyLayer> = {
        x: newX,
        y: newY,
        width: newWidth,
        height: newHeight,
        rotation: newRotation,
      };

      // Scale content proportionally (font size, stroke width, image scale, boxWidth)
      if (pinch.startFontSize !== undefined) {
        const newFontSize = Math.max(1, Math.round(pinch.startFontSize * scaleFactor));
        (updates as Record<string, unknown>).fontSize = newFontSize;
        if (pinch.startBoxWidth !== undefined) {
          (updates as Record<string, unknown>).boxWidth = Math.max(20, pinch.startBoxWidth * scaleFactor);
        } else {
          delete (updates as Record<string, unknown>).width;
          delete (updates as Record<string, unknown>).height;
        }
      }
      if (pinch.startStrokeWidth !== undefined) {
        (updates as Record<string, unknown>).strokeWidth = Math.max(0, pinch.startStrokeWidth * scaleFactor);
      }
      if (pinch.startImageScale !== undefined) {
        (updates as Record<string, unknown>).imageScale = Math.max(0.1, pinch.startImageScale * scaleFactor);
      }

      onLayerChangeRef.current(pinch.layerId, updates, false);
      return;
    }

    if (!e.isPrimary) return;

    const drag = dragStateRef.current;
    if (drag.isDragging && drag.layerId) {
      e.preventDefault();
      const deltaX = (e.clientX - drag.startX) / drag.startScale;
      const deltaY = (e.clientY - drag.startY) / drag.startScale;
      updateLayerPosition(drag.layerId, drag.initialX + deltaX, drag.initialY + deltaY);
      return;
    }

    // Box width drag — change text box width on X axis
    const bw = boxWidthStateRef.current;
    if (bw) {
      e.preventDefault();
      const deltaX = (e.clientX - bw.startX) / bw.startScale;
      const newBoxWidth = Math.max(20, (bw.startBoxWidth ?? bw.startLayerWidth) + deltaX);
      // Update both boxWidth and width immediately so the SelectionBox
      // icons follow the box in real-time without waiting for measurement.
      onLayerChangeRef.current(bw.layerId, { boxWidth: newBoxWidth, width: newBoxWidth } as Partial<AnyLayer>, false);
      return;
    }

    // Height/width drag — adjust one dimension by dragging
    const hw = hwDragStateRef.current;
    if (hw) {
      e.preventDefault();
      // Height: invert delta so drag up = grow, drag down = shrink
      const rawDelta = (hw.axis === 'height'
        ? (e.clientY - hw.startClient)
        : (e.clientX - hw.startClient)
      ) / hw.startScale;
      const delta = hw.axis === 'height' ? -rawDelta : rawDelta;
      const newSize = Math.max(10, hw.startSize + delta);
      if (hw.axis === 'height' && hw.startY !== undefined) {
        // Keep bottom fixed: move y up as height grows
        onLayerChangeRef.current(hw.layerId, { height: newSize, y: hw.startY - delta } as Partial<AnyLayer>, false);
      } else {
        onLayerChangeRef.current(hw.layerId, { [hw.axis]: newSize } as Partial<AnyLayer>, false);
      }
      return;
    }

    const resize = resizeStateRef.current;
    if (resize) {
      e.preventDefault();
      const deltaX = (e.clientX - resize.startX) / resize.startScale;
      const deltaY = (e.clientY - resize.startY) / resize.startScale;
      const { direction } = resize;
      const minSize = 10;
      const ratio = resize.startWidth / resize.startHeight;

      let rawWidth = resize.startWidth;
      let rawHeight = resize.startHeight;
      let newX = resize.startXPos;
      let newY = resize.startYPos;

      if (resize.mode === 'proportional') {
        // Proportional resize scales from CENTER — the layer grows/shrinks
        // equally in all directions, keeping its midpoint fixed.
        const signX = direction.includes('w') ? -1 : 1;
        const signY = direction.includes('n') ? -1 : 1;
        const widthDelta = signX * deltaX;
        const heightDelta = signY * deltaY;

        // Use the average of both axes for smooth diagonal scaling.
        // This avoids jumps when the dominant axis switches during drag.
        const avgDelta = (widthDelta + heightDelta * ratio) / 2;
        rawWidth = Math.max(minSize, resize.startWidth + avgDelta * 2);
        rawHeight = rawWidth / ratio;

        // Keep center fixed: shift position by half the size change
        newX = resize.startXPos + (resize.startWidth - rawWidth) / 2;
        newY = resize.startYPos + (resize.startHeight - rawHeight) / 2;
      }

      // Clamp: ensure at least 10% of the layer stays visible inside the canvas
      const minVisible = 0.1;
      const w = widthRef.current;
      const h = heightRef.current;
      newX = Math.max(-rawWidth * (1 - minVisible), Math.min(w - rawWidth * minVisible, newX));
      newY = Math.max(-rawHeight * (1 - minVisible), Math.min(h - rawHeight * minVisible, newY));

      const updates: Partial<AnyLayer> = {
        x: newX,
        y: newY,
        width: rawWidth,
        height: rawHeight,
      };

      // Proportional resize scales content too (font size, stroke width, image scale)
      if (resize.mode === 'proportional') {
        const scaleFactor = rawWidth / resize.startWidth;
        if (resize.startFontSize !== undefined) {
          const newFontSize = Math.max(1, Math.round(resize.startFontSize * scaleFactor));
          (updates as Record<string, unknown>).fontSize = newFontSize;
          // If boxWidth is set, scale it too and keep width/height
          // so the SelectionBox follows. The text wraps within the new boxWidth.
          if (resize.startBoxWidth !== undefined) {
            (updates as Record<string, unknown>).boxWidth = Math.max(20, resize.startBoxWidth * scaleFactor);
          } else {
            // No boxWidth — let auto-measure fit the box to the text
            delete (updates as Record<string, unknown>).width;
            delete (updates as Record<string, unknown>).height;
          }
        }
        if (resize.startStrokeWidth !== undefined) {
          (updates as Record<string, unknown>).strokeWidth = Math.max(0, resize.startStrokeWidth * scaleFactor);
        }
        if (resize.startImageScale !== undefined) {
          (updates as Record<string, unknown>).imageScale = Math.max(0.1, resize.startImageScale * scaleFactor);
        }
      }

      onLayerChangeRef.current(resize.layerId, updates, false);
      return;
    }

    const rotate = rotateStateRef.current;
    if (rotate && canvasRef.current) {
      e.preventDefault();
      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left) / rotate.startScale;
      const mouseY = (e.clientY - rect.top) / rotate.startScale;
      const currentAngle = Math.atan2(mouseY - rotate.centerY, mouseX - rotate.centerX);
      const delta = (currentAngle - rotate.startAngle) * (180 / Math.PI);
      let newRotation = rotate.startRotation + delta;

      // Magnetic snapping to 45° increments (same as pinch-to-rotate)
      const SNAP_THRESHOLD = 8; // degrees — how close before snapping
      const snapped = Math.round(newRotation / 45) * 45;
      if (Math.abs(newRotation - snapped) < SNAP_THRESHOLD) {
        newRotation = snapped;
      }

      onLayerChangeRef.current(rotate.layerId, {
        rotation: newRotation,
      }, false);
    }
  }, [updateLayerPosition]);

  const handlePointerEnd = useCallback((e: React.PointerEvent) => {
    // Remove pointer from tracking
    pointersRef.current.delete(e.pointerId);

    // If a pinch was active and one finger lifted, end the pinch
    if (pinchStateRef.current) {
      e.stopPropagation();
      releasePointer(e);
      setPinchState(null);
      // Clear remaining pointers — the gesture is done
      pointersRef.current.clear();
    }

    if (dragStateRef.current.isDragging || resizeStateRef.current || rotateStateRef.current || boxWidthStateRef.current || hwDragStateRef.current) {
      e.stopPropagation();
      releasePointer(e);
    }
    setDragState((prev) => ({ ...prev, isDragging: false, layerId: null }));
    setResizeState(null);
    setBoxWidthState(null);
    setHwDragState(null);
    setRotateState(null);
    setShowCenterX(false);
    setShowCenterY(false);
  }, []);

  // Canvas-level pointer down — tracks pointers that land on the canvas background
  // (not on a layer). This enables two-finger pinch/rotate when the second finger
  // touches the canvas while the first is on the selected layer.
  const handleCanvasPointerDown = useCallback((e: React.PointerEvent) => {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // If we already have a selected layer and this is the second pointer, start pinch
    if (pointersRef.current.size === 2 && selectedLayerId) {
      const layer = layers.find((l) => l.id === selectedLayerId);
      if (!layer || layer.locked) return;
      const pts = Array.from(pointersRef.current.values());
      const dx = pts[1].x - pts[0].x;
      const dy = pts[1].y - pts[0].y;
      const startDistance = Math.hypot(dx, dy);
      const startAngle = Math.atan2(dy, dx);

      setDragState((prev) => ({ ...prev, isDragging: false, layerId: null }));
      capturePointer(e);
      onLayerDragStart?.(selectedLayerId);

      setPinchState({
        layerId: selectedLayerId,
        startDistance,
        startAngle,
        startRotation: layer.rotation,
        startWidth: layer.width,
        startHeight: layer.height,
        startFontSize: layer.type === 'text' ? layer.fontSize : layer.type === 'dynamic_field' ? layer.fontSize : undefined,
        startStrokeWidth: layer.type === 'shape' ? layer.strokeWidth : undefined,
        startImageScale: layer.type === 'image' ? layer.imageScale : undefined,
        startBoxWidth: layer.type === 'text' ? layer.boxWidth : undefined,
        startScale: scaleRef.current,
        centerX: layer.x + layer.width / 2,
        centerY: layer.y + layer.height / 2,
      });
    }
  }, [selectedLayerId, layers, onLayerDragStart]);

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
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onClick={() => onSelectLayer(null)}
    >
      {/* Safe area hint — dashed border 5% inset from canvas edges (hidden during export) */}
      {showGrid && (
        <div
          className="pointer-events-none absolute z-10 border-6 border-dashed border-layer-selected/30"
          style={{ top: '5%', left: '5%', right: '5%', bottom: '5%' }}
        />
      )}

      {sortedLayers.map((layer) => (
        <LayerRenderer
          key={layer.id}
          layer={layer}
          isSelected={layer.id === selectedLayerId}
          onPointerDown={(e) => handlePointerDown(e, layer.id)}
          onLayerChange={onLayerChange}
          onDoubleClick={() => {
            if (layer.type === 'text' && onEditText) {
              onEditText(layer.id);
            } else if (layer.type === 'image') {
              const imgLayer = layer as import('@/types').ImageLayer;
              if (imgLayer.collage && onEditCollage) {
                onEditCollage(layer.id);
              } else if (!imgLayer.collage && onCropImage) {
                onCropImage(layer.id);
              }
            }
          }}
        />
      ))}

      {selectedLayerId && (
        <SelectionBox
          layer={layers.find((l) => l.id === selectedLayerId)}
          scale={scale}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
          onResizeStart={handleResizeStart}
          onRotateStart={handleRotateStart}
          onAlign={onAlign}
          onEditText={onEditText ? () => onEditText(selectedLayerId) : undefined}
          onBoxWidthDragStart={handleBoxWidthDragStart}
          onHeightDragStart={(e) => handleHwDragStart(e, 'height')}
          onWidthDragStart={(e) => handleHwDragStart(e, 'width')}
        />
      )}

      {/* Center guide lines — shown when dragged element aligns with canvas center */}
      {showCenterY && (
        <div
          className="pointer-events-none absolute top-0 bottom-0 left-1/2 z-50 -translate-x-1/2 border-l-8 border border-brand-primary"
          style={{ width: 0 }}
        />
      )}
      {showCenterX && (
        <div
          className="pointer-events-none absolute left-0 right-0 top-1/2 z-50 -translate-y-1/2 border-t-8 border border-brand-primary"
          style={{ height: 0 }}
        />
      )}
    </div>
  );
});

export default Canvas;
