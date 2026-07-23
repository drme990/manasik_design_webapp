export type LayerType = 'text' | 'image' | 'shape' | 'dynamic_field';

export type TextAlign = 'left' | 'center' | 'right';
export type TextVerticalAlign = 'top' | 'middle' | 'bottom';
export type TextDirection = 'auto' | 'rtl' | 'ltr';
export type ShapeType = 'rectangle' | 'circle' | 'triangle' | 'star_4' | 'star_5' | 'star_6' | 'star_8' | 'line' | 'png';
export type ImageFit = 'cover' | 'contain';

export interface BaseLayer {
  id: string;
  type: LayerType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  zIndex: number;
  visible: boolean;
  locked: boolean;
  name: string;
}

export interface TextLayer extends BaseLayer {
  type: 'text';
  text: string;
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
  align: TextAlign;
  verticalAlign: TextVerticalAlign;
  lineHeight: number;
  direction: TextDirection;
  boxWidth?: number;
}

export interface ImageLayerCollageCell {
  uri: string;
  offsetX: number;
  offsetY: number;
  scale: number;
  rotation?: number;
  /** Natural dimensions of this cell's source image. Populated at upload/replace
   * time so renderers can compute clamp bounds without re-measuring via onLoad. */
  naturalWidth?: number;
  naturalHeight?: number;
}

export interface ImageLayerCollage {
  uris: string[];
  layout: string;
  cells: ImageLayerCollageCell[];
  gap: number;
  bgColor: string;
  containerRadius: number;
}

export interface ImageLayer extends BaseLayer {
  type: 'image';
  /** Immutable original image URL (R2). Never changes after upload. */
  uri: string;
  /** @deprecated Use cropRect instead. Kept for backward compatibility with old projects. */
  originalUri?: string;
  originalNaturalWidth?: number;
  originalNaturalHeight?: number;
  /**
   * Non-destructive crop area in original image pixel coordinates.
   * The editor renders only this region at runtime; the original image is never modified.
   * Undefined = no crop (show full image).
   */
  cropRect?: { x: number; y: number; width: number; height: number };
  /** Natural dimensions of the original (uncropped) image */
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
  /** Thumbnail URL (smaller version for galleries/lists) */
  thumbnailUri?: string;
  collage?: ImageLayerCollage;
  /**
   * Background upload state for instant-add UX.
   * - 'uploading': file is being uploaded to R2 in the background; `uri`
   *   is a temporary object URL (blob:) so the user can start editing
   *   immediately. When the upload finishes, `uri` is swapped to the R2 URL.
   * - 'error': upload failed; user can tap "re-upload" to retry.
   * - undefined: upload complete or not applicable (uri is already on R2).
   */
  uploadStatus?: 'uploading' | 'error';
  /** The original File, kept in memory only while uploadStatus is set. Not serialized. */
  pendingFile?: File;
}

export interface ShapeLayer extends BaseLayer {
  type: 'shape';
  shape: ShapeType;
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  filled: boolean;
  cornerRadius?: number;
  points?: number;
  /** PNG shape only — R2 URL of the uploaded PNG image */
  uri?: string;
  /** PNG shape only — smaller version for galleries/lists */
  thumbnailUri?: string;
  /** PNG shape only — natural dimensions of the source PNG */
  naturalWidth?: number;
  naturalHeight?: number;
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
  /** Image fields only — collage layout ID when the field can receive
   *  multiple photos (e.g. reservation.photo). Undefined = single image. */
  collageLayout?: string;
  /** Image fields only — gap between collage cells in px */
  collageGap?: number;
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