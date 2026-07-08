import { PDFDocument, PDFPage, rgb, StandardFonts, type Color, type PDFFont } from 'pdf-lib';
import { loadImage } from './image-utils';

export async function createBlankPdf(): Promise<PDFDocument> {
  return await PDFDocument.create();
}

export async function loadPdf(pdfBytes: Uint8Array): Promise<PDFDocument> {
  return await PDFDocument.load(pdfBytes);
}

export async function addImageToPdf(
  pdfDoc: PDFDocument,
  imageSrc: string,
  options: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    page?: number;
  } = {}
): Promise<void> {
  const { x = 0, y = 0, width, height, page = 0 } = options;

  const img = await loadImage(imageSrc);
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  ctx.drawImage(img, 0, 0);
  const imageBytes = canvas.toDataURL('image/jpeg');

  const pdfImage = await pdfDoc.embedJpg(imageBytes);
  const pages = pdfDoc.getPages();

  if (page >= pages.length) {
    throw new Error('Page index out of bounds');
  }

  const pdfPage = pages[page];
  const { width: pageWidth, height: pageHeight } = pdfPage.getSize();

  const imgWidth = width || pageWidth;
  const imgHeight = height || (imgWidth / (img.width / img.height));

  pdfPage.drawImage(pdfImage, {
    x,
    y,
    width: imgWidth,
    height: imgHeight
  });
}

export async function addPageToPdf(
  pdfDoc: PDFDocument,
  options: {
    width?: number;
    height?: number;
  } = {}
): Promise<PDFPage> {
  const { width = 595.28, height = 841.89 } = options; // A4 size in points
  return pdfDoc.addPage([width, height]);
}

export async function createPdfFromImages(
  images: string[],
  options: {
    pageSize?: { width: number; height: number };
    fit?: 'cover' | 'contain' | 'fill';
  } = {}
): Promise<Uint8Array> {
  const pdfDoc = await createBlankPdf();
  const { pageSize = { width: 595.28, height: 841.89 }, fit = 'contain' } = options;

  for (const imageSrc of images) {
    const page = await addPageToPdf(pdfDoc, pageSize);

    const img = await loadImage(imageSrc);
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }

    ctx.drawImage(img, 0, 0);
    const imageBytes = canvas.toDataURL('image/jpeg');
    const pdfImage = await pdfDoc.embedJpg(imageBytes);

    const { width: pageWidth, height: pageHeight } = page.getSize();
    const imgRatio = img.width / img.height;
    const pageRatio = pageWidth / pageHeight;

    let imgWidth, imgHeight, x, y;

    switch (fit) {
      case 'cover':
        if (imgRatio > pageRatio) {
          imgHeight = pageHeight;
          imgWidth = imgHeight * imgRatio;
          x = (pageWidth - imgWidth) / 2;
          y = 0;
        } else {
          imgWidth = pageWidth;
          imgHeight = imgWidth / imgRatio;
          x = 0;
          y = (pageHeight - imgHeight) / 2;
        }
        break;
      case 'fill':
        imgWidth = pageWidth;
        imgHeight = pageHeight;
        x = 0;
        y = 0;
        break;
      case 'contain':
      default:
        if (imgRatio > pageRatio) {
          imgWidth = pageWidth;
          imgHeight = imgWidth / imgRatio;
          x = 0;
          y = (pageHeight - imgHeight) / 2;
        } else {
          imgHeight = pageHeight;
          imgWidth = imgHeight * imgRatio;
          x = (pageWidth - imgWidth) / 2;
          y = 0;
        }
        break;
    }

    page.drawImage(pdfImage, {
      x,
      y,
      width: imgWidth,
      height: imgHeight
    });
  }

  return await pdfDoc.save();
}

export async function savePdf(pdfBytes: Uint8Array, filename: string = 'document.pdf'): Promise<void> {
  const buffer = new ArrayBuffer(pdfBytes.byteLength);
  const view = new Uint8Array(buffer);
  view.set(pdfBytes);
  const blob = new Blob([buffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

export async function getPdfBytes(pdfDoc: PDFDocument): Promise<Uint8Array> {
  return await pdfDoc.save();
}

export async function mergePdfs(pdfBytesArray: Uint8Array[]): Promise<Uint8Array> {
  const mergedPdf = await PDFDocument.create();

  for (const pdfBytes of pdfBytesArray) {
    const pdf = await PDFDocument.load(pdfBytes);
    const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
    pages.forEach((page: PDFPage) => mergedPdf.addPage(page));
  }

  return await mergedPdf.save();
}

export function getA4Size(): { width: number; height: number } {
  return { width: 595.28, height: 841.89 }; // A4 in points
}

export function getLetterSize(): { width: number; height: number } {
  return { width: 612, height: 792 }; // Letter in points
}

export function pixelsToPoints(pixels: number, dpi: number = 72): number {
  return (pixels * dpi) / 72;
}

export function pointsToPixels(points: number, dpi: number = 72): number {
  return (points * 72) / dpi;
}

export async function addTextToPdf(
  pdfDoc: PDFDocument,
  text: string,
  options: {
    x?: number;
    y?: number;
    size?: number;
    font?: PDFFont;
    color?: { r: number; g: number; b: number };
    page?: number;
  } = {}
): Promise<void> {
  const { x = 50, y = 500, size = 12, color = { r: 0, g: 0, b: 0 }, page = 0 } = options;

  const pages = pdfDoc.getPages();

  if (page >= pages.length) {
    throw new Error('Page index out of bounds');
  }

  const pdfPage = pages[page];
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  pdfPage.drawText(text, {
    x,
    y,
    size,
    font,
    color: rgb(color.r / 255, color.g / 255, color.b / 255)
  });
}

export async function addRectangleToPdf(
  pdfDoc: PDFDocument,
  options: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    color?: { r: number; g: number; b: number };
    borderWidth?: number;
    borderColor?: { r: number; g: number; b: number };
    page?: number;
  } = {}
): Promise<void> {
  const {
    x = 50,
    y = 500,
    width = 100,
    height = 50,
    color = { r: 0.9, g: 0.9, b: 0.9 },
    borderWidth = 1,
    borderColor = { r: 0, g: 0, b: 0 },
    page = 0
  } = options;

  const pages = pdfDoc.getPages();

  if (page >= pages.length) {
    throw new Error('Page index out of bounds');
  }

  const pdfPage = pages[page];

  pdfPage.drawRectangle({
    x,
    y,
    width,
    height,
    color: rgb(color.r, color.g, color.b),
    borderWidth,
    borderColor: rgb(borderColor.r, borderColor.g, borderColor.b)
  });
}