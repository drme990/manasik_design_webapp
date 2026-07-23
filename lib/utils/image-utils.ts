import { fileToBase64 } from './file';

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return fileToBase64(file).then(base64 => loadImage(base64));
}

export function resizeImage(
  img: HTMLImageElement,
  maxWidth: number,
  maxHeight: number,
  quality: number = 0.92
): Promise<string> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Failed to get canvas context'));
      return;
    }

    let width = img.width;
    let height = img.height;

    // Calculate new dimensions while maintaining aspect ratio
    if (width > maxWidth || height > maxHeight) {
      const ratio = Math.min(maxWidth / width, maxHeight / height);
      width = width * ratio;
      height = height * ratio;
    }

    canvas.width = width;
    canvas.height = height;

    ctx.drawImage(img, 0, 0, width, height);

    resolve(canvas.toDataURL('image/jpeg', quality));
  });
}

export function cropImage(
  img: HTMLImageElement,
  cropX: number,
  cropY: number,
  cropWidth: number,
  cropHeight: number
): string {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  canvas.width = cropWidth;
  canvas.height = cropHeight;

  ctx.drawImage(
    img,
    cropX, cropY, cropWidth, cropHeight,
    0, 0, cropWidth, cropHeight
  );

  return canvas.toDataURL('image/png');
}

export function rotateImage(img: HTMLImageElement, degrees: number): string {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  const radians = degrees * (Math.PI / 180);

  if (degrees === 90 || degrees === 270) {
    canvas.width = img.height;
    canvas.height = img.width;
  } else {
    canvas.width = img.width;
    canvas.height = img.height;
  }

  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(radians);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);

  return canvas.toDataURL('image/png');
}

export function flipImage(img: HTMLImageElement, horizontal: boolean, vertical: boolean): string {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  canvas.width = img.width;
  canvas.height = img.height;

  ctx.save();

  if (horizontal) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }

  if (vertical) {
    ctx.translate(0, canvas.height);
    ctx.scale(1, -1);
  }

  ctx.drawImage(img, 0, 0);
  ctx.restore();

  return canvas.toDataURL('image/png');
}

export function getImageDimensions(src: string): Promise<{ width: number; height: number }> {
  return loadImage(src).then(img => ({
    width: img.width,
    height: img.height
  }));
}

export function calculateAspectRatioFit(
  srcWidth: number,
  srcHeight: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  const ratio = Math.min(maxWidth / srcWidth, maxHeight / srcHeight);
  return {
    width: srcWidth * ratio,
    height: srcHeight * ratio
  };
}

export function calculateAspectRatioCover(
  srcWidth: number,
  srcHeight: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number; x: number; y: number } {
  const srcRatio = srcWidth / srcHeight;
  const destRatio = maxWidth / maxHeight;

  let width, height, x, y;

  if (srcRatio > destRatio) {
    height = maxHeight;
    width = height * srcRatio;
    x = (maxWidth - width) / 2;
    y = 0;
  } else {
    width = maxWidth;
    height = width / srcRatio;
    x = 0;
    y = (maxHeight - height) / 2;
  }

  return { width, height, x, y };
}

export function compressImage(
  src: string,
  quality: number = 0.8,
  maxWidth: number = 1920,
  maxHeight: number = 1080
): Promise<string> {
  return loadImage(src).then(img => {
    if (img.width <= maxWidth && img.height <= maxHeight) {
      return src; // No compression needed
    }
    return resizeImage(img, maxWidth, maxHeight, quality);
  });
}

export function grayscaleImage(img: HTMLImageElement): string {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  canvas.width = img.width;
  canvas.height = img.height;

  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
    data[i] = avg;     // red
    data[i + 1] = avg; // green
    data[i + 2] = avg; // blue
  }

  ctx.putImageData(imageData, 0, 0);

  return canvas.toDataURL('image/png');
}

export function addWatermark(
  img: HTMLImageElement,
  watermarkText: string,
  options: {
    fontSize?: number;
    color?: string;
    x?: number;
    y?: number;
    opacity?: number;
  } = {}
): string {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  canvas.width = img.width;
  canvas.height = img.height;

  ctx.drawImage(img, 0, 0);

  const {
    fontSize = 24,
    color = 'rgba(255, 255, 255, 0.5)',
    x = 20,
    y = canvas.height - 20,
    opacity = 0.5
  } = options;

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.font = `${fontSize}px Arial`;
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(watermarkText, x, y);
  ctx.restore();

  return canvas.toDataURL('image/png');
}