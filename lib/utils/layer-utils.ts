import type { AnyLayer, TextLayer, ImageLayer, ShapeLayer, DynamicFieldLayer } from '@/types';
import { generateId } from './id';
import { ARABIC_SAFE_FONTS } from '../constants/arabic-fonts';

// Default values
const DEFAULT_FONT_SIZE = 24;
const DEFAULT_COLOR = '#000000';
const DEFAULT_BORDER_COLOR = '#000000';
const DEFAULT_FILL_COLOR = '#ffffff';
const DEFAULT_STROKE_COLOR = '#000000';

export function buildTextLayer(options: {
  x?: number;
  y?: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  canvasWidth?: number;
  canvasHeight?: number;
}): TextLayer {
  const {
    x = 50,
    y = 50,
    text = '',
    fontSize = DEFAULT_FONT_SIZE,
    fontFamily = ARABIC_SAFE_FONTS[0].id,
    color = DEFAULT_COLOR,
    canvasWidth = 1080,
    canvasHeight = 1080
  } = options;

  return {
    id: generateId(),
    type: 'text',
    x,
    y,
    width: canvasWidth * 0.5,
    height: fontSize * 1.5,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
    visible: true,
    locked: false,
    name: 'نص',
    text,
    fontFamily,
    fontSize,
    color,
    bold: false,
    italic: false,
    align: 'center',
    verticalAlign: 'middle',
    lineHeight: 1.3,
    direction: 'auto'
  };
}

export function buildImageLayer(options: {
  uri: string;
  naturalWidth: number;
  naturalHeight: number;
  x?: number;
  y?: number;
  canvasWidth?: number;
  canvasHeight?: number;
}): ImageLayer {
  const {
    uri,
    naturalWidth,
    naturalHeight,
    x = 50,
    y = 50,
    canvasWidth = 1080,
    canvasHeight = 1080
  } = options;

  // Default to 60% of canvas
  const defaultMaskWidth = canvasWidth * 0.6;
  const defaultMaskHeight = (defaultMaskWidth / naturalWidth) * naturalHeight;

  // Calculate scale to cover the mask
  const imageScale = Math.max(
    defaultMaskWidth / naturalWidth,
    defaultMaskHeight / naturalHeight
  ) * 1.1;

  return {
    id: generateId(),
    type: 'image',
    x,
    y,
    width: defaultMaskWidth,
    height: defaultMaskHeight,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
    visible: true,
    locked: false,
    name: 'صورة',
    uri,
    originalUri: uri,
    originalNaturalWidth: naturalWidth,
    originalNaturalHeight: naturalHeight,
    naturalWidth,
    naturalHeight,
    maskWidth: defaultMaskWidth,
    maskHeight: defaultMaskHeight,
    offsetX: 0,
    offsetY: 0,
    imageScale,
    borderRadius: 0,
    borderColor: DEFAULT_BORDER_COLOR,
    borderWidth: 0,
    flipX: false,
    flipY: false
  };
}

export function buildCollageLayer(options: {
  uris: string[];
  naturalSizes: { width: number; height: number }[];
  layoutId: string;
  canvasWidth: number;
  canvasHeight: number;
}): ImageLayer {
  const { uris, naturalSizes, layoutId, canvasWidth, canvasHeight } = options;

  // Box: 60% of canvas, matching project aspect
  const projectRatio = canvasWidth / canvasHeight;
  const boxSize = Math.min(canvasWidth, canvasHeight) * 0.6;
  let boxW: number, boxH: number;
  if (projectRatio >= 1) {
    boxW = boxSize;
    boxH = boxSize / projectRatio;
  } else {
    boxH = boxSize;
    boxW = boxSize * projectRatio;
  }

  const cells = uris.map((uri, i) => ({
    uri,
    offsetX: 0,
    offsetY: 0,
    scale: 1,
  }));

  return {
    id: generateId(),
    type: 'image',
    x: (canvasWidth - boxW) / 2,
    y: (canvasHeight - boxH) / 2,
    width: boxW,
    height: boxH,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
    visible: true,
    locked: false,
    name: 'كولاج',
    uri: uris[0] || '',
    originalUri: uris[0] || '',
    originalNaturalWidth: naturalSizes[0]?.width ?? 1080,
    originalNaturalHeight: naturalSizes[0]?.height ?? 1080,
    naturalWidth: naturalSizes[0]?.width ?? 1080,
    naturalHeight: naturalSizes[0]?.height ?? 1080,
    maskWidth: boxW,
    maskHeight: boxH,
    offsetX: 0,
    offsetY: 0,
    imageScale: 1,
    borderRadius: 0,
    borderColor: DEFAULT_BORDER_COLOR,
    borderWidth: 0,
    flipX: false,
    flipY: false,
    collage: {
      uris,
      layout: layoutId,
      cells,
      gap: 4,
      bgColor: '#000000',
    },
  };
}

export function buildShapeLayer(options: {
  shape: 'rectangle' | 'rectangle_free' | 'circle' | 'triangle' | 'star_4' | 'star_5' | 'star_6' | 'star_8' | 'line';
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  filled?: boolean;
}): ShapeLayer {
  const {
    shape = 'rectangle',
    x = 50,
    y = 50,
    width = 200,
    height = 200,
    fillColor = DEFAULT_FILL_COLOR,
    strokeColor = DEFAULT_STROKE_COLOR,
    strokeWidth = 2,
    filled = true
  } = options;

  let points: number | undefined;
  if (shape.startsWith('star_')) {
    const starPoints = parseInt(shape.split('_')[1]);
    points = starPoints;
  }

  return {
    id: generateId(),
    type: 'shape',
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
    visible: true,
    locked: false,
    name: `شكل (${shape})`,
    shape,
    fillColor,
    filled,
    strokeColor,
    strokeWidth,
    cornerRadius: shape === 'rectangle_free' ? 20 : 0,
    points
  };
}

export function buildDynamicFieldLayer(options: {
  variableId: string;
  variableName: string;
  fieldType: 'text' | 'image';
  x?: number;
  y?: number;
  fontSize?: number;
  color?: string;
  placeholder?: string;
  imageWidth?: number;
  imageHeight?: number;
}): DynamicFieldLayer {
  const {
    variableId,
    variableName,
    fieldType = 'text',
    x = 50,
    y = 50,
    fontSize = DEFAULT_FONT_SIZE,
    color = DEFAULT_COLOR,
    placeholder = 'اسم العميل',
    imageWidth = 200,
    imageHeight = 200
  } = options;

  return {
    id: generateId(),
    type: 'dynamic_field',
    x,
    y,
    width: fieldType === 'image' ? imageWidth : 300,
    height: fieldType === 'image' ? imageHeight : fontSize * 2,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
    visible: true,
    locked: false,
    name: `حقل (${variableName})`,
    variableId,
    variableName,
    fontSize,
    color,
    placeholder,
    fieldType,
    imageWidth: fieldType === 'image' ? imageWidth : undefined,
    imageHeight: fieldType === 'image' ? imageHeight : undefined,
    backgroundColor: fieldType === 'text' ? '#f0f0f0' : undefined,
    borderColor: '#cccccc',
    borderWidth: 1,
    borderRadius: 4,
    imageFit: 'cover'
  };
}

export function cloneLayer(layer: AnyLayer): AnyLayer {
  const cloned = JSON.parse(JSON.stringify(layer));
  cloned.id = generateId();
  cloned.name = `${layer.name} — نسخة`;
  return cloned;
}

export function nextZIndex(layers: AnyLayer[]): number {
  if (layers.length === 0) return 1;
  return Math.max(...layers.map(l => l.zIndex)) + 1;
}

// Color palette for layer defaults
export const COLOR_PALETTE = [
  '#000000',
  '#ffffff',
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#84cc16',
  '#10b981',
  '#06b6d4',
  '#0ea5e9',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#d946ef',
  '#f43f5e',
];

export function getRandomColor(): string {
  return COLOR_PALETTE[Math.floor(Math.random() * COLOR_PALETTE.length)];
}

export function getLayerTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    text: 'نص',
    image: 'صورة',
    shape: 'شكل',
    dynamic_field: 'حقل ديناميكي'
  };
  return labels[type] || type;
}

export function getShapeLabel(shape: string): string {
  const labels: Record<string, string> = {
    rectangle: 'مستطيل',
    rectangle_free: 'مستطيل حواف',
    circle: 'دائرة',
    triangle: 'مثلث',
    star_4: 'نجمة 4',
    star_5: 'نجمة 5',
    star_6: 'نجمة 6',
    star_8: 'نجمة 8',
    line: 'خط'
  };
  return labels[shape] || shape;
}

export function validateLayer(layer: AnyLayer): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!layer.id || layer.id.trim() === '') {
    errors.push('Layer ID is required');
  }

  if (layer.width <= 0 || layer.height <= 0) {
    errors.push('Layer dimensions must be positive');
  }

  if (layer.type === 'text') {
    const textLayer = layer as TextLayer;
    if (textLayer.fontSize <= 0) {
      errors.push('Font size must be positive');
    }
  }

  if (layer.type === 'image') {
    const imageLayer = layer as ImageLayer;
    if (!imageLayer.uri || imageLayer.uri.trim() === '') {
      errors.push('Image URI is required');
    }
    if (imageLayer.imageScale <= 0) {
      errors.push('Image scale must be positive');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}