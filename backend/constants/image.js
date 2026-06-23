export const VALID_ASPECT_RATIOS = ['square', 'story'];
export const VALID_PLATFORMS = ['instagram', 'facebook'];

export const ASPECT_RATIO_SIZES = {
  square: '1024x1024',
  story: '1024x1536',
};

export const DALL_E3_SIZES = {
  square: '1024x1024',
  story: '1024x1792',
};

export const DEFAULT_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1.5';

export const DALL_E_MAX_PROMPT_LENGTH = 1000;
export const PRODUCT_IMAGE_MAX_PROMPT_LENGTH = 8000;

const ALLOWED_IMAGE_HOST_SUFFIXES = [
  '.blob.core.windows.net',
  'openai.com',
];

export function isAllowedImageUrl(imageUrl) {
  let parsed;
  try {
    parsed = new URL(imageUrl);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'https:') return false;

  return ALLOWED_IMAGE_HOST_SUFFIXES.some(
    (suffix) => parsed.hostname === suffix.slice(1) || parsed.hostname.endsWith(suffix),
  );
}
