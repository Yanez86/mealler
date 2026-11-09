// SPDX-License-Identifier: AGPL-3.0-or-later
// Shrinks a photo on the device before upload: max 1280 px on the long side, JPEG quality 0.8.
// Smaller images upload faster on mobile data and cost fewer tokens.

const MAX_SIDE = 1280;

export interface PreparedPhoto {
  mime: 'image/jpeg';
  data: string; // base64, no data: prefix
  previewUrl: string;
}

export async function preparePhoto(file: Blob): Promise<PreparedPhoto> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
  return { mime: 'image/jpeg', data: dataUrl.slice(dataUrl.indexOf(',') + 1), previewUrl: dataUrl };
}
