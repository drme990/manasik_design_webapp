import type { AnyLayer, TextLayer, ImageLayer, ShapeLayer, DynamicFieldLayer } from '@/types';
import { generateId } from './id';
import { ARABIC_SAFE_FONTS } from '../constants/arabic-fonts';

// ─── Default values ──────────────────────────────────────────────────────────

// Canvas / Project
const DEFAULT_CANVAS_WIDTH = 1080;
const DEFAULT_CANVAS_HEIGHT = 1350;       // 4:5 aspect ratio

// Colors
const DEFAULT_COLOR = '#000000';           // Text color
const DEFAULT_FILL_COLOR = '#0A5C36';      // Shape fill (dark green)
const DEFAULT_STROKE_COLOR = '#000000';    // Shape stroke
const DEFAULT_BORDER_COLOR = '#000000';    // Image border

// Font
const DEFAULT_FONT_SIZE = 24;
const DEFAULT_FONT_WEIGHT = 400;           // ARABIC_SAFE_FONTS[0].weight
const DEFAULT_LINE_HEIGHT = 1.3;

// Layer sizing
const TEXT_WIDTH_RATIO = 0.5;              // canvasWidth * 0.5
const TEXT_HEIGHT_RATIO = 1.5;             // fontSize * 1.5
const IMAGE_WIDTH_RATIO = 0.6;             // canvasWidth * 0.6
const IMAGE_COVER_OVERFLOW = 1.1;          // imageScale * 1.1 (10% overflow for pan)
const SHAPE_DEFAULT_SIZE = 200;            // 200×200 default
const COLLAGE_BOX_RATIO = 0.6;             // min(canvasW, canvasH) * 0.6
const DYNAMIC_FIELD_TEXT_WIDTH = 300;
const DYNAMIC_FIELD_TEXT_HEIGHT_RATIO = 2; // fontSize * 2
const DYNAMIC_FIELD_IMAGE_DEFAULT_SIZE = 200;

// Collage built defaults
const COLLAGE_BUILT_GAP = 4;
const COLLAGE_BUILT_BG_COLOR = '#FFFFFF';
const COLLAGE_BUILT_CONTAINER_RADIUS = 50;

// Color palette
const COLOR_PALETTE = [
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
    fontFamily = ARABIC_SAFE_FONTS[0].family,
    color = DEFAULT_COLOR,
    canvasWidth = DEFAULT_CANVAS_WIDTH,
  } = options;

  return {
    id: generateId(),
    type: 'text',
    x,
    y,
    width: canvasWidth * TEXT_WIDTH_RATIO,
    height: fontSize * TEXT_HEIGHT_RATIO,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
    visible: true,
    locked: false,
    name: 'نص',
    text,
    fontFamily,
    fontWeight: DEFAULT_FONT_WEIGHT,
    fontSize,
    color,
    bold: false,
    italic: false,
    align: 'center',
    verticalAlign: 'middle',
    lineHeight: DEFAULT_LINE_HEIGHT,
    direction: 'auto'
  };
}

export function buildImageLayer(options: {
  uri: string;
  naturalWidth: number;
  naturalHeight: number;
  thumbnailUri?: string;
  x?: number;
  y?: number;
  canvasWidth?: number;
  canvasHeight?: number;
}): ImageLayer {
  const {
    uri,
    naturalWidth,
    naturalHeight,
    thumbnailUri,
    x = 50,
    y = 50,
    canvasWidth = DEFAULT_CANVAS_WIDTH,
  } = options;

  // Default to 60% of canvas
  const defaultMaskWidth = canvasWidth * IMAGE_WIDTH_RATIO;
  const defaultMaskHeight = (defaultMaskWidth / naturalWidth) * naturalHeight;

  // Calculate scale to cover the mask
  const imageScale = Math.max(
    defaultMaskWidth / naturalWidth,
    defaultMaskHeight / naturalHeight
  ) * IMAGE_COVER_OVERFLOW;

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
    // Non-destructive: uri is always the immutable original.
    // originalNaturalWidth/Height store the true original dimensions
    // so the crop modal can always reference them even after cropping.
    originalNaturalWidth: naturalWidth,
    originalNaturalHeight: naturalHeight,
    naturalWidth,
    naturalHeight,
    thumbnailUri,
    maskWidth: defaultMaskWidth,
    maskHeight: defaultMaskHeight,
    offsetX: 0,
    offsetY: 0,
    imageScale,
    borderRadius: 50,
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
  const boxSize = Math.min(canvasWidth, canvasHeight) * COLLAGE_BOX_RATIO;
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
    borderRadius: 8,
    borderColor: DEFAULT_BORDER_COLOR,
    borderWidth: 0,
    flipX: false,
    flipY: false,
    collage: {
      uris,
      layout: layoutId,
      cells,
      gap: COLLAGE_BUILT_GAP,
      bgColor: COLLAGE_BUILT_BG_COLOR,
      containerRadius: COLLAGE_BUILT_CONTAINER_RADIUS,
    },
  };
}

export function buildShapeLayer(options: {
  shape: 'rectangle' | 'circle' | 'triangle' | 'star_4' | 'star_5' | 'star_6' | 'star_8' | 'line';
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
    width = SHAPE_DEFAULT_SIZE,
    height = SHAPE_DEFAULT_SIZE,
    fillColor = DEFAULT_FILL_COLOR,
    strokeColor = DEFAULT_STROKE_COLOR,
    strokeWidth = shape === 'line' ? 6 : 2,
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
    cornerRadius: 0,
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
    imageWidth = DYNAMIC_FIELD_IMAGE_DEFAULT_SIZE,
    imageHeight = DYNAMIC_FIELD_IMAGE_DEFAULT_SIZE
  } = options;

  return {
    id: generateId(),
    type: 'dynamic_field',
    x,
    y,
    width: fieldType === 'image' ? imageWidth : DYNAMIC_FIELD_TEXT_WIDTH,
    height: fieldType === 'image' ? imageHeight : fontSize * DYNAMIC_FIELD_TEXT_HEIGHT_RATIO,
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

export { COLOR_PALETTE };

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