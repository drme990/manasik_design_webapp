'use client';

import { useToast } from '@/components/providers/ToastProvider';

export interface UploadedImage {
  uri: string;
  naturalWidth: number;
  naturalHeight: number;
  thumbnailUri?: string;
}

const THUMBNAIL_MAX_SIZE = 400; // px — max width/height for thumbnails
const THUMBNAIL_QUALITY = 0.8;

/**
 * Load an image from a URL and resolve its natural dimensions.
 */
function loadImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = url;
  });
}

/**
 * Generate a thumbnail from a File using canvas.
 * Returns a JPEG File at most THUMBNAIL_MAX_SIZE px on the longest side.
 */
function generateThumbnail(file: File): Promise<File | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { naturalWidth: w, naturalHeight: h } = img;
        if (w <= THUMBNAIL_MAX_SIZE && h <= THUMBNAIL_MAX_SIZE) {
          // Image is already small enough — no thumbnail needed
          resolve(null);
          return;
        }
        const ratio = Math.min(THUMBNAIL_MAX_SIZE / w, THUMBNAIL_MAX_SIZE / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(null);
              return;
            }
            resolve(new File([blob], `thumb-${file.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' }));
          },
          'image/jpeg',
          THUMBNAIL_QUALITY
        );
      };
      img.onerror = () => resolve(null);
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

/**
 * Upload a file via XHR with progress tracking. Returns the public URL.
 */
function uploadFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file);

    xhr.addEventListener('load', () => {
      try {
        const res = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && res.success) {
          resolve(res.data.url as string);
        } else {
          reject(new Error(res.error || `HTTP ${xhr.status}`));
        }
      } catch {
        reject(new Error(`HTTP ${xhr.status}`));
      }
    });
    xhr.addEventListener('error', () => reject(new Error('Network error')));
    xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));

    xhr.open('POST', '/api/upload');
    xhr.send(formData);
  });
}

/**
 * Create an instant object URL for a File so the user can see and start
 * editing the image immediately while the upload happens in the background.
 * Also reads the natural dimensions from the object URL.
 *
 * Returns the temporary `uri` (blob: URL) + dimensions. The caller is
 * responsible for revoking the object URL after the real R2 URL replaces it.
 */
export function createInstantPreview(file: File): Promise<{
  uri: string;
  naturalWidth: number;
  naturalHeight: number;
}> {
  const uri = URL.createObjectURL(file);
  return loadImageDimensions(uri).then(({ width, height }) => ({
    uri,
    naturalWidth: width,
    naturalHeight: height,
  }));
}

/**
 * Upload a single image file to R2 in the background (no progress toast).
 * Also generates and uploads a thumbnail.
 *
 * Used by the instant-add flow: the layer is already on the canvas with a
 * temporary object URL; this function uploads the real file and returns the
 * R2 URL + thumbnail URL so the caller can swap the layer's `uri`.
 */
export async function uploadImageInBackground(file: File): Promise<UploadedImage> {
  const url = await uploadFile(file);
  const { width, height } = await loadImageDimensions(url);

  // Generate and upload thumbnail silently
  const thumbnailFile = await generateThumbnail(file);
  let thumbnailUri: string | undefined;
  if (thumbnailFile) {
    try {
      thumbnailUri = await uploadFileSilent(thumbnailFile);
    } catch {
      thumbnailUri = undefined;
    }
  }

  return { uri: url, naturalWidth: width, naturalHeight: height, thumbnailUri };
}

/**
 * Upload a file with XHR progress events (no progress tracking).
 * Used for thumbnails (small files, progress not needed).
 */
function uploadFileSilent(file: File): Promise<string> {
  return uploadFile(file);
}

/**
 * Upload a single file to R2 via the /api/upload route using XHR
 * (so we get upload progress events). Shows a progress toast.
 * Also generates and uploads a thumbnail (400px max) for use in galleries/lists.
 *
 * Returns the public URL + natural dimensions + thumbnail URL.
 */
export async function uploadImageWithProgress(
  file: File,
  toast: ReturnType<typeof useToast>,
  progressLabel: string
): Promise<UploadedImage> {
  const toastId = toast.showToast({
    message: progressLabel,
    variant: 'progress',
    progress: 0,
  });

  try {
    // Generate thumbnail client-side (canvas) while the main upload happens
    const thumbnailFile = await generateThumbnail(file);

    const url = await new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('file', file);

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          toast.updateToast(toastId, { progress: pct });
        }
      });

      xhr.addEventListener('load', () => {
        try {
          const res = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300 && res.success) {
            resolve(res.data.url as string);
          } else {
            reject(new Error(res.error || `HTTP ${xhr.status}`));
          }
        } catch {
          reject(new Error(`HTTP ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => reject(new Error('Network error')));
      xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));

      xhr.open('POST', '/api/upload');
      xhr.send(formData);
    });

    const { width, height } = await loadImageDimensions(url);

    // Upload thumbnail silently (small file, no progress needed)
    let thumbnailUri: string | undefined;
    if (thumbnailFile) {
      try {
        thumbnailUri = await uploadFileSilent(thumbnailFile);
      } catch {
        // Thumbnail upload failure is non-fatal
        thumbnailUri = undefined;
      }
    }

    toast.updateToast(toastId, {
      message: 'تم رفع الصورة بنجاح',
      variant: 'success',
      progress: 100,
      duration: 2000,
    });

    return { uri: url, naturalWidth: width, naturalHeight: height, thumbnailUri };
  } catch (error) {
    console.error('Image upload failed:', error);
    toast.updateToast(toastId, {
      message: 'فشل رفع الصورة',
      variant: 'error',
      duration: 3000,
    });
    throw error;
  }
}

/**
 * Upload multiple files with a single combined progress toast.
 */
export async function uploadImagesWithProgress(
  files: File[],
  toast: ReturnType<typeof useToast>,
  progressLabel: string,
  doneLabel: string
): Promise<UploadedImage[]> {
  if (files.length === 0) return [];

  const toastId = toast.showToast({
    message: progressLabel,
    variant: 'progress',
    progress: 0,
  });

  const results: UploadedImage[] = [];
  let completed = 0;

  try {
    for (const file of files) {
      const url = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const formData = new FormData();
        formData.append('file', file);

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            // Per-file progress within the overall batch
            const filePct = (e.loaded / e.total) * 100;
            const overall = ((completed + filePct / 100) / files.length) * 100;
            toast.updateToast(toastId, { progress: Math.round(overall) });
          }
        });

        xhr.addEventListener('load', () => {
          try {
            const res = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300 && res.success) {
              resolve(res.data.url as string);
            } else {
              reject(new Error(res.error || `HTTP ${xhr.status}`));
            }
          } catch {
            reject(new Error(`HTTP ${xhr.status}`));
          }
        });

        xhr.addEventListener('error', () => reject(new Error('Network error')));
        xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));

        xhr.open('POST', '/api/upload');
        xhr.send(formData);
      });

      const { width, height } = await loadImageDimensions(url);

      // Generate and upload thumbnail silently
      const thumbnailFile = await generateThumbnail(file);
      let thumbnailUri: string | undefined;
      if (thumbnailFile) {
        try {
          thumbnailUri = await uploadFileSilent(thumbnailFile);
        } catch {
          thumbnailUri = undefined;
        }
      }

      results.push({ uri: url, naturalWidth: width, naturalHeight: height, thumbnailUri });
      completed++;
      toast.updateToast(toastId, {
        progress: Math.round((completed / files.length) * 100),
      });
    }

    toast.updateToast(toastId, {
      message: doneLabel,
      variant: 'success',
      progress: 100,
      duration: 2000,
    });

    return results;
  } catch (error) {
    console.error('Batch image upload failed:', error);
    toast.updateToast(toastId, {
      message: 'فشل رفع بعض الصور',
      variant: 'error',
      duration: 3000,
    });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Project thumbnail — generated from the canvas DOM element, compressed to
// WebP, and uploaded to R2 under `design/thumbnails/{projectId}.webp`.
// Used by project cards on the /projects and /templates pages.
//
// Split into two steps (capture vs. upload) so callers that need to
// navigate away immediately (optimistic UI) can capture the snapshot while
// the canvas is still mounted, then upload it in the background afterwards
// without blocking navigation.
// ---------------------------------------------------------------------------

const PROJECT_THUMBNAIL_QUALITY = 0.5; // WebP quality
const PROJECT_THUMBNAIL_TARGET_WIDTH = 400; // px — small enough for cards, ~100-200KB

/**
 * Fetch an image URL and convert it to a data URL.
 * R2 images (storage.manasik.net) don't have CORS headers, so browser
 * fetch fails. We always use the server-side proxy at /api/proxy-image
 * which fetches without CORS restrictions and returns the image with
 * permissive CORS headers.
 */
export async function imageUrlToDataUrl(url: string): Promise<string> {
  // Already a data URL — no need to fetch
  if (url.startsWith('data:')) return url;

  // Always use the server-side proxy to avoid CORS errors entirely.
  // The proxy fetches server-side (no CORS) and returns with
  // Access-Control-Allow-Origin: *.
  try {
    const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl);
    if (res.ok) {
      const blob = await res.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }
  } catch {
    // Proxy failed — fall through
  }

  // Last resort: try direct fetch (may work for same-origin or
  // CORS-enabled URLs like localhost uploads)
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (res.ok) {
      const blob = await res.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }
  } catch {
    // Both proxy and direct fetch failed
  }

  return url; // let html-to-image try its own fetch
}

/**
 * Capture a DOM element as a compressed WebP thumbnail blob.
 * This is a local (non-network) operation — it must be called while the
 * element is still mounted in the DOM, but does not need to be awaited
 * before navigating away since it doesn't touch the network.
 *
 * Preloads the element's CSS background-image as a data URL before
 * capture, so html-to-image can embed it even when R2 doesn't return
 * CORS headers (production). Also preloads any <img> elements inside.
 *
 * @param element  The canvas DOM element to capture (the design preview)
 * @param bgColor  Background color (for transparent areas)
 * @returns A WebP Blob, or null if capture failed
 */
export async function captureProjectThumbnailBlob(
  element: HTMLElement,
  bgColor: string
): Promise<Blob | null> {
  try {
    const { toBlob } = await import('html-to-image');
    const pixelRatio = Math.min(
      PROJECT_THUMBNAIL_TARGET_WIDTH / element.offsetWidth,
      1
    );

    // ── Preload background-image as data URL ────────────────────────
    // html-to-image can't fetch cross-origin images without CORS headers.
    // We preload the bg image as a data URL and temporarily swap it in.
    const computedBg = getComputedStyle(element).backgroundImage;
    const bgUrlMatch = computedBg.match(/url\(["']?(.*?)["']?\)/);
    const prevBgImage = element.style.backgroundImage;
    if (bgUrlMatch && bgUrlMatch[1]) {
      const dataUrl = await imageUrlToDataUrl(bgUrlMatch[1]);
      element.style.backgroundImage = `url(${dataUrl})`;
    }

    // ── Preload <img> srcs inside the element as data URLs ──────────
    const imgs = Array.from(element.querySelectorAll('img'));
    const imgRestores: Array<{ img: HTMLImageElement; src: string }> = [];
    await Promise.all(imgs.map(async (img) => {
      const src = img.src;
      if (src && !src.startsWith('data:')) {
        const dataUrl = await imageUrlToDataUrl(src);
        imgRestores.push({ img, src: img.src });
        img.src = dataUrl;
      }
    }));

    try {
      return await toBlob(element, {
        quality: PROJECT_THUMBNAIL_QUALITY,
        backgroundColor: bgColor || '#ffffff',
        pixelRatio,
        cacheBust: true,
        fetchRequestInit: { mode: 'cors' } as RequestInit,
      });
    } finally {
      // Restore original styles
      element.style.backgroundImage = prevBgImage;
      for (const { img, src } of imgRestores) {
        img.src = src;
      }
    }
  } catch (error) {
    console.error('Failed to capture project thumbnail:', error);
    return null;
  }
}

/**
 * Upload an already-captured thumbnail blob to R2 via the thumbnail API
 * route. Safe to call after the originating component has navigated away —
 * it's a plain network request with no DOM dependency.
 *
 * @param blob      The WebP blob captured via captureProjectThumbnailBlob
 * @param projectId The project ID (used as the thumbnail filename)
 * @returns The thumbnail URL on R2, or null if the upload failed
 */
export async function uploadProjectThumbnailBlob(
  blob: Blob,
  projectId: string
): Promise<string | null> {
  try {
    const file = new File([blob], `${projectId}.webp`, { type: 'image/webp' });
    const formData = new FormData();
    formData.append('thumbnail', file);

    const response = await fetch(`/api/projects/${projectId}/thumbnail`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });

    if (!response.ok) return null;

    const result = await response.json();
    return result.data?.thumbnail ?? null;
  } catch (error) {
    console.error('Failed to upload project thumbnail:', error);
    return null;
  }
}

/**
 * Convenience wrapper that captures and uploads a thumbnail in one call.
 * Prefer the split functions above when the caller needs to navigate away
 * before the upload completes.
 */
export async function generateAndUploadProjectThumbnail(
  element: HTMLElement,
  projectId: string,
  bgColor: string
): Promise<string | null> {
  const blob = await captureProjectThumbnailBlob(element, bgColor);
  if (!blob) return null;
  return uploadProjectThumbnailBlob(blob, projectId);
}
