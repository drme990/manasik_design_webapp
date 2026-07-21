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
