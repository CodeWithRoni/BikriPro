/**
 * Smart Image Processing Engine
 * -----------------------------
 * Every product photo ends up as a 500x500 image where the whole product is
 * visible (never cropped or stretched) on a clean white background, compressed
 * to a few dozen KB.
 *
 * The heavy lifting now happens in the browser / mobile app
 * (frontend/src/utils/image.js) before upload, so it also works on Supabase
 * Edge Functions, which cannot run native modules. When the server runs on
 * Node and `sharp` is installed, uploads are normalised here as well
 * (defence in depth for API clients that send raw photos):
 *   1. auto-rotate using EXIF orientation (phone photos)
 *   2. trim flat borders so the product fills the frame
 *   3. "contain" fit into 500x500 on white
 *   4. WebP compression, stepping quality down until the file is small
 */
import crypto from 'node:crypto';
import { saveFile, deleteFile } from './storage.service.js';

const SIZE = 500;
const TARGET_BYTES = 60 * 1024; // aim for <= 60 KB per product image
const MAX_PASSTHROUGH = 1024 * 1024; // already-processed uploads must be < 1 MB
const BG = { r: 255, g: 255, b: 255, alpha: 1 };

let sharpLib; // undefined = not tried yet, null = unavailable
async function getSharp() {
  if (sharpLib !== undefined) return sharpLib;
  try {
    sharpLib = (await import('sharp')).default;
  } catch {
    sharpLib = null;
  }
  return sharpLib;
}

/** Normalise with sharp; returns null when sharp is unavailable. */
async function normaliseProductImage(buffer) {
  const sharp = await getSharp();
  if (!sharp) return null;
  let base = sharp(buffer, { failOn: 'none' }).rotate();

  // Trim uniform borders (e.g. big white studio margins). A single flat
  // colour image cannot be trimmed — keep it as is.
  try {
    const trimmed = await base.clone().trim({ threshold: 12 }).toBuffer({ resolveWithObject: true });
    if (trimmed.info.width > 20 && trimmed.info.height > 20) base = sharp(trimmed.data);
  } catch {
    /* keep untrimmed */
  }

  const resized = await base
    .resize(SIZE, SIZE, { fit: 'contain', background: BG, withoutEnlargement: false, kernel: 'lanczos3' })
    .flatten({ background: BG })
    .toBuffer();

  let quality = 82;
  let out = await sharp(resized).webp({ quality, effort: 5 }).toBuffer();
  while (out.length > TARGET_BYTES && quality > 50) {
    quality -= 8;
    out = await sharp(resized).webp({ quality, effort: 5 }).toBuffer();
  }
  return out;
}

/** Detect image type from magic bytes (for client-processed uploads). */
function sniff(buffer) {
  const b = buffer;
  if (b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return { ext: 'webp', type: 'image/webp' };
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: 'png', type: 'image/png' };
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg' };
  return null;
}

function passthrough(buffer) {
  const kind = sniff(buffer);
  if (!kind) throw Object.assign(new Error('Unsupported image — please upload a JPG, PNG or WebP photo'), { status: 400 });
  if (buffer.length > MAX_PASSTHROUGH) throw Object.assign(new Error('Image is too large — please update the app so photos are resized before upload'), { status: 413 });
  return kind;
}

/** Process (if possible) and save; returns the stored path/URL. */
async function saveProductImage(buffer) {
  const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
  const processed = await normaliseProductImage(buffer);
  if (processed) return saveFile('products', `${name}.webp`, processed, 'image/webp');
  const kind = passthrough(buffer);
  return saveFile('products', `${name}.${kind.ext}`, buffer, kind.type);
}

/** Shop logo: keep aspect ratio, max 400px, PNG for transparency. */
async function saveShopLogo(buffer) {
  const sharp = await getSharp();
  if (sharp) {
    const data = await sharp(buffer).rotate().resize(400, 400, { fit: 'inside', withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer();
    return saveFile('shop', `logo-${Date.now()}.png`, data, 'image/png');
  }
  const kind = passthrough(buffer);
  return saveFile('shop', `logo-${Date.now()}.${kind.ext}`, buffer, kind.type);
}

const deleteUpload = deleteFile;

export { normaliseProductImage, saveProductImage, saveShopLogo, deleteUpload, SIZE };
