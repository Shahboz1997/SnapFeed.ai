import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { getSupabaseAdmin, isSupabaseConfigured } from '../config/supabase.js';
import { getImagePath, isGeneratedImagePath, getFilenameFromUrl } from '../utils/imageStorage.js';
import { createError } from '../utils/errors.js';

const BUCKET = 'user-gallery';
const SIGNED_URL_TTL_SEC = 60 * 60 * 24; // 24h
const MAX_GALLERY_ITEMS = 100;

function isGalleryEnabled() {
  return isSupabaseConfigured();
}

function detectContentType(buffer, hintUrl = '') {
  const lower = (hintUrl || '').toLowerCase();
  if (lower.includes('.jpg') || lower.includes('.jpeg') || lower.includes('image/jpeg')) {
    return 'image/jpeg';
  }
  if (lower.includes('.webp') || lower.includes('image/webp')) {
    return 'image/webp';
  }
  if (buffer?.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer?.length >= 12
    && buffer.toString('ascii', 0, 4) === 'RIFF'
    && buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return 'image/png';
}

function extensionForContentType(contentType) {
  if (contentType === 'image/jpeg') return 'jpg';
  if (contentType === 'image/webp') return 'webp';
  return 'png';
}

async function bufferFromDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) {
    throw createError('Invalid data URL image.', 400);
  }
  return {
    buffer: Buffer.from(match[2], 'base64'),
    contentType: match[1].split(';')[0].trim() || 'image/png',
  };
}

async function bufferFromLocalGeneratedPath(imageUrl) {
  const filename = getFilenameFromUrl(imageUrl);
  const buffer = await fs.readFile(getImagePath(filename));
  return { buffer, contentType: detectContentType(buffer, filename) };
}

async function bufferFromRemoteUrl(imageUrl) {
  const response = await fetch(imageUrl, { redirect: 'follow' });
  if (!response.ok) {
    throw createError(`Failed to fetch image for gallery (${response.status}).`, 502);
  }
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/png';
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, contentType: detectContentType(buffer, contentType) };
}

export async function resolveImageBuffer(imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string') {
    throw createError('Image URL is required.', 400);
  }

  const trimmed = imageUrl.trim();
  if (trimmed.startsWith('data:')) {
    return bufferFromDataUrl(trimmed);
  }
  if (isGeneratedImagePath(trimmed)) {
    return bufferFromLocalGeneratedPath(trimmed);
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return bufferFromRemoteUrl(trimmed);
  }

  // Absolute API path without host (e.g. full path on same server).
  if (trimmed.includes('/api/generated-images/')) {
    const filename = path.basename(trimmed.split('?')[0]);
    const buffer = await fs.readFile(getImagePath(filename));
    return { buffer, contentType: detectContentType(buffer, filename) };
  }

  throw createError('Unsupported image URL for gallery storage.', 400);
}

async function createSignedUrl(supabase, storagePath) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SEC);

  if (error || !data?.signedUrl) {
    console.warn('[gallery] signed URL failed:', error?.message || error);
    return null;
  }

  return data.signedUrl;
}

export async function saveUserGalleryImage(userId, imageUrl, { mode = null, hashtags = [] } = {}) {
  if (!isGalleryEnabled() || !userId || !imageUrl) {
    return null;
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  try {
    const { buffer, contentType } = await resolveImageBuffer(imageUrl);
    const ext = extensionForContentType(contentType);
    const storagePath = `${userId}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, buffer, {
        contentType,
        upsert: false,
        cacheControl: '3600',
      });

    if (uploadError) {
      console.error('[gallery] upload failed:', uploadError.message || uploadError);
      return null;
    }

    const tags = Array.isArray(hashtags)
      ? hashtags.filter((tag) => typeof tag === 'string' && tag.trim()).slice(0, 8)
      : [];

    const { data: row, error: insertError } = await supabase
      .from('user_images')
      .insert({
        user_id: userId,
        storage_path: storagePath,
        mode: typeof mode === 'string' ? mode.slice(0, 64) : null,
        hashtags: tags,
      })
      .select('id, storage_path, mode, hashtags, created_at')
      .single();

    if (insertError || !row) {
      console.error('[gallery] insert failed:', insertError?.message || insertError);
      await supabase.storage.from(BUCKET).remove([storagePath]);
      return null;
    }

    const signedUrl = await createSignedUrl(supabase, storagePath);

    return {
      id: row.id,
      imageUrl: signedUrl || imageUrl,
      storagePath: row.storage_path,
      mode: row.mode,
      hashtags: row.hashtags ?? [],
      createdAt: row.created_at,
    };
  } catch (error) {
    console.error('[gallery] saveUserGalleryImage failed:', error?.message || error);
    return null;
  }
}

export async function persistGenerationToUserGallery(userId, body) {
  if (!isGalleryEnabled() || !userId || !body) {
    return body;
  }

  const urls = Array.isArray(body.imageUrls) && body.imageUrls.length
    ? body.imageUrls.filter((url) => typeof url === 'string' && url.trim())
    : (typeof body.imageUrl === 'string' && body.imageUrl.trim() ? [body.imageUrl.trim()] : []);

  if (!urls.length) {
    return body;
  }

  const mode = body.branchUsed || body.requestedMode || null;
  const hashtags = Array.isArray(body.hashtags) ? body.hashtags : [];

  const saved = await Promise.all(
    urls.map((url) => saveUserGalleryImage(userId, url, { mode, hashtags })),
  );

  const cloudUrls = saved
    .map((item, index) => item?.imageUrl || urls[index])
    .filter(Boolean);

  const galleryIds = saved.map((item) => item?.id).filter(Boolean);

  if (cloudUrls.length) {
    body.imageUrl = cloudUrls[0];
    body.imageUrls = cloudUrls;
  }

  if (galleryIds.length) {
    body.galleryImageIds = galleryIds;
  }

  return body;
}

export async function listUserGallery(userId, { limit = 48 } = {}) {
  if (!isGalleryEnabled() || !userId) {
    return [];
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const safeLimit = Math.min(MAX_GALLERY_ITEMS, Math.max(1, Number(limit) || 48));

  const { data, error } = await supabase
    .from('user_images')
    .select('id, storage_path, mode, hashtags, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(safeLimit);

  if (error) {
    throw createError('Failed to load gallery.', 500);
  }

  const rows = data || [];
  const items = await Promise.all(rows.map(async (row) => {
    const imageUrl = await createSignedUrl(supabase, row.storage_path);
    return {
      id: row.id,
      imageUrl,
      storagePath: row.storage_path,
      mode: row.mode,
      hashtags: row.hashtags ?? [],
      createdAt: row.created_at,
    };
  }));

  return items.filter((item) => Boolean(item.imageUrl));
}

export async function deleteUserGalleryImage(userId, imageId) {
  if (!isGalleryEnabled() || !userId || !imageId) {
    throw createError('Image not found.', 404);
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw createError('Gallery is not configured.', 503);
  }

  const { data: row, error } = await supabase
    .from('user_images')
    .select('id, storage_path')
    .eq('id', imageId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw createError('Failed to delete gallery image.', 500);
  }

  if (!row) {
    throw createError('Image not found.', 404);
  }

  const { error: deleteRowError } = await supabase
    .from('user_images')
    .delete()
    .eq('id', row.id)
    .eq('user_id', userId);

  if (deleteRowError) {
    throw createError('Failed to delete gallery image.', 500);
  }

  const { error: removeError } = await supabase.storage
    .from(BUCKET)
    .remove([row.storage_path]);

  if (removeError) {
    console.warn('[gallery] storage remove failed:', removeError.message || removeError);
  }

  return { ok: true };
}
