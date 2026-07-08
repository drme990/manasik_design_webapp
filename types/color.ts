export interface HSVColor {
  h: number; // 0-1
  s: number; // 0-1
  v: number; // 0-1
}

export interface RGBColor {
  r: number; // 0-255
  g: number; // 0-255
  b: number; // 0-255
}

export interface ColorPickerState {
  hsv: HSVColor;
  hex: string;
  rgb: RGBColor;
}

export interface BrandColor {
  name: string;
  hex: string;
}

export type ColorFormat = 'hex' | 'rgb' | 'hsv';