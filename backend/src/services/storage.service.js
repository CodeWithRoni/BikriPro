/**
 * File storage for product photos and the shop logo.
 *
 * - If SUPABASE_URL + SUPABASE_SECRET_KEY are set, files go to a public
 *   Supabase Storage bucket and the full public URL is stored in the DB.
 *   (Needed on cloud hosts like Render, whose disk is wiped on each deploy.)
 * - Otherwise files are written to UPLOAD_DIR and served from /uploads.
 *
 * The secret key only ever lives on the server.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import env from '../config/env.js';

const sb = env.supabase;
const useSupabase = () => Boolean(sb.url && sb.secretKey);

// New sb_secret_ keys must be sent in `apikey`; Authorization may only carry
// the same value. Legacy service_role JWTs work the same way.
const headers = (extra = {}) => ({ apikey: sb.secretKey, Authorization: `Bearer ${sb.secretKey}`, ...extra });

let bucketReady = false;
async function ensureBucket() {
  if (bucketReady || !useSupabase()) return;
  const res = await fetch(`${sb.url}/storage/v1/bucket`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      id: sb.bucket, name: sb.bucket, public: true,
      file_size_limit: 5 * 1024 * 1024, allowed_mime_types: ['image/webp', 'image/png', 'image/jpeg'],
    }),
  });
  if (!res.ok && res.status !== 409) {
    const txt = await res.text();
    // "already exists" comes back as 400 on some versions
    if (!/already exists|Duplicate/i.test(txt)) throw new Error(`Storage bucket error ${res.status}: ${txt.slice(0, 200)}`);
  }
  bucketReady = true;
}

/** Save a file; returns the value to store in the DB (URL or /uploads path). */
async function saveFile(folder, name, buffer, contentType) {
  if (useSupabase()) {
    await ensureBucket();
    const objectPath = `${folder}/${name}`;
    const res = await fetch(`${sb.url}/storage/v1/object/${sb.bucket}/${objectPath}`, {
      method: 'POST',
      headers: headers({ 'Content-Type': contentType, 'Cache-Control': 'max-age=31536000', 'x-upsert': 'true' }),
      body: buffer,
    });
    if (!res.ok) throw new Error(`Image upload failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
    return `${sb.url}/storage/v1/object/public/${sb.bucket}/${objectPath}`;
  }
  const dir = path.join(env.uploadDir, folder);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), buffer);
  return `/uploads/${folder}/${name}`;
}

/** Delete a previously saved file (best effort, never throws). */
async function deleteFile(stored) {
  try {
    if (!stored) return;
    const publicPrefix = `${sb.url}/storage/v1/object/public/${sb.bucket}/`;
    if (useSupabase() && stored.startsWith(publicPrefix)) {
      const objectPath = stored.slice(publicPrefix.length);
      await fetch(`${sb.url}/storage/v1/object/${sb.bucket}`, {
        method: 'DELETE',
        headers: headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ prefixes: [objectPath] }),
      });
      return;
    }
    if (stored.startsWith('/uploads/')) {
      const abs = path.join(env.uploadDir, stored.replace(/^\/uploads\//, ''));
      if (abs.startsWith(env.uploadDir)) await fs.unlink(abs);
    }
  } catch { /* ignore */ }
}

export { saveFile, deleteFile, ensureBucket, useSupabase };
