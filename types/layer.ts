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
  /**
   * Auto-fit mode — when true, the font size is calculated to FILL the
   * box (grow or shrink) based on the text content + box dimensions.
   * The saved fontSize is ignored. Only used in the template editor
   * (/editor/t/) for dynamic field text layers. In the design editor
   * (/editor/d/), autoFit is kept for the initial render so the
   * useAutoFitFontSize hook can calculate the optimal font size, then
   * it's "baked" into the layer synchronously (fontSize set to the
   * calculated value, autoFit removed, boxWidth set to the layer width)
   * so the text behaves like normal text with a concrete font size that
   * wraps at the box boundary.
   */
  autoFit?: boolean;
  /**
   * Styled spans for text layers inflated from combined dynamic fields.
   * Each span carries its own color/font/weight/style so per-field
   * styling is preserved in the generated design. The `text` field
   * contains the plain joined text (for search/measure fallbacks);
   * `spans` carries the per-segment styling. When present, the canvas
   * renderer draws each span with its own style instead of using the
   * layer-level color for the whole string.
   */
  spans?: Array<{
    text: string;
    color?: string;
    fontFamily?: string;
    bold?: boolean;
    italic?: boolean;
  }>;
  /**
   * Internal flag set by the design editor when stripping autoFit from
   * an inflated dynamic text layer. Tells the LayerRenderer to shrink
   * the box to fit the text on the first measurement (the box was
   * sized for autoFit and is much bigger than the text at fontSize).
   * Stripped after the first measurement — never persisted to the DB.
   */
  _needsInitialFit?: boolean;
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
  /** Reference font size — NOT the rendered size. The actual rendered
   *  size is auto-calculated to fill the box. Kept for backwards
   *  compatibility with saved projects. */
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
  // ── Text properties (for fieldType: 'text') ──────────────────────
  // These are passed through to the inflated text layer. The font size
  // is NOT among them — it's auto-calculated to fill the box.
  fontFamily?: string;
  fontWeight?: number;
  bold?: boolean;
  italic?: boolean;
  align?: TextAlign;
  verticalAlign?: TextVerticalAlign;
  lineHeight?: number;
  direction?: TextDirection;
  // ── Combined fields (text only) ──────────────────────────────────
  // When set, this layer combines multiple dynamic text fields into one
  // text box. Each field is resolved independently, display rules are
  // applied per field (e.g. item.quantity is hidden when qty < 2), and
  // the visible values are joined with a space separator.
  // The primary field is `variableId`; these are the additional fields.
  combinedFields?: string[];
  /** Layout direction for combined fields: 'row' (side by side) or
   *  'column' (stacked vertically). Defaults to 'row'. */
  combineDirection?: 'row' | 'column';
  /** Per-field style overrides for combined fields. Keys are variableIds
   *  (including the primary `variableId`). Only the properties that are
   *  set here override the layer-level (global) values. */
  combinedFieldStyles?: Record<string, {
    color?: string;
    fontFamily?: string;
    bold?: boolean;
    italic?: boolean;
  }>;
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