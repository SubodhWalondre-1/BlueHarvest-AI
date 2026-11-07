/**
 * Image compression utility for BlueHarvest.
 * Automatically compresses large user uploads (e.g. from high-res phone cameras)
 * to fit safely under the backend upload limit (12 MB), while preserving high
 * spatial resolution (up to 4096px) to maintain detection accuracy for tiny fish fry.
 */

export const MAX_SAFE_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB safe limit (leaves 4 MB safety headroom under 12 MB)
export const MAX_IMAGE_DIMENSION = 4096; // Optimal max dimension matching P2PNet high-res preset

/**
 * Checks if the file is an image and exceeds the specified size threshold,
 * compressing it via an offscreen HTML canvas if necessary.
 *
 * @param {File|Blob} file - The file to check and potentially compress.
 * @param {number} [maxBytes=MAX_SAFE_UPLOAD_BYTES] - The maximum allowed byte size.
 * @returns {Promise<File|Blob>} - The original file if already small enough, or a compressed JPEG File.
 */
export async function compressImageIfNeeded(file, maxBytes = MAX_SAFE_UPLOAD_BYTES) {
  // If not running in a browser, or no file, return untouched
  if (!file || typeof window === 'undefined' || typeof document === 'undefined') {
    return file;
  }

  // Check MIME type or filename extension
  const type = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  const isImageMime = type.startsWith('image/');
  const isImageExt = /\.(jpe?g|png|webp|bmp|gif|tiff?|heic|heif|avif)$/i.test(name);
  if (!isImageMime && !isImageExt && type) {
    return file;
  }

  // If already under the safe size limit, preserve the original file 100% untouched
  if (file.size <= maxBytes) {
    return file;
  }

  try {
    return await compressImage(file, maxBytes);
  } catch (error) {
    console.warn('Client-side image compression failed; falling back to original file:', error);
    return file;
  }
}

/**
 * Performs canvas-based image downscaling and JPEG quality compression.
 * Uses an adaptive loop to guarantee the resulting blob fits under maxBytes.
 */
async function compressImage(file, maxBytes) {
  let sourceElement = null;
  let originalWidth = 0;
  let originalHeight = 0;
  let cleanup = () => {};

  // Try createImageBitmap first for performance and automatic EXIF orientation
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      sourceElement = bitmap;
      originalWidth = bitmap.width;
      originalHeight = bitmap.height;
      cleanup = () => bitmap.close?.();
    } catch {
      sourceElement = null;
    }
  }

  // Fallback to HTMLImageElement
  if (!sourceElement) {
    const objectUrl = URL.createObjectURL(file);
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Failed to decode image in browser.'));
      image.src = objectUrl;
    });
    sourceElement = img;
    originalWidth = img.naturalWidth || img.width;
    originalHeight = img.naturalHeight || img.height;
    cleanup = () => URL.revokeObjectURL(objectUrl);
  }

  try {
    if (!originalWidth || !originalHeight) {
      return file;
    }

    // Determine initial target dimensions (cap at MAX_IMAGE_DIMENSION while keeping aspect ratio)
    let curWidth = originalWidth;
    let curHeight = originalHeight;

    if (curWidth > MAX_IMAGE_DIMENSION || curHeight > MAX_IMAGE_DIMENSION) {
      if (curWidth >= curHeight) {
        curHeight = Math.round((curHeight * MAX_IMAGE_DIMENSION) / curWidth);
        curWidth = MAX_IMAGE_DIMENSION;
      } else {
        curWidth = Math.round((curWidth * MAX_IMAGE_DIMENSION) / curHeight);
        curHeight = MAX_IMAGE_DIMENSION;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = curWidth;
    canvas.height = curHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return file;
    }

    // Fill white background to eliminate black backgrounds on transparent PNGs
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, curWidth, curHeight);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sourceElement, 0, 0, curWidth, curHeight);

    // Iteratively test quality settings until size is under maxBytes
    const qualitySteps = [0.90, 0.84, 0.78, 0.70, 0.60];
    let bestBlob = null;

    for (const quality of qualitySteps) {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob) {
        bestBlob = blob;
        if (blob.size <= maxBytes) {
          break;
        }
      }
    }

    // If still over maxBytes after quality steps, progressively downscale dimensions
    if (bestBlob && bestBlob.size > maxBytes) {
      const scaleFactors = [0.8, 0.65, 0.5, 0.35];
      for (const scale of scaleFactors) {
        const nextW = Math.round(curWidth * scale);
        const nextH = Math.round(curHeight * scale);
        if (nextW < 600 || nextH < 600) break;

        const scaleCanvas = document.createElement('canvas');
        scaleCanvas.width = nextW;
        scaleCanvas.height = nextH;
        const scaleCtx = scaleCanvas.getContext('2d');
        if (!scaleCtx) continue;

        scaleCtx.fillStyle = '#FFFFFF';
        scaleCtx.fillRect(0, 0, nextW, nextH);
        scaleCtx.imageSmoothingEnabled = true;
        scaleCtx.imageSmoothingQuality = 'high';
        scaleCtx.drawImage(canvas, 0, 0, nextW, nextH);

        for (const quality of [0.82, 0.72, 0.62]) {
          const scaledBlob = await new Promise((resolve) => scaleCanvas.toBlob(resolve, 'image/jpeg', quality));
          if (scaledBlob) {
            bestBlob = scaledBlob;
            if (scaledBlob.size <= maxBytes) {
              break;
            }
          }
        }
        if (bestBlob && bestBlob.size <= maxBytes) {
          break;
        }
      }
    }

    if (!bestBlob) {
      return file;
    }

    const originalName = file.name || 'photo.jpg';
    const lastDotIndex = originalName.lastIndexOf('.');
    const baseName = lastDotIndex > 0 ? originalName.slice(0, lastDotIndex) : originalName;
    const newName = `${baseName}.jpg`;

    return new File([bestBlob], newName, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } finally {
    cleanup();
  }
}

