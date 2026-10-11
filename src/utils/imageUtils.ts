/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * ZAKA E-Hailing Platform - Image helpers (profile pictures and identity verification photos)
 */

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Stock photos that older builds offered as avatars. They are never shown or saved again. */
export function isStockAvatar(url?: string | null): boolean {
  return Boolean(url && url.includes('images.unsplash.com'));
}

/** The account's own photo, or '' when it has none (stock avatars count as none) */
export function ownPhotoURL(url?: string | null): string {
  return url && !isStockAvatar(url) ? url : '';
}

export function validateImageFile(file: File | Blob): string | null {
  if (!file || file.size === 0) return 'The selected image is empty. Please choose another one.';
  if (file.size > 15 * 1024 * 1024) return 'This image is too large. Please choose one smaller than 15 MB.';
  if (file.type && !IMAGE_TYPES.includes(file.type)) return 'Please choose a JPG, PNG or WEBP image.';
  return null;
}

function loadImage(source: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(source);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('This image could not be read. Please choose a JPG, PNG or WEBP image.'));
    };
    img.src = url;
  });
}

function drawToJpeg(img: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, dw: number, dh: number, quality: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This device could not process the image. Please try again.');
  // JPEG has no transparency: paint white first so transparent PNGs do not turn black
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, dw, dh);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * Scales an image down and re-encodes it as JPEG until it fits in maxChars (data URL length).
 * Identity photos are kept in Firestore, where one document may not exceed 1 MB.
 */
export async function compressImageToDataUrl(source: Blob, maxDimension = 1400, maxChars = 800 * 1024): Promise<string> {
  const img = await loadImage(source);
  let dimension = maxDimension;
  for (let attempt = 0; attempt < 6; attempt++) {
    const scale = Math.min(1, dimension / Math.max(img.naturalWidth, img.naturalHeight));
    const dw = Math.max(1, Math.round(img.naturalWidth * scale));
    const dh = Math.max(1, Math.round(img.naturalHeight * scale));
    for (const quality of [0.82, 0.68, 0.55]) {
      const dataUrl = drawToJpeg(img, 0, 0, img.naturalWidth, img.naturalHeight, dw, dh, quality);
      if (dataUrl.length <= maxChars) return dataUrl;
    }
    dimension = Math.round(dimension * 0.75);
  }
  throw new Error('This image is too large to upload. Please choose a smaller one.');
}

/** Small square profile picture (centre-cropped), stored directly on the profile */
export async function imageToAvatarDataUrl(source: Blob, size = 160): Promise<string> {
  const img = await loadImage(source);
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - side) / 2;
  const sy = (img.naturalHeight - side) / 2;
  return drawToJpeg(img, sx, sy, side, side, size, size, 0.78);
}

/** Captures the current frame of a playing camera preview as a JPEG data URL */
export function captureVideoFrame(video: HTMLVideoElement, maxDimension = 1000): string {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) throw new Error('The camera is not ready yet. Please try again.');
  const scale = Math.min(1, maxDimension / Math.max(vw, vh));
  return drawToJpeg(video, 0, 0, vw, vh, Math.round(vw * scale), Math.round(vh * scale), 0.8);
}
