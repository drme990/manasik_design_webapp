interface EyeDropperOpenResult {
  sRGBHex: string;
}

interface EyeDropper {
  open(): Promise<EyeDropperOpenResult>;
}

interface WindowWithEyeDropper extends Window {
  EyeDropper?: {
    new(): EyeDropper;
  };
}

export async function pickColor(): Promise<string | null> {
  // Check if native EyeDropper API is available
  if (typeof window !== 'undefined' && 'EyeDropper' in window) {
    try {
      const windowWithEyeDropper = window as WindowWithEyeDropper;
      const EyeDropperConstructor = windowWithEyeDropper.EyeDropper;
      if (!EyeDropperConstructor) return null;

      const eyeDropper = new EyeDropperConstructor();
      const result = await eyeDropper.open();
      return result.sRGBHex;
    } catch (error) {
      console.error('EyeDropper failed:', error);
      return null;
    }
  }

  // Fallback: Use canvas-based color picking
  return pickColorFromCanvas();
}

async function pickColorFromCanvas(): Promise<string | null> {
  try {
    // Create a temporary canvas to capture the screen
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }

    // Set canvas size to window size
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Capture the current page
    // Note: This is a simplified version. In production, you'd use html-to-image
    // to capture the specific element you want to pick from
    const htmlToImage = await import('html-to-image');
    const dataUrl = await htmlToImage.toPng(document.body);

    const img = new Image();
    img.src = dataUrl;

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    ctx.drawImage(img, 0, 0);

    // Get the center pixel color (this would be user-selected in a real implementation)
    const centerX = Math.floor(canvas.width / 2);
    const centerY = Math.floor(canvas.height / 2);
    const pixelData = ctx.getImageData(centerX, centerY, 1, 1).data;

    return rgbToHex(pixelData[0], pixelData[1], pixelData[2]);
  } catch (error) {
    console.error('Canvas color picking failed:', error);
    return null;
  }
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

export function hasNativeEyeDropper(): boolean {
  return typeof window !== 'undefined' && 'EyeDropper' in window;
}

export async function pickColorFromElement(element: HTMLElement, x: number, y: number): Promise<string | null> {
  try {
    const htmlToImage = await import('html-to-image');
    const dataUrl = await htmlToImage.toPng(element);

    const img = new Image();
    img.src = dataUrl;

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }

    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    // Scale coordinates if element size differs from image size
    const scaleX = img.width / element.offsetWidth;
    const scaleY = img.height / element.offsetHeight;
    const pixelX = Math.floor(x * scaleX);
    const pixelY = Math.floor(y * scaleY);

    const pixelData = ctx.getImageData(pixelX, pixelY, 1, 1).data;
    return rgbToHex(pixelData[0], pixelData[1], pixelData[2]);
  } catch (error) {
    console.error('Element color picking failed:', error);
    return null;
  }
}