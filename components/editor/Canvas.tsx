'use client';

import { cn } from '@/lib/utils/cn';
import type { AnyLayer, SafeArea } from '@/types';
import { DEFAULT_SAFE_AREA } from '@/types';
import { useRef, useCallback, useState, forwardRef, useEffect } from 'react';
import { LuRotateCcw, LuArrowUp, LuArrowDown, LuArrowLeft, LuArrowRight } from 'react-icons/lu';
import { Button } from '@/components/ui/Button';
import LayerRenderer from './LayerRenderer';
import SelectionBox from './SelectionBox';

export interface CanvasProps {
  width: number;
  height: number;
  backgroundColor?: string;
  backgroundUri?: string;
  safeArea?: SafeArea;
  onSafeAreaChange?: (area: SafeArea) => void;
  safeAreaEditMode?: boolean;
  safeAreaResetLabel?: string;
  safeAreaWarningLabel?: string;
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
  onRetryUpload?: (id: string) => void;
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
    safeArea,
    onSafeAreaChange,
    safeAreaEditMode = false,
    safeAreaResetLabel = 'Reset',
    safeAreaWarningLabel = 'Elements are outside the safe area',
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
    onEditText,
    onCropImage,
    onEditCollage,
    onRetryUpload,
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
  const onCropImageRef = useRef(onCropImage);
  onCropImageRef.current = onCropImage;
  const onEditCollageRef = useRef(onEditCollage);
  onEditCollageRef.current = onEditCollage;
  const onEditTextRef = useRef(onEditText);
  onEditTextRef.current = onEditText;
  const onRetryUploadRef = useRef(onRetryUpload);
  onRetryUploadRef.current = onRetryUpload;
  const safeAreaRef = useRef(safeArea);
  safeAreaRef.current = safeArea ?? DEFAULT_SAFE_AREA;
  const onSafeAreaChangeRef = useRef(onSafeAreaChange);
  onSafeAreaChangeRef.current = onSafeAreaChange;

  // Safe area drag state
  const [safeAreaDrag, setSafeAreaDrag] = useState<{
    edge: 'move' | 'top' | 'right' | 'bottom' | 'left' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    startX: number;
    startY: number;
    startArea: SafeArea;
  } | null>(null);
  const safeAreaDragRef = useRef(safeAreaDrag);
  safeAreaDragRef.current = safeAreaDrag;
  // Tracks which axis has a snap match during safe area dragging — used to
  // show guide lines on the opposite edge when values match.
  const [safeAreaSnap, setSafeAreaSnap] = useState<{ horizontal: boolean; vertical: boolean }>({ horizontal: false, vertical: false });

  // Global pointer event listeners for safe area dragging — mobile fallback.
  // On mobile, setPointerCapture can be unreliable, so we also listen on window
  // to ensure pointermove/pointerup fire even if the canvas loses the pointer.
  useEffect(() => {
    if (!safeAreaDrag) return;
    const handleMove = (e: PointerEvent) => {
      if (!safeAreaDragRef.current || !canvasRef.current) return;
      e.preventDefault();
      const rect = canvasRef.current.getBoundingClientRect();
      const deltaPctX = ((e.clientX - safeAreaDragRef.current.startX) / rect.width) * 100;
      const deltaPctY = ((e.clientY - safeAreaDragRef.current.startY) / rect.height) * 100;
      const start = safeAreaDragRef.current.startArea;
      let { top, right, bottom, left } = start;
      const MIN = 0;
      const edge = safeAreaDragRef.current.edge;
      // Each edge only modifies its own inset.
      // Dragging the handle toward the canvas center increases the inset
      // (shrinks the safe area); dragging away from center decreases it
      // (grows the safe area). The border always follows the finger.
      switch (edge) {
        case 'move':
          left = Math.max(MIN, Math.min(100 - start.right - MIN, start.left + deltaPctX));
          top = Math.max(MIN, Math.min(100 - start.bottom - MIN, start.top + deltaPctY));
          right = start.right + (start.left - left);
          bottom = start.bottom + (start.top - top);
          break;
        case 'top':
          top = Math.max(MIN, Math.min(100 - start.bottom - MIN, start.top + deltaPctY));
          break;
        case 'bottom':
          bottom = Math.max(MIN, Math.min(100 - start.top - MIN, start.bottom - deltaPctY));
          break;
        case 'left':
          left = Math.max(MIN, Math.min(100 - start.right - MIN, start.left + deltaPctX));
          break;
        case 'right':
          right = Math.max(MIN, Math.min(100 - start.left - MIN, start.right - deltaPctX));
          break;
        case 'top-left':
          top = Math.max(MIN, Math.min(100 - start.bottom - MIN, start.top + deltaPctY));
          left = Math.max(MIN, Math.min(100 - start.right - MIN, start.left + deltaPctX));
          break;
        case 'top-right':
          top = Math.max(MIN, Math.min(100 - start.bottom - MIN, start.top + deltaPctY));
          right = Math.max(MIN, Math.min(100 - start.left - MIN, start.right - deltaPctX));
          break;
        case 'bottom-left':
          bottom = Math.max(MIN, Math.min(100 - start.top - MIN, start.bottom - deltaPctY));
          left = Math.max(MIN, Math.min(100 - start.right - MIN, start.left + deltaPctX));
          break;
        case 'bottom-right':
          bottom = Math.max(MIN, Math.min(100 - start.top - MIN, start.bottom - deltaPctY));
          right = Math.max(MIN, Math.min(100 - start.left - MIN, start.right - deltaPctX));
          break;
      }
      // Magnetic snap — when a side's value gets close to its opposite side,
      // snap it to match. This makes it easy to create symmetric safe areas.
      // Only applies to single-edge and corner drags (not 'move').
      const SNAP_THRESHOLD = 0.5; // % — how close before snapping kicks in
      let snapH = false; // horizontal match (top ≈ bottom)
      let snapV = false; // vertical match (left ≈ right)
      if (edge !== 'move') {
        if (edge === 'top' || edge === 'top-left' || edge === 'top-right') {
          if (Math.abs(top - bottom) < SNAP_THRESHOLD) { top = bottom; snapH = true; }
        }
        if (edge === 'bottom' || edge === 'bottom-left' || edge === 'bottom-right') {
          if (Math.abs(bottom - top) < SNAP_THRESHOLD) { bottom = top; snapH = true; }
        }
        if (edge === 'left' || edge === 'top-left' || edge === 'bottom-left') {
          if (Math.abs(left - right) < SNAP_THRESHOLD) { left = right; snapV = true; }
        }
        if (edge === 'right' || edge === 'top-right' || edge === 'bottom-right') {
          if (Math.abs(right - left) < SNAP_THRESHOLD) { right = left; snapV = true; }
        }
      }
      setSafeAreaSnap({ horizontal: snapH, vertical: snapV });
      onSafeAreaChangeRef.current?.({ top, right, bottom, left });
    };
    const handleUp = () => {
      setSafeAreaDrag(null);
      setSafeAreaSnap({ horizontal: false, vertical: false });
    };
    window.addEventListener('pointermove', handleMove, { passive: false });
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [safeAreaDrag]);

  // Check if a layer exceeds the safe area by even 1px
  const isLayerOutsideSafeArea = useCallback((layer: AnyLayer): boolean => {
    const area = safeAreaRef.current;
    if (!area) return false;
    const w = widthRef.current;
    const h = heightRef.current;
    const safeLeft = (area.left / 100) * w;
    const safeTop = (area.top / 100) * h;
    const safeRight = w - (area.right / 100) * w;
    const safeBottom = h - (area.bottom / 100) * h;
    // Any overflow beyond 1px triggers the warning
    const overflowLeft = safeLeft - layer.x;
    const overflowTop = safeTop - layer.y;
    const overflowRight = (layer.x + layer.width) - safeRight;
    const overflowBottom = (layer.y + layer.height) - safeBottom;
    return overflowLeft > 1 ||
      overflowTop > 1 ||
      overflowRight > 1 ||
      overflowBottom > 1;
  }, []);

  // Check if ANY visible layer is outside the safe area
  const hasLayerOutsideSafeArea = useCallback((): boolean => {
    return layers.some((l) => l.visible && isLayerOutsideSafeArea(l));
  }, [layers, isLayerOutsideSafeArea]);

  // Double-tap detection for mobile — tracks last tap time, layer id, and position
  const lastTapRef = useRef<{ id: string; time: number; x: number; y: number } | null>(null);
  const DOUBLE_TAP_MS = 350;
  const DOUBLE_TAP_MAX_DISTANCE = 30; // px — ignore second tap if too far from first
  // Suppress the click event that fires after a double-tap pointerdown,
  // so it doesn't land on the modal backdrop and close the just-opened modal.
  const suppressClickRef = useRef(false);

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
    // Smoothing fields — updated each move event to dampen jitter
    lastScaleFactor?: number;
    lastAngleDelta?: number;
    lastDelta?: { dist: number; angle: number };
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
    if (
      lastTap &&
      lastTap.id === layerId &&
      now - lastTap.time < DOUBLE_TAP_MS &&
      Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < DOUBLE_TAP_MAX_DISTANCE
    ) {
      // Double tap detected — open crop or collage editor.
      // Delay opening the modal slightly so the ghost click/dblclick events
      // (which the browser fires after pointerup) land on the canvas — where
      // suppressClickRef can absorb them — instead of on the modal backdrop
      // (which would immediately close the just-opened modal).
      lastTapRef.current = null;
      suppressClickRef.current = true;
      setTimeout(() => { suppressClickRef.current = false; }, 300);
      const layer = layers.find((l) => l.id === layerId);
      // Defer modal/drawer opening until after the ghost click event has fired
      setTimeout(() => {
        if (layer?.type === 'text' && onEditTextRef.current) {
          onEditTextRef.current(layerId);
        } else if (layer?.type === 'image') {
          const imgLayer = layer as import('@/types').ImageLayer;
          if (imgLayer.collage) {
            onEditCollageRef.current?.(layerId);
          } else {
            onCropImageRef.current?.(layerId);
          }
        }
      }, 0);
      return;
    }
    lastTapRef.current = { id: layerId, time: now, x: e.clientX, y: e.clientY };

    // If this is the second pointer on the same layer, start a pinch/rotate gesture
    if (pointersRef.current.size === 2 && selectedLayerId === layerId) {
      const layer = layers.find((l) => l.id === layerId);
      if (!layer || layer.locked) return;
      const pts = Array.from(pointersRef.current.values());
      const dx = pts[1].x - pts[0].x;
      const dy = pts[1].y - pts[0].y;
      const startDistance = Math.hypot(dx, dy);
      const startAngle = Math.atan2(dy, dx);

      // Ignore pinch start if fingers are too close — causes extreme sensitivity
      if (startDistance < 20) return;

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
    // Allow elements to be dragged up to 80% outside the canvas (20% visible minimum)
    if (layer) {
      const minVisible = 0.2;
      const minX = -layer.width * (1 - minVisible);
      const maxX = w - layer.width * minVisible;
      const minY = -layer.height * (1 - minVisible);
      const maxY = h - layer.height * minVisible;
      newX = Math.max(minX, Math.min(maxX, newX));
      newY = Math.max(minY, Math.min(maxY, newY));
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

    // --- Safe area dragging (takes priority over other interactions) ---
    const safeDrag = safeAreaDragRef.current;
    if (safeDrag && canvasRef.current) {
      e.preventDefault();
      e.stopPropagation();
      const rect = canvasRef.current.getBoundingClientRect();
      const deltaPctX = ((e.clientX - safeDrag.startX) / rect.width) * 100;
      const deltaPctY = ((e.clientY - safeDrag.startY) / rect.height) * 100;
      const start = safeDrag.startArea;
      let { top, right, bottom, left } = start;
      const MIN = 0;
      const edge = safeDrag.edge;

      switch (edge) {
        case 'move':
          left = Math.max(MIN, Math.min(100 - start.right - MIN, start.left + deltaPctX));
          top = Math.max(MIN, Math.min(100 - start.bottom - MIN, start.top + deltaPctY));
          right = start.right + (start.left - left);
          bottom = start.bottom + (start.top - top);
          break;
        case 'top':
          top = Math.max(MIN, Math.min(100 - start.bottom - MIN, start.top + deltaPctY));
          break;
        case 'bottom':
          bottom = Math.max(MIN, Math.min(100 - start.top - MIN, start.bottom - deltaPctY));
          break;
        case 'left':
          left = Math.max(MIN, Math.min(100 - start.right - MIN, start.left + deltaPctX));
          break;
        case 'right':
          right = Math.max(MIN, Math.min(100 - start.left - MIN, start.right - deltaPctX));
          break;
        case 'top-left':
          top = Math.max(MIN, Math.min(100 - start.bottom - MIN, start.top + deltaPctY));
          left = Math.max(MIN, Math.min(100 - start.right - MIN, start.left + deltaPctX));
          break;
        case 'top-right':
          top = Math.max(MIN, Math.min(100 - start.bottom - MIN, start.top + deltaPctY));
          right = Math.max(MIN, Math.min(100 - start.left - MIN, start.right - deltaPctX));
          break;
        case 'bottom-left':
          bottom = Math.max(MIN, Math.min(100 - start.top - MIN, start.bottom - deltaPctY));
          left = Math.max(MIN, Math.min(100 - start.right - MIN, start.left + deltaPctX));
          break;
        case 'bottom-right':
          bottom = Math.max(MIN, Math.min(100 - start.top - MIN, start.bottom - deltaPctY));
          right = Math.max(MIN, Math.min(100 - start.left - MIN, start.right - deltaPctX));
          break;
      }
      // Magnetic snap — when a side's value gets close to its opposite side,
      // snap it to match. This makes it easy to create symmetric safe areas.
      const SNAP_THRESHOLD = 0.5; // % — how close before snapping kicks in
      let snapH = false;
      let snapV = false;
      if (edge !== 'move') {
        if (edge === 'top' || edge === 'top-left' || edge === 'top-right') {
          if (Math.abs(top - bottom) < SNAP_THRESHOLD) { top = bottom; snapH = true; }
        }
        if (edge === 'bottom' || edge === 'bottom-left' || edge === 'bottom-right') {
          if (Math.abs(bottom - top) < SNAP_THRESHOLD) { bottom = top; snapH = true; }
        }
        if (edge === 'left' || edge === 'top-left' || edge === 'bottom-left') {
          if (Math.abs(left - right) < SNAP_THRESHOLD) { left = right; snapV = true; }
        }
        if (edge === 'right' || edge === 'top-right' || edge === 'bottom-right') {
          if (Math.abs(right - left) < SNAP_THRESHOLD) { right = left; snapV = true; }
        }
      }
      setSafeAreaSnap({ horizontal: snapH, vertical: snapV });
      onSafeAreaChangeRef.current?.({ top, right, bottom, left });
      return; // Don't process other interactions while dragging safe area
    }

    // --- Two-finger pinch + rotate (smoothed) ---
    const pinch = pinchStateRef.current;
    if (pinch && pointersRef.current.size >= 2) {
      e.preventDefault();
      const pts = Array.from(pointersRef.current.values());
      const dx = pts[1].x - pts[0].x;
      const dy = pts[1].y - pts[0].y;
      const currentDistance = Math.hypot(dx, dy);
      const currentAngle = Math.atan2(dy, dx);

      // Dead zone: ignore tiny movements to reduce jitter when fingers are
      // barely moving. This makes the gesture feel "stable" until the user
      // clearly intends to scale/rotate.
      const lastDelta = pinch.lastDelta ?? { dist: pinch.startDistance, angle: pinch.startAngle };
      const distMoved = Math.abs(currentDistance - lastDelta.dist);
      const angleMoved = Math.abs((currentAngle - lastDelta.angle) * (180 / Math.PI));
      if (distMoved < 1.5 && angleMoved < 1.5) {
        return; // ignore micro-movements
      }

      // Smoothed scale factor — blend raw factor with previous to reduce jitter.
      // A small alpha keeps the gesture responsive while damping noise.
      const rawScaleFactor = currentDistance / pinch.startDistance;
      const prevScaleFactor = pinch.lastScaleFactor ?? rawScaleFactor;
      const SMOOTH_ALPHA = 0.4;
      const scaleFactor = prevScaleFactor * (1 - SMOOTH_ALPHA) + rawScaleFactor * SMOOTH_ALPHA;

      // Clamp scale factor to avoid extreme jumps from noisy input
      const clampedScale = Math.max(0.1, Math.min(10, scaleFactor));
      const newWidth = Math.max(10, pinch.startWidth * clampedScale);
      const newHeight = Math.max(10, pinch.startHeight * clampedScale);

      // Keep center fixed
      const newX = pinch.centerX - newWidth / 2;
      const newY = pinch.centerY - newHeight / 2;

      // Rotation delta (degrees) — smoothed
      const rawAngleDelta = (currentAngle - pinch.startAngle) * (180 / Math.PI);
      const prevAngleDelta = pinch.lastAngleDelta ?? rawAngleDelta;
      const angleDelta = prevAngleDelta * (1 - SMOOTH_ALPHA) + rawAngleDelta * SMOOTH_ALPHA;
      let newRotation = pinch.startRotation + angleDelta;

      // Magnetic snapping to 45° increments (less aggressive threshold for smoothness)
      const SNAP_THRESHOLD = 4; // degrees — how close before snapping
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
        const newFontSize = Math.max(1, Math.round(pinch.startFontSize * clampedScale));
        (updates as Record<string, unknown>).fontSize = newFontSize;
        if (pinch.startBoxWidth !== undefined) {
          (updates as Record<string, unknown>).boxWidth = Math.max(20, pinch.startBoxWidth * clampedScale);
        } else {
          delete (updates as Record<string, unknown>).width;
          delete (updates as Record<string, unknown>).height;
        }
      }
      if (pinch.startStrokeWidth !== undefined) {
        (updates as Record<string, unknown>).strokeWidth = Math.max(0, pinch.startStrokeWidth * clampedScale);
      }
      if (pinch.startImageScale !== undefined) {
        (updates as Record<string, unknown>).imageScale = Math.max(0.1, pinch.startImageScale * clampedScale);
      }

      onLayerChangeRef.current(pinch.layerId, updates, false);

      // Persist smoothed values for the next move event
      setPinchState((prev) => prev ? {
        ...prev,
        lastScaleFactor: scaleFactor,
        lastAngleDelta: angleDelta,
        lastDelta: { dist: currentDistance, angle: currentAngle },
      } : prev);
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
    // End safe area drag
    if (safeAreaDragRef.current) {
      e.stopPropagation();
      if (canvasRef.current) {
        try {
          canvasRef.current.releasePointerCapture?.(e.pointerId);
        } catch {
          // ignore
        }
      }
      setSafeAreaDrag(null);
      setSafeAreaSnap({ horizontal: false, vertical: false });
    }
  }, []);

  // ─── Safe area drag handlers ──────────────────────────────────────────────
  const handleSafeAreaPointerDown = useCallback((e: React.PointerEvent, edge: 'move' | 'top' | 'right' | 'bottom' | 'left' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right') => {
    if (!safeAreaEditMode) return;
    const area = safeAreaRef.current;
    if (!area) return;
    e.stopPropagation();
    e.preventDefault();
    // Capture pointer on the canvas container so move events keep firing
    // even when the pointer moves outside the handle div (especially on mobile)
    if (canvasRef.current) {
      try {
        canvasRef.current.setPointerCapture?.(e.pointerId);
      } catch {
        // ignore — some browsers throw if the pointer is already captured
      }
    }
    setSafeAreaDrag({
      edge,
      startX: e.clientX,
      startY: e.clientY,
      startArea: { ...area },
    });
  }, [safeAreaEditMode]);

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

      // Ignore pinch start if fingers are too close — causes extreme sensitivity
      if (startDistance < 20) return;

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
        showGrid && hasLayerOutsideSafeArea() && 'ring-4 ring-error shadow-2xl shadow-error',
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
      onClick={(e) => {
        // Suppress click that follows a double-tap (would close the just-opened modal)
        if (suppressClickRef.current) {
          e.stopPropagation();
          return;
        }
        onSelectLayer(null);
      }}
      onDoubleClick={(e) => {
        // Suppress dblclick that follows a double-tap pointerdown on mobile
        if (suppressClickRef.current) {
          e.stopPropagation();
        }
      }}
    >
      {/* Safe area — dashed border using custom or default insets (hidden during export) */}
      {showGrid && (() => {
        const area = safeArea || DEFAULT_SAFE_AREA;
        const editMode = safeAreaEditMode;
        const resetLabel = safeAreaResetLabel;
        return (
          <div
            className={cn(
              'absolute z-30 border-6 border-dashed',
              editMode ? 'pointer-events-auto cursor-move border-brand-primary' : 'pointer-events-none border-layer-selected/30'
            )}
            style={{
              top: `${area.top}%`,
              left: `${area.left}%`,
              right: `${area.right}%`,
              bottom: `${area.bottom}%`,
              touchAction: 'none',
            }}
            onPointerDown={editMode ? (e) => handleSafeAreaPointerDown(e, 'move') : undefined}
            onPointerMove={editMode ? handlePointerMove : undefined}
            onPointerUp={editMode ? handlePointerEnd : undefined}
            onPointerCancel={editMode ? handlePointerEnd : undefined}
          >
            {editMode && (
              <>
                {/* Reset button — positioned above the safe area top-right corner */}
                <Button
                  size="md"
                  onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
                  onClick={(e) => { e.stopPropagation(); onSafeAreaChangeRef.current?.({ ...DEFAULT_SAFE_AREA }); }}
                  className="absolute -top-12 right-0 gap-2 text-base shadow-lg"
                >
                  <LuRotateCcw className="h-5 w-5" />
                  {resetLabel}
                </Button>
                {/* Edge drag buttons — only arrows, positioned outside the box.
                    Number labels are rendered separately inside the safe area. */}
                {/* TOP — centered on top edge */}
                <button
                  type="button"
                  onPointerDown={(e) => handleSafeAreaPointerDown(e, 'top')}
                  className="absolute -top-9 left-1/2 flex h-16 w-28 -translate-x-1/2 cursor-ns-resize touch-none items-center justify-center rounded-xl border-2 border-brand-primary bg-card-bg text-brand-primary shadow-lg transition-colors hover:bg-brand-primary hover:text-primary-text"
                  aria-label="Top"
                >
                  <LuArrowUp className="h-8 w-8" />
                </button>
                {/* BOTTOM — centered on bottom edge */}
                <button
                  type="button"
                  onPointerDown={(e) => handleSafeAreaPointerDown(e, 'bottom')}
                  className="absolute -bottom-9 left-1/2 flex h-16 w-28 -translate-x-1/2 cursor-ns-resize touch-none items-center justify-center rounded-xl border-2 border-brand-primary bg-card-bg text-brand-primary shadow-lg transition-colors hover:bg-brand-primary hover:text-primary-text"
                  aria-label="Bottom"
                >
                  <LuArrowDown className="h-8 w-8" />
                </button>
                {/* LEFT — centered on left edge */}
                <button
                  type="button"
                  onPointerDown={(e) => handleSafeAreaPointerDown(e, 'left')}
                  className="absolute -left-12 top-1/2 flex h-28 w-16 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center rounded-xl border-2 border-brand-primary bg-card-bg text-brand-primary shadow-lg transition-colors hover:bg-brand-primary hover:text-primary-text"
                  aria-label="Left"
                >
                  <LuArrowLeft className="h-8 w-8" />
                </button>
                {/* RIGHT — centered on right edge */}
                <button
                  type="button"
                  onPointerDown={(e) => handleSafeAreaPointerDown(e, 'right')}
                  className="absolute -right-12 top-1/2 flex h-28 w-16 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center rounded-xl border-2 border-brand-primary bg-card-bg text-brand-primary shadow-lg transition-colors hover:bg-brand-primary hover:text-primary-text"
                  aria-label="Right"
                >
                  <LuArrowRight className="h-8 w-8" />
                </button>

                {/* Number labels — inside the safe area, just behind each edge.
                    Non-interactive (pointer-events-none) so they don't block
                    layer dragging. */}
                <div className="pointer-events-none absolute inset-0 select-none">
                  <span className="absolute left-1/2 top-6 -translate-x-1/2 text-3xl font-bold text-brand-primary/40">
                    {area.top.toFixed(1)}%
                  </span>
                  <span className="absolute bottom-6 left-1/2 -translate-x-1/2 text-3xl font-bold text-brand-primary/40">
                    {area.bottom.toFixed(1)}%
                  </span>
                  <span className="absolute left-6 top-1/2 -translate-y-1/2 text-3xl font-bold text-brand-primary/40">
                    {area.left.toFixed(1)}%
                  </span>
                  <span className="absolute right-6 top-1/2 -translate-y-1/2 text-3xl font-bold text-brand-primary/40">
                    {area.right.toFixed(1)}%
                  </span>
                </div>
                {/* Corner handles — large transparent touch area with visible dot */}
                <div onPointerDown={(e) => handleSafeAreaPointerDown(e, 'top-left')} className="absolute -top-4 -left-4 h-8 w-8 cursor-nwse-resize touch-none">
                  <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-primary" />
                </div>
                <div onPointerDown={(e) => handleSafeAreaPointerDown(e, 'top-right')} className="absolute -top-4 -right-4 h-8 w-8 cursor-nesw-resize touch-none">
                  <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-primary" />
                </div>
                <div onPointerDown={(e) => handleSafeAreaPointerDown(e, 'bottom-left')} className="absolute -bottom-4 -left-4 h-8 w-8 cursor-nesw-resize touch-none">
                  <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-primary" />
                </div>
                <div onPointerDown={(e) => handleSafeAreaPointerDown(e, 'bottom-right')} className="absolute -bottom-4 -right-4 h-8 w-8 cursor-nwse-resize touch-none">
                  <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-primary" />
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* Safe area snap guide lines — shown during drag when top≈bottom
          (horizontal match) or left≈right (vertical match). The line is
          drawn on the opposite edge so the user sees the match visually. */}
      {showGrid && safeAreaEditMode && safeAreaDrag && (() => {
        const area = safeArea || DEFAULT_SAFE_AREA;
        return (
          <>
            {/* Horizontal snap — top matches bottom: show lines on BOTH edges */}
            {safeAreaSnap.horizontal && (
              <>
                {/* Top edge line */}
                <div
                  className="pointer-events-none absolute left-0 right-0 z-40 border-t-4 border-brand-primary"
                  style={{ top: `${area.top}%`, height: 0 }}
                />
                {/* Bottom edge line */}
                <div
                  className="pointer-events-none absolute left-0 right-0 z-40 border-t-4 border-brand-primary"
                  style={{ top: `${100 - area.bottom}%`, height: 0 }}
                />
              </>
            )}
            {/* Vertical snap — left matches right: show lines on BOTH edges */}
            {safeAreaSnap.vertical && (
              <>
                {/* Left edge line */}
                <div
                  className="pointer-events-none absolute top-0 bottom-0 z-40 border-l-4 border-brand-primary"
                  style={{ left: `${area.left}%`, width: 0 }}
                />
                {/* Right edge line */}
                <div
                  className="pointer-events-none absolute top-0 bottom-0 z-40 border-l-4 border-brand-primary"
                  style={{ left: `${100 - area.right}%`, width: 0 }}
                />
              </>
            )}
          </>
        );
      })()}

      {sortedLayers.map((layer) => (
        <LayerRenderer
          key={layer.id}
          layer={layer}
          isSelected={layer.id === selectedLayerId}
          onPointerDown={(e) => handlePointerDown(e, layer.id)}
          onLayerChange={onLayerChange}
          onRetryUpload={onRetryUpload ? (id: string) => onRetryUploadRef.current?.(id) : undefined}
          onDoubleClick={(e) => {
            // Suppress dblclick that follows a mobile double-tap pointerdown
            if (suppressClickRef.current) {
              e.stopPropagation();
              return;
            }
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

      {/* Warning text — shown when elements are outside the safe area */}
      {showGrid && hasLayerOutsideSafeArea() && (
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-40 flex items-center justify-center bg-error/90 py-1.5 text-center text-sm font-medium text-white">
          {safeAreaWarningLabel}
        </div>
      )}
    </div>
  );
});

export default Canvas;
