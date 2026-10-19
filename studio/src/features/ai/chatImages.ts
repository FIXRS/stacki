import type { ChatImage } from './chatContracts';

export async function prepareImages(files: readonly File[]): Promise<readonly ChatImage[]> {
  if (files.length > 4) {
    throw new Error('Attach up to four images per message.');
  }
  return Promise.all(files.map(prepareImage));
}
async function prepareImage(file: File): Promise<ChatImage> {
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
    throw new Error('Choose PNG, JPEG, WebP, or GIF images.');
  }
  if (file.size > 20_000_000) {
    throw new Error('Each image must be smaller than 20 MB.');
  }
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not prepare this image.');
    }
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.65, 0.45, 0.25]) {
      const url = canvas.toDataURL('image/jpeg', quality);
      if (url.length <= 180_000) {
        return { id: crypto.randomUUID(), name: file.name.slice(0, 200), url };
      }
    }
    throw new Error('This image is too detailed. Crop it or choose a smaller image.');
  } finally {
    bitmap.close();
  }
}
