export const VALID_ASPECT_RATIOS = ['square', 'story'];
export const VALID_PLATFORMS = ['instagram', 'facebook'];

export const FLUX_SCHNELL_MODEL =
  process.env.REPLICATE_FLUX_SCHNELL_MODEL || 'black-forest-labs/flux-schnell';

/** Text mode (Generate Visual) — primary T2I model */
export const TEXT_MODE_IMAGE_MODEL =
  process.env.REPLICATE_TEXT_IMAGE_MODEL?.trim()
  || process.env.REPLICATE_NANO_BANANA_MODEL?.trim()
  || 'google/nano-banana-2';

export const TEXT_MODE_FALLBACK_MODEL =
  process.env.REPLICATE_TEXT_IMAGE_FALLBACK_MODEL?.trim()
  || 'black-forest-labs/flux-2-pro';

export function resolveTextModeModelsToTry() {
  return [
    TEXT_MODE_IMAGE_MODEL,
    TEXT_MODE_FALLBACK_MODEL,
    FLUX_SCHNELL_MODEL,
  ].filter((model, index, list) => model && list.indexOf(model) === index);
}

/** @deprecated Legacy img2img — product branch uses FLUX_FILL_MODEL */
export const FLUX_IMG2IMG_MODEL =
  process.env.REPLICATE_FLUX_IMG2IMG_MODEL || 'black-forest-labs/flux-dev';

export const FLUX_FILL_MODEL =
  process.env.REPLICATE_PRODUCT_MODEL || 'black-forest-labs/flux-fill-dev';

export const FLUX_FILL_FALLBACK_MODEL = 'black-forest-labs/flux-fill-dev';

export const FLUX_FILL_STEPS = Number(process.env.FLUX_FILL_STEPS) || 28;
export const FLUX_FILL_GUIDANCE = Number(process.env.FLUX_FILL_GUIDANCE) || 35;

export const FLUX_PRODUCT_IMAGE_MODEL =
  process.env.REPLICATE_PRODUCT_IMAGE_MODEL
  || process.env.REPLICATE_PRODUCT_BG_MODEL
  || 'black-forest-labs/flux-2-pro';

export const FLUX_PRODUCT_IMAGE_FALLBACK_MODEL =
  process.env.REPLICATE_PRODUCT_IMAGE_FALLBACK_MODEL
  || process.env.REPLICATE_PRODUCT_BG_FALLBACK_MODEL
  || 'black-forest-labs/flux-2-max';

export const FLUX_PRODUCT_IMAGE_STEPS = Number(
  process.env.FLUX_PRODUCT_IMAGE_STEPS
  || process.env.FLUX_PRODUCT_BG_STEPS,
) || 32;

export const FLUX_PRODUCT_IMAGE_GUIDANCE = Number(
  process.env.FLUX_PRODUCT_IMAGE_GUIDANCE
  || process.env.FLUX_PRODUCT_BG_GUIDANCE,
) || 3.5;

export const FLUX_PRODUCT_IMAGE_RESOLUTION =
  process.env.FLUX_PRODUCT_IMAGE_RESOLUTION || '2 MP';

/** @deprecated Use FLUX_PRODUCT_IMAGE_MODEL */
export const FLUX_PRODUCT_BG_MODEL = FLUX_PRODUCT_IMAGE_MODEL;

/** @deprecated Use FLUX_PRODUCT_IMAGE_FALLBACK_MODEL */
export const FLUX_PRODUCT_BG_FALLBACK_MODEL = FLUX_PRODUCT_IMAGE_FALLBACK_MODEL;

/** @deprecated Use FLUX_PRODUCT_IMAGE_STEPS */
export const FLUX_PRODUCT_BG_STEPS = FLUX_PRODUCT_IMAGE_STEPS;

/** @deprecated Use FLUX_PRODUCT_IMAGE_GUIDANCE */
export const FLUX_PRODUCT_BG_GUIDANCE = FLUX_PRODUCT_IMAGE_GUIDANCE;

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
