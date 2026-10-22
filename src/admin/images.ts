// Card photos are processed in the admin's own browser, so the Worker never resizes anything:
// HEIC → bitmap → crop to the slot's aspect → WebP at 3 widths → ThumbHash → upload to R2.
import { rgbaToThumbHash } from 'thumbhash';
import type { AssetRef } from '../games/types';

export const WIDTHS = [320, 640, 1080];
const QUALITY = 0.8;

export type CropRect = { x: number; y: number; width: number; height: number };

async function looksHeic(file: File) {
  if (/\.(heic|heif)$/i.test(file.name) || /image\/hei[cf]/.test(file.type)) return true;
  // Some phones send HEIC with an empty type; check the ftyp brand in the header.
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const brand = String.fromCharCode(...head.slice(8, 12));
  return String.fromCharCode(...head.slice(4, 8)) === 'ftyp' && /^(heic|heix|hevc|hevx|mif1|msf1)$/.test(brand);
}

export async function decode(file: File): Promise<ImageBitmap> {
  if (await looksHeic(file)) {
    // Only Safari decodes HEIC natively; everyone else gets the WASM decoder, loaded on demand.
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      const { heicTo } = await import('heic-to');
      return heicTo({ blob: file, type: 'bitmap' });
    }
  }
  return createImageBitmap(file, { imageOrientation: 'from-image' });
}

/** Largest centred rectangle with the wanted aspect (width / height). */
export function centerCrop(w: number, h: number, aspect: number): CropRect {
  if (w / h > aspect) {
    const width = Math.round(h * aspect);
    return { x: Math.round((w - width) / 2), y: 0, width, height: h };
  }
  const height = Math.round(w / aspect);
  return { x: 0, y: Math.round((h - height) / 2), width: w, height };
}

function draw(bitmap: ImageBitmap, crop: CropRect, width: number) {
  const height = Math.round(width * (crop.height / crop.width));
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
  return canvas;
}

async function encode(canvas: OffscreenCanvas) {
  const webp = await canvas.convertToBlob({ type: 'image/webp', quality: QUALITY });
  // Older Safari can't encode WebP and silently returns PNG: fall back to JPEG.
  return webp.type === 'image/webp' ? webp : canvas.convertToBlob({ type: 'image/jpeg', quality: 0.84 });
}

function thumbHash(bitmap: ImageBitmap, crop: CropRect) {
  const scale = 100 / Math.max(crop.width, crop.height);
  const w = Math.max(1, Math.round(crop.width * scale));
  const h = Math.max(1, Math.round(crop.height * scale));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, w, h);
  const hash = rgbaToThumbHash(w, h, ctx.getImageData(0, 0, w, h).data);
  return btoa(String.fromCharCode(...hash));
}

async function contentKey(blob: Blob) {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest).slice(0, 16)].map((n) => n.toString(16).padStart(2, '0')).join('');
}

export type Prepared = { ref: AssetRef; files: { width: number; blob: Blob }[]; bytes: number };

export async function prepare(bitmap: ImageBitmap, aspect: number, crop?: CropRect): Promise<Prepared> {
  const rect = crop ?? centerCrop(bitmap.width, bitmap.height, aspect);
  // Never upscale: a small source just yields fewer sizes.
  const widths = WIDTHS.filter((w, i) => i === 0 || w <= rect.width);
  const files: Prepared['files'] = [];
  for (const width of widths) files.push({ width, blob: await encode(draw(bitmap, rect, width)) });
  const key = await contentKey(files[files.length - 1]!.blob);
  return {
    ref: { key, widths, thumb: thumbHash(bitmap, rect), aspect: rect.width / rect.height },
    files,
    bytes: files.reduce((n, f) => n + f.blob.size, 0),
  };
}

export async function upload(prepared: Prepared): Promise<AssetRef> {
  for (const f of prepared.files) {
    const res = await fetch(`/api/admin/upload?key=${prepared.ref.key}&w=${f.width}`, {
      method: 'PUT',
      headers: { 'Content-Type': f.blob.type },
      body: f.blob,
    });
    if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? 'UPLOAD_FAILED');
  }
  return prepared.ref;
}

/** One-shot helper for bulk uploads: centre-crop, encode, upload. */
export async function processFile(file: File, aspect: number): Promise<AssetRef> {
  const bitmap = await decode(file);
  try {
    return await upload(await prepare(bitmap, aspect));
  } finally {
    bitmap.close();
  }
}
