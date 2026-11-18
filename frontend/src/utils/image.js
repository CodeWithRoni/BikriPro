/**
 * Smart Image Processing Engine (runs in the browser / Electron / Capacitor)
 * -------------------------------------------------------------------------
 * Any photo — any resolution, aspect ratio or orientation — becomes a
 * 500×500 image ready for the shop catalogue:
 *   1. EXIF orientation applied (phone photos stay upright)
 *   2. flat borders around the product are trimmed so it fills the frame
 *   3. "contain" fit on a white square: nothing is cropped or stretched
 *   4. WebP compression, stepping quality down until it is ≤ ~60 KB
 *      (JPEG fallback on browsers that cannot encode WebP)
 * Doing this on the device keeps uploads tiny (fast on mobile data) and lets
 * the API run on Supabase Edge Functions.
 */

const SIZE = 500;
const TARGET_BYTES = 60 * 1024;
const WORK_MAX = 1600; // downscale huge camera photos before analysing

async function loadBitmap(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch { /* fall back to <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('This file is not an image the device can read'));
      el.src = url;
    });
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/** Draw src scaled to (w,h) with good quality, halving in steps for big reductions. */
function drawScaled(src, sw, sh, w, h) {
  let cur = src;
  let cw = sw;
  let ch = sh;
  while (cw / 2 >= w && ch / 2 >= h) {
    const step = canvas(cw / 2, ch / 2);
    const sctx = step.getContext('2d');
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(cur, 0, 0, step.width, step.height);
    cur = step;
    cw = step.width;
    ch = step.height;
  }
  const out = canvas(w, h);
  const ctx = out.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cur, 0, 0, out.width, out.height);
  return out;
}

/** Bounding box of pixels that differ from the background (corner colour). */
function contentBox(c) {
  const { width: w, height: h } = c;
  const data = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const px = (x, y) => { const i = (y * w + x) * 4; return [data[i], data[i + 1], data[i + 2], data[i + 3]]; };
  const corners = [px(0, 0), px(w - 1, 0), px(0, h - 1), px(w - 1, h - 1)];
  const bg = [0, 1, 2, 3].map((k) => corners.reduce((s, p) => s + p[k], 0) / 4);
  const TH = 36; // summed RGB difference that counts as "content"
  const isBg = (i) => {
    const a = data[i + 3];
    if (a < 16 && bg[3] < 16) return true; // transparent background
    return Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]) < TH && Math.abs(a - bg[3]) < 32;
  };
  let top = h; let left = w; let right = -1; let bottom = -1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (!isBg((y * w + x) * 4)) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) return null; // flat image — nothing to trim
  const pad = Math.round(Math.max(right - left, bottom - top) * 0.02); // keep a small breathing margin
  left = Math.max(0, left - pad); top = Math.max(0, top - pad);
  right = Math.min(w - 1, right + pad); bottom = Math.min(h - 1, bottom + pad);
  const bw = right - left + 1; const bh = bottom - top + 1;
  if (bw < 20 || bh < 20) return null;
  return { x: left, y: top, w: bw, h: bh };
}

const toBlob = (c, type, q) => new Promise((resolve) => c.toBlob(resolve, type, q));

async function encode(c, { targetBytes = TARGET_BYTES } = {}) {
  let type = 'image/webp';
  let q = 0.82;
  let blob = await toBlob(c, type, q);
  if (!blob || blob.type !== 'image/webp') { type = 'image/jpeg'; blob = await toBlob(c, type, q); }
  while (blob && blob.size > targetBytes && q > 0.5) {
    q -= 0.08;
    blob = await toBlob(c, type, q);
  }
  return blob;
}

/**
 * Normalise a product photo. Returns { blob, url, width, height, bytes }.
 * `url` is an object URL for previewing; revoke it when done.
 */
export async function processProductImage(file) {
  const bmp = await loadBitmap(file);
  const sw = bmp.width; const sh = bmp.height;
  const k = Math.min(1, WORK_MAX / Math.max(sw, sh));
  const work = drawScaled(bmp, sw, sh, sw * k, sh * k);
  if (bmp.close) bmp.close();

  const box = contentBox(work) || { x: 0, y: 0, w: work.width, h: work.height };
  const crop = canvas(box.w, box.h);
  crop.getContext('2d').drawImage(work, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);

  const scale = Math.min(SIZE / box.w, SIZE / box.h);
  const dw = Math.round(box.w * scale); const dh = Math.round(box.h * scale);
  const fitted = scale < 1 ? drawScaled(crop, box.w, box.h, dw, dh) : crop;

  const out = canvas(SIZE, SIZE);
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(fitted, 0, 0, fitted.width, fitted.height, Math.round((SIZE - dw) / 2), Math.round((SIZE - dh) / 2), dw, dh);

  const blob = await encode(out);
  if (!blob) throw new Error('Could not process this image');
  return { blob, url: URL.createObjectURL(blob), width: SIZE, height: SIZE, bytes: blob.size };
}

/** Shop logo: keep aspect ratio and transparency, max 400 px, PNG. */
export async function processLogo(file) {
  const bmp = await loadBitmap(file);
  const k = Math.min(1, 400 / Math.max(bmp.width, bmp.height));
  const c = drawScaled(bmp, bmp.width, bmp.height, bmp.width * k, bmp.height * k);
  if (bmp.close) bmp.close();
  const blob = await toBlob(c, 'image/png');
  return { blob, url: URL.createObjectURL(blob) };
}

/** File name for a processed blob (keeps the server's type sniffing happy). */
export const blobName = (blob, base) => `${base}.${blob.type === 'image/webp' ? 'webp' : blob.type === 'image/png' ? 'png' : 'jpg'}`;
