// Turns any picture into the small square image the server stores.

const OUTPUT_SIZE = 256;
const MAX_INPUT_BYTES = 15 * 1024 * 1024;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('That file could not be read as an image'));
    image.src = src;
  });
}

function toDataUrl(canvas) {
  const webp = canvas.toDataURL('image/webp', 0.86);
  // Browsers without WebP encoding fall back to PNG; use JPEG instead to stay small.
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.88);
}

// Crops the centre square (shifted by `offset`, -1..1 on the long side) and scales it down.
// `zoom` (>= 1) crops tighter.
export async function squareImage(src, { zoom = 1, offsetX = 0, offsetY = 0 } = {}) {
  const image = await loadImage(src);
  const side = Math.min(image.naturalWidth, image.naturalHeight) / zoom;
  const maxX = (image.naturalWidth - side) / 2;
  const maxY = (image.naturalHeight - side) / 2;
  const sx = maxX + offsetX * maxX;
  const sy = maxY + offsetY * maxY;

  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const context = canvas.getContext('2d');
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, sx, sy, side, side, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  return toDataUrl(canvas);
}

export function readImageFile(file) {
  if (!file.type.startsWith('image/')) {
    return Promise.reject(new Error('Choose an image file (JPG, PNG, WebP…)'));
  }
  if (file.size > MAX_INPUT_BYTES) {
    return Promise.reject(new Error('Choose an image smaller than 15 MB'));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('That file could not be read'));
    reader.readAsDataURL(file);
  });
}
