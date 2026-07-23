export interface EditorState {
  selectedLayerId: string | null;
  isDragging: boolean;
  isRotating: boolean;
  isScaling: boolean;
  clipboard: unknown[] | null;
  history: HistoryState;
}

export interface HistoryState {
  past: unknown[];
  present: unknown;
  future: unknown[];
  maxHistory: number;
}

export interface SelectionBox {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface HandlePosition {
  x: number;
  y: number;
  type: 'corner' | 'edge' | 'rotation';
  cursor: string;
}

export interface CanvasViewport {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface GestureState {
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  initialRotation: number;
  initialScale: number;
  centerX: number;
  centerY: number;
}