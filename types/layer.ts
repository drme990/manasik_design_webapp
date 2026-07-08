export type LayerType = 'text' | 'image' | 'shape' | 'dynamic_field';

export type TextAlign = 'left' | 'center' | 'right';
export type TextDirection = 'auto' | 'rtl' | 'ltr';
export type ShapeType = 'rectangle' | 'rectangle_free' | 'circle' | 'triangle' | 'star_4' | 'star_5' | 'star_6' | 'star_8' | 'line';
export type ImageFit = 'cover' | 'contain';

export interface BaseLayer {
  id: string;
  type: LayerType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  visible: boolean;
  locked: boolean;
  name: string;
}

export interface TextLayer extends BaseLayer {
  type: 'text';
  text: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
  align: TextAlign;
  lineHeight: number;
  direction: TextDirection;
  boxWidth?: number;
}

export interface ImageLayerCollageCell {
  uri: string;
  offsetX: number;
  offsetY: number;
  scale: number;
}

export interface ImageLayerCollage {
  uris: string[];
  layout: string;
  cells: ImageLayerCollageCell[];
}

export interface ImageLayer extends BaseLayer {
  type: 'image';
  uri: string;
  naturalWidth: number;
  naturalHeight: number;
  maskWidth: number;
  maskHeight: number;
  offsetX: number;
  offsetY: number;
  imageScale: number;
  borderRadius: number;
  borderColor: string;
  borderWidth: number;
  flipX: boolean;
  flipY: boolean;
  collage?: ImageLayerCollage;
}

export interface ShapeLayer extends BaseLayer {
  type: 'shape';
  shape: ShapeType;
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  cornerRadius?: number;
  points?: number;
}

export interface DynamicFieldLayer extends BaseLayer {
  type: 'dynamic_field';
  variableId: string;
  variableName: string;
  fontSize: number;
  color: string;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  imageFit?: ImageFit;
  placeholder: string;
  fieldType: 'text' | 'image';
  imageWidth?: number;
  imageHeight?: number;
}

export type AnyLayer = TextLayer | ImageLayer | ShapeLayer | DynamicFieldLayer;

export interface LayerTransform {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface LayerUpdate {
  id: string;
  updates: Partial<AnyLayer>;
}