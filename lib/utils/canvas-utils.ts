import type { Point, Size, Rect } from '@/lib/utils/geometry';

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function getCanvasContext(canvas: HTMLCanvasElement, type: '2d' = '2d'): CanvasRenderingContext2D {
  return canvas.getContext(type) as CanvasRenderingContext2D;
}

export function clearCanvas(canvas: HTMLCanvasElement): void {
  const ctx = getCanvasContext(canvas);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

export function resizeCanvas(canvas: HTMLCanvasElement, width: number, height: number): void {
  canvas.width = width;
  canvas.height = height;
}

export function canvasToDataURL(canvas: HTMLCanvasElement, format: 'image/png' | 'image/jpeg' = 'image/png', quality: number = 0.92): string {
  return canvas.toDataURL(format, quality);
}

export function canvasToBlob(canvas: HTMLCanvasElement, format: 'image/png' | 'image/jpeg' = 'image/png', quality: number = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to convert canvas to blob'));
      }
    }, format, quality);
  });
}

export function drawImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | HTMLCanvasElement,
  x: number,
  y: number,
  width?: number,
  height?: number
): void {
  if (width && height) {
    ctx.drawImage(image, x, y, width, height);
  } else {
    ctx.drawImage(image, x, y);
  }
}

export function drawImageCover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | HTMLCanvasElement,
  rect: Rect
): void {
  const imgRatio = image.width / image.height;
  const rectRatio = rect.width / rect.height;

  let drawWidth, drawHeight, drawX, drawY;

  if (imgRatio > rectRatio) {
    drawHeight = rect.height;
    drawWidth = drawHeight * imgRatio;
    drawX = rect.x - (drawWidth - rect.width) / 2;
    drawY = rect.y;
  } else {
    drawWidth = rect.width;
    drawHeight = drawWidth / imgRatio;
    drawX = rect.x;
    drawY = rect.y - (drawHeight - rect.height) / 2;
  }

  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

export function drawImageContain(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | HTMLCanvasElement,
  rect: Rect
): void {
  const imgRatio = image.width / image.height;
  const rectRatio = rect.width / rect.height;

  let drawWidth, drawHeight, drawX, drawY;

  if (imgRatio > rectRatio) {
    drawWidth = rect.width;
    drawHeight = drawWidth / imgRatio;
    drawX = rect.x;
    drawY = rect.y + (rect.height - drawHeight) / 2;
  } else {
    drawHeight = rect.height;
    drawWidth = drawHeight * imgRatio;
    drawX = rect.x + (rect.width - drawWidth) / 2;
    drawY = rect.y;
  }

  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

export function rotateCanvas(
  ctx: CanvasRenderingContext2D,
  angle: number,
  centerX: number,
  centerY: number
): void {
  ctx.translate(centerX, centerY);
  ctx.rotate(angle);
  ctx.translate(-centerX, -centerY);
}

export function scaleCanvas(
  ctx: CanvasRenderingContext2D,
  scaleX: number,
  scaleY: number,
  centerX: number,
  centerY: number
): void {
  ctx.translate(centerX, centerY);
  ctx.scale(scaleX, scaleY);
  ctx.translate(-centerX, -centerY);
}

export function setCanvasTransform(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rotation: number,
  scaleX: number,
  scaleY: number
): void {
  ctx.setTransform(scaleX, 0, 0, scaleY, x, y);
  ctx.rotate(rotation);
}

export function resetCanvasTransform(ctx: CanvasRenderingContext2D): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

export function measureText(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: string
): TextMetrics {
  ctx.font = font;
  return ctx.measureText(text);
}

export function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  options: {
    font?: string;
    color?: string;
    align?: 'left' | 'center' | 'right';
    baseline?: 'top' | 'middle' | 'bottom';
  } = {}
): void {
  const { font, color, align = 'left', baseline = 'top' } = options;

  if (font) ctx.font = font;
  if (color) ctx.fillStyle = color;

  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(text, x, y);
}

export function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

export function drawCircle(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number
): void {
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.closePath();
}

export function drawStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  spikes: number,
  outerRadius: number,
  innerRadius: number
): void {
  let rot = (Math.PI / 2) * 3;
  let x = cx;
  let y = cy;
  const step = Math.PI / spikes;

  ctx.beginPath();
  ctx.moveTo(cx, cy - outerRadius);

  for (let i = 0; i < spikes; i++) {
    x = cx + Math.cos(rot) * outerRadius;
    y = cy + Math.sin(rot) * outerRadius;
    ctx.lineTo(x, y);
    rot += step;

    x = cx + Math.cos(rot) * innerRadius;
    y = cy + Math.sin(rot) * innerRadius;
    ctx.lineTo(x, y);
    rot += step;
  }

  ctx.lineTo(cx, cy - outerRadius);
  ctx.closePath();
}