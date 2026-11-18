/**
 * Smart Image Processing Engine
 * -----------------------------
 * Any upload (any resolution / aspect ratio / format) is normalised to a
 * 500x500 WebP:
 *   1. auto-rotate using EXIF orientation (phone photos)
 *   2. trim flat borders so the product fills the frame
 *   3. "contain" fit — the whole product is kept, never cropped or stretched;
 *      leftover space is padded with a clean white background
 *   4. WebP compression, stepping quality down until the file is small
 */
const crypto = require('crypto');
const sharp = require('sharp');
const { saveFile, deleteFile } = require('./storage.service');

const SIZE = 500;
const TARGET_BYTES = 60 * 1024; // aim for <= 60 KB per product image
const BG = { r: 255, g: 255, b: 255, alpha: 1 };

async function normaliseProductImage(buffer) {
  let base = sharp(buffer, { failOn: 'none' }).rotate();

  // Trim uniform borders (e.g. big white studio margins). If the image is
  // a single flat colour, trim would fail — fall back to the untrimmed image.
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

  // Adaptive compression
  let quality = 82;
  let out = await sharp(resized).webp({ quality, effort: 5 }).toBuffer();
  while (out.length > TARGET_BYTES && quality > 50) {
    quality -= 8;
    out = await sharp(resized).webp({ quality, effort: 5 }).toBuffer();
  }
  return out;
}

/** Process and save; returns the stored path/URL of the 500x500 WebP. */
async function saveProductImage(buffer) {
  const data = await normaliseProductImage(buffer);
  const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.webp`;
  return saveFile('products', name, data, 'image/webp');
}

/** Shop logo: keep aspect ratio, max 400px wide, PNG for transparency. */
async function saveShopLogo(buffer) {
  const data = await sharp(buffer).rotate().resize(400, 400, { fit: 'inside', withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer();
  return saveFile('shop', `logo-${Date.now()}.png`, data, 'image/png');
}

const deleteUpload = deleteFile;

module.exports = { normaliseProductImage, saveProductImage, saveShopLogo, deleteUpload, SIZE };
