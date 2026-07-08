export function validateProjectName(name: string): boolean {
  return name.trim().length > 0;
}

export function validateCanvasSize(size: number): boolean {
  return size >= 50 && size <= 6000;
}

export function validateHexColor(hex: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(hex);
}