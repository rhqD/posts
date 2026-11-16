// Keep the exported image within cleanAvatar's limits in the control service.
export const AVATAR_MAX_DATA_URL_LENGTH = 180000;
export const AVATAR_SIZE = 256;
const PREVIEW_MAX_EDGE = 2048;

export type AvatarCrop = { x: number; y: number; zoom: number };
export const INITIAL_AVATAR_CROP: AvatarCrop = { x: 0.5, y: 0.5, zoom: 1 };

export function constrainAvatarCrop(source: HTMLCanvasElement, crop: AvatarCrop): AvatarCrop {
  const zoom = Math.max(1, Math.min(4, crop.zoom));
  const edge = Math.min(source.width, source.height) / zoom;
  const clamp = (value: number, half: number) => Math.max(half, Math.min(1 - half, value));
  return { zoom, x: clamp(crop.x, edge / source.width / 2), y: clamp(crop.y, edge / source.height / 2) };
}

// Decode locally without base64-encoding the original file. Only a bounded
// preview canvas survives decoding, even when the original is a large photo.
export async function loadAvatarImage(file: File): Promise<HTMLCanvasElement> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('请选择 JPG、PNG 或 WebP 图片。');
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('无法读取这张图片，请选择其他 JPG、PNG 或 WebP 图片。');
  }
  try {
    const scale = Math.min(1, PREVIEW_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('当前浏览器无法处理图片。');
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    bitmap.close();
  }
}

export function drawAvatarCrop(canvas: HTMLCanvasElement, source: HTMLCanvasElement, crop: AvatarCrop) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('当前浏览器无法处理图片。');
  const { x, y, zoom } = constrainAvatarCrop(source, crop);
  const edge = Math.min(source.width, source.height) / zoom;
  context.fillStyle = '#eef1e9';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, x * source.width - edge / 2, y * source.height - edge / 2, edge, edge, 0, 0, canvas.width, canvas.height);
}

export function encodeAvatarCrop(source: HTMLCanvasElement, crop: AvatarCrop): string {
  const canvas = document.createElement('canvas');
  // Check the actual data URL length, including its base64 overhead, rather
  // than assuming a JPEG quality setting guarantees an upload size.
  for (const size of [AVATAR_SIZE, 192, 128]) {
    canvas.width = canvas.height = size;
    drawAvatarCrop(canvas, source, crop);
    for (const quality of [0.9, 0.8, 0.7, 0.6]) {
      const encoded = canvas.toDataURL('image/jpeg', quality);
      if (encoded.startsWith('data:image/jpeg;base64,') && encoded.length <= AVATAR_MAX_DATA_URL_LENGTH) return encoded;
    }
  }
  throw new Error('图片压缩失败，请选择其他图片。');
}
