import { useState, useRef, useCallback, useEffect } from 'react';

export interface GestureState {
  isDragging: boolean;
  isRotating: boolean;
  isScaling: boolean;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  initialRotation: number;
  initialScale: number;
  centerX: number;
  centerY: number;
}

export interface GestureHandlers {
  onDragStart?: (e: MouseEvent | TouchEvent) => void;
  onDragMove?: (e: MouseEvent | TouchEvent) => void;
  onDragEnd?: (e: MouseEvent | TouchEvent) => void;
  onRotateStart?: (e: MouseEvent | TouchEvent) => void;
  onRotateMove?: (e: MouseEvent | TouchEvent) => void;
  onRotateEnd?: (e: MouseEvent | TouchEvent) => void;
  onScaleStart?: (e: MouseEvent | TouchEvent) => void;
  onScaleMove?: (e: MouseEvent | TouchEvent) => void;
  onScaleEnd?: (e: MouseEvent | TouchEvent) => void;
}

export function useGestures(handlers: GestureHandlers = {}) {
  const [gestureState, setGestureState] = useState<GestureState>({
    isDragging: false,
    isRotating: false,
    isScaling: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    initialRotation: 0,
    initialScale: 1,
    centerX: 0,
    centerY: 0
  });

  const stateRef = useRef(gestureState);
  stateRef.current = gestureState;

  const getEventPosition = useCallback((e: MouseEvent | TouchEvent) => {
    if ('touches' in e) {
      return {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY
      };
    }
    return {
      x: e.clientX,
      y: e.clientY
    };
  }, []);

  const handleDragStart = useCallback((e: MouseEvent | TouchEvent) => {
    e.preventDefault();
    const { x, y } = getEventPosition(e);

    const newState: GestureState = {
      ...stateRef.current,
      isDragging: true,
      startX: x,
      startY: y,
      lastX: x,
      lastY: y
    };

    setGestureState(newState);
    handlers.onDragStart?.(e);
  }, [getEventPosition, handlers]);

  const handleDragMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!stateRef.current.isDragging) return;
    e.preventDefault();

    const { x, y } = getEventPosition(e);
    const deltaX = x - stateRef.current.lastX;
    const deltaY = y - stateRef.current.lastY;

    setGestureState(prev => ({
      ...prev,
      lastX: x,
      lastY: y
    }));

    handlers.onDragMove?.(e);
  }, [getEventPosition, handlers]);

  const handleDragEnd = useCallback((e: MouseEvent | TouchEvent) => {
    if (!stateRef.current.isDragging) return;
    e.preventDefault();

    setGestureState(prev => ({
      ...prev,
      isDragging: false
    }));

    handlers.onDragEnd?.(e);
  }, [handlers]);

  const handleRotateStart = useCallback((e: MouseEvent | TouchEvent) => {
    e.preventDefault();
    const { x, y } = getEventPosition(e);

    const newState: GestureState = {
      ...stateRef.current,
      isRotating: true,
      startX: x,
      startY: y,
      lastX: x,
      lastY: y,
      initialRotation: 0
    };

    setGestureState(newState);
    handlers.onRotateStart?.(e);
  }, [getEventPosition, handlers]);

  const handleRotateMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!stateRef.current.isRotating) return;
    e.preventDefault();

    const { x, y } = getEventPosition(e);
    const centerX = stateRef.current.centerX;
    const centerY = stateRef.current.centerY;

    const angle = Math.atan2(y - centerY, x - centerX);
    const initialAngle = Math.atan2(stateRef.current.startY - centerY, stateRef.current.startX - centerX);
    const rotation = angle - initialAngle;

    setGestureState(prev => ({
      ...prev,
      lastX: x,
      lastY: y,
      initialRotation: rotation
    }));

    handlers.onRotateMove?.(e);
  }, [getEventPosition, handlers]);

  const handleRotateEnd = useCallback((e: MouseEvent | TouchEvent) => {
    if (!stateRef.current.isRotating) return;
    e.preventDefault();

    setGestureState(prev => ({
      ...prev,
      isRotating: false
    }));

    handlers.onRotateEnd?.(e);
  }, [handlers]);

  const handleScaleStart = useCallback((e: MouseEvent | TouchEvent) => {
    e.preventDefault();
    const { x, y } = getEventPosition(e);

    const newState: GestureState = {
      ...stateRef.current,
      isScaling: true,
      startX: x,
      startY: y,
      lastX: x,
      lastY: y,
      initialScale: 1
    };

    setGestureState(newState);
    handlers.onScaleStart?.(e);
  }, [getEventPosition, handlers]);

  const handleScaleMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!stateRef.current.isScaling) return;
    e.preventDefault();

    const { x, y } = getEventPosition(e);
    const centerX = stateRef.current.centerX;
    const centerY = stateRef.current.centerY;

    const initialDistance = Math.sqrt(
      Math.pow(stateRef.current.startX - centerX, 2) +
      Math.pow(stateRef.current.startY - centerY, 2)
    );

    const currentDistance = Math.sqrt(
      Math.pow(x - centerX, 2) +
      Math.pow(y - centerY, 2)
    );

    const scale = currentDistance / initialDistance;

    setGestureState(prev => ({
      ...prev,
      lastX: x,
      lastY: y,
      initialScale: scale
    }));

    handlers.onScaleMove?.(e);
  }, [getEventPosition, handlers]);

  const handleScaleEnd = useCallback((e: MouseEvent | TouchEvent) => {
    if (!stateRef.current.isScaling) return;
    e.preventDefault();

    setGestureState(prev => ({
      ...prev,
      isScaling: false
    }));

    handlers.onScaleEnd?.(e);
  }, [handlers]);

  // Cleanup event listeners
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      handleDragMove(e);
      handleRotateMove(e);
      handleScaleMove(e);
    };

    const handleMouseUp = (e: MouseEvent) => {
      handleDragEnd(e);
      handleRotateEnd(e);
      handleScaleEnd(e);
    };

    const handleTouchMove = (e: TouchEvent) => {
      handleDragMove(e);
      handleRotateMove(e);
      handleScaleMove(e);
    };

    const handleTouchEnd = (e: TouchEvent) => {
      handleDragEnd(e);
      handleRotateEnd(e);
      handleScaleEnd(e);
    };

    if (gestureState.isDragging || gestureState.isRotating || gestureState.isScaling) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      window.addEventListener('touchend', handleTouchEnd);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [gestureState.isDragging, gestureState.isRotating, gestureState.isScaling,
    handleDragMove, handleDragEnd, handleRotateMove, handleRotateEnd,
    handleScaleMove, handleScaleEnd]);

  return {
    gestureState,
    setGestureState,
    handlers: {
      onDragStart: handleDragStart,
      onRotateStart: handleRotateStart,
      onScaleStart: handleScaleStart
    }
  };
}