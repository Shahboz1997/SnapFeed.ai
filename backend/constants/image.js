export const VALID_ASPECT_RATIOS = ['square', 'story'];
export const VALID_PLATFORMS = ['instagram', 'facebook'];

export const FLUX_SCHNELL_MODEL =
  process.env.REPLICATE_FLUX_SCHNELL_MODEL || 'black-forest-labs/flux-schnell';

/** @deprecated Legacy img2img — product branch uses FLUX_FILL_MODEL */
export const FLUX_IMG2IMG_MODEL =
  process.env.REPLICATE_FLUX_IMG2IMG_MODEL || 'black-forest-labs/flux-dev';

export const FLUX_FILL_MODEL =
  process.env.REPLICATE_PRODUCT_MODEL || 'black-forest-labs/flux-fill-dev';

export const FLUX_FILL_FALLBACK_MODEL = 'black-forest-labs/flux-fill-dev';

export const FLUX_FILL_STEPS = Number(process.env.FLUX_FILL_STEPS) || 28;
export const FLUX_FILL_GUIDANCE = Number(process.env.FLUX_FILL_GUIDANCE) || 35;

export const REPLICATE_BG_REMOVAL_MODEL =
  process.env.REPLICATE_BG_REMOVAL_MODEL
  || '851-labs/background-remover:a029dff38972b5fda4ec5d75d7d1cd25aeff621d2cf4946a41055d7db66b80bc';

export const IDM_VTON_MODEL =
  process.env.REPLICATE_IDM_VTON_MODEL
  || 'cuuupid/idm-vton:0513734a452173b8173e907e3a59d19a36266e55b48528559432bd21c7d7e985';

export const IDM_VTON_STEPS = 40;
export const IDM_VTON_SEED = 42;

export const DALL_E_MAX_PROMPT_LENGTH = 1000;
export const PRODUCT_IMAGE_MAX_PROMPT_LENGTH = 8000;

const ALLOWED_IMAGE_HOST_SUFFIXES = [
  '.blob.core.windows.net',
  'openai.com',
  'replicate.delivery',
  'replicate.com',
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
