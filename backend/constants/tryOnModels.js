const IDM_VTON_HUMAN_BASE =
  'https://raw.githubusercontent.com/yisol/IDM-VTON/main/gradio_demo/example/human';

const OOT_DIFFUSION_MODEL_BASE =
  'https://raw.githubusercontent.com/levihsu/OOTDiffusion/main/run/examples/model';

function idmHumanUrl(filename) {
  return `${IDM_VTON_HUMAN_BASE}/${encodeURI(filename)}`;
}

function ootModelUrl(filename) {
  return `${OOT_DIFFUSION_MODEL_BASE}/${encodeURI(filename)}`;
}

/** @typedef {'female' | 'male'} TryOnGender */
/** @typedef {'portrait' | 'full_body'} TryOnModelType */
/**
 * @typedef {{
 *   id: string,
 *   gender: TryOnGender,
 *   type: TryOnModelType,
 *   url: string,
 *   ageGroup?: 'young' | 'adult' | 'mature',
 *   tags?: string[],
 * }} TryOnModel
 */

/**
 * Studio-first pool: bright catalog lighting, full body, light footwear preferred.
 * FASHN preserves model pose/shoes/background — pick models like FASHN Starter gallery.
 * @type {TryOnModel[]}
 */
export const tryOnModels = [
  // Female — full body studio (dresses, sets, bottoms) — preferred for catalog look
  {
    id: 'female_studio_1',
    gender: 'female',
    type: 'full_body',
    ageGroup: 'adult',
    tags: ['studio', 'bright', 'elegant', 'catalog'],
    url: idmHumanUrl('00121_00.jpg'),
  },
  {
    id: 'female_studio_2',
    gender: 'female',
    type: 'full_body',
    ageGroup: 'young',
    tags: ['studio', 'bright', 'elegant', 'catalog'],
    url: ootModelUrl('049447_0.jpg'),
  },
  {
    id: 'female_studio_3',
    gender: 'female',
    type: 'full_body',
    ageGroup: 'adult',
    tags: ['studio', 'bright', 'elegant', 'catalog'],
    url: ootModelUrl('053700_0.jpg'),
  },
  {
    id: 'female_studio_4',
    gender: 'female',
    type: 'full_body',
    ageGroup: 'adult',
    tags: ['studio', 'bright', 'elegant'],
    url: ootModelUrl('049713_0.jpg'),
  },
  {
    id: 'female_full_body_1',
    gender: 'female',
    type: 'full_body',
    ageGroup: 'adult',
    tags: ['studio', 'elegant'],
    url: idmHumanUrl('taylor-.jpg'),
  },
  {
    id: 'female_full_body_3',
    gender: 'female',
    type: 'full_body',
    ageGroup: 'adult',
    tags: ['studio', 'elegant'],
    url: ootModelUrl('052767_0.jpg'),
  },

  // Female — upper body / portrait (tops)
  { id: 'female_portrait_1', gender: 'female', type: 'portrait', ageGroup: 'adult', tags: ['studio', 'bright'], url: idmHumanUrl('00034_00.jpg') },
  { id: 'female_portrait_2', gender: 'female', type: 'portrait', ageGroup: 'adult', tags: ['studio', 'bright'], url: idmHumanUrl('00035_00.jpg') },
  { id: 'female_portrait_3', gender: 'female', type: 'portrait', ageGroup: 'adult', tags: ['studio'], url: idmHumanUrl('00055_00.jpg') },
  { id: 'female_portrait_4', gender: 'female', type: 'portrait', ageGroup: 'adult', tags: ['studio'], url: idmHumanUrl('01992_00.jpg') },
  { id: 'female_portrait_5', gender: 'female', type: 'portrait', ageGroup: 'adult', tags: ['studio', 'bright'], url: ootModelUrl('02849_00.jpg') },
  { id: 'female_portrait_6', gender: 'female', type: 'portrait', ageGroup: 'adult', tags: ['studio'], url: ootModelUrl('01008_00.jpg') },
  { id: 'female_portrait_7', gender: 'female', type: 'portrait', ageGroup: 'adult', tags: ['studio'], url: ootModelUrl('05997_00.jpg') },
  { id: 'female_portrait_8', gender: 'female', type: 'portrait', ageGroup: 'adult', tags: ['studio'], url: ootModelUrl('14627_00.jpg') },
  { id: 'female_portrait_9', gender: 'female', type: 'portrait', ageGroup: 'adult', tags: ['studio', 'bright'], url: ootModelUrl('model_3.png') },
  {
    id: 'female_portrait_10',
    gender: 'female',
    type: 'portrait',
    ageGroup: 'adult',
    tags: ['studio', 'bright'],
    url: 'https://replicate.delivery/pbxt/Kgw71Am207JpZ6XXLtFeFNyHQhUEPtRiHuGXb7ZP8JgzyNOK/KakaoTalk_Photo_2024-04-04-21-20-19.png',
  },

  // Male — full body
  { id: 'male_full_body_1', gender: 'male', type: 'full_body', ageGroup: 'adult', tags: ['studio', 'bright', 'elegant'], url: idmHumanUrl('sam1 (1).jpg') },
  { id: 'male_full_body_3', gender: 'male', type: 'full_body', ageGroup: 'adult', tags: ['studio', 'bright'], url: ootModelUrl('051918_0.jpg') },
  { id: 'male_full_body_4', gender: 'male', type: 'full_body', ageGroup: 'adult', tags: ['studio'], url: ootModelUrl('051962_0.jpg') },
  { id: 'male_full_body_5', gender: 'male', type: 'full_body', ageGroup: 'adult', tags: ['studio'], url: ootModelUrl('049205_0.jpg') },
  { id: 'male_full_body_2', gender: 'male', type: 'full_body', ageGroup: 'adult', tags: ['studio'], url: idmHumanUrl('will1 (1).jpg') },

  // Male — portrait
  { id: 'male_portrait_1', gender: 'male', type: 'portrait', ageGroup: 'adult', tags: ['studio'], url: idmHumanUrl('will1 (1).jpg') },
  { id: 'male_portrait_2', gender: 'male', type: 'portrait', ageGroup: 'adult', tags: ['studio'], url: idmHumanUrl('Jensen.jpeg') },
  { id: 'male_portrait_3', gender: 'male', type: 'portrait', ageGroup: 'adult', tags: ['studio', 'bright'], url: ootModelUrl('model_6.png') },
];

/**
 * Maps garment category (UI or vision) to the required human model framing.
 * @param {string | null | undefined} category
 * @returns {TryOnModelType}
 */
export function resolveRequiredModelType(category) {
  const normalized = typeof category === 'string'
    ? category.trim().toLowerCase()
    : '';

  if (normalized === 'top' || normalized === 'tops' || normalized === 'upper_body' || normalized === 'upperbody') {
    return 'portrait';
  }

  // auto / dress / bottom / unknown → full-body
  return 'full_body';
}

/**
 * Normalizes category to UI values used for crop / garment_des logic.
 * @param {string | null | undefined} category
 * @returns {'top' | 'bottom' | 'dress'}
 */
export function normalizeUiTryOnCategory(category) {
  const normalized = typeof category === 'string'
    ? category.trim().toLowerCase()
    : '';

  switch (normalized) {
    case 'bottom':
    case 'lower_body':
    case 'lowerbody':
      return 'bottom';
    case 'dress':
    case 'dresses':
      return 'dress';
    default:
      return 'top';
  }
}

/**
 * @param {TryOnGender} gender
 * @param {TryOnModelType} type
 * @returns {TryOnModel[]}
 */
export function filterTryOnModels(gender, type) {
  const resolvedGender = gender === 'male' ? 'male' : 'female';
  return tryOnModels.filter(
    (model) => model.gender === resolvedGender && model.type === type,
  );
}

/**
 * Prefer bright catalog / studio models (FASHN Starter-like look).
 * @param {TryOnModel[]} pool
 * @returns {TryOnModel[]}
 */
export function preferStudioModels(pool) {
  if (!Array.isArray(pool) || !pool.length) {
    return [];
  }

  const scored = pool.map((model) => {
    const tags = Array.isArray(model.tags) ? model.tags : [];
    let score = 0;
    if (tags.includes('studio')) score += 3;
    if (tags.includes('bright')) score += 3;
    if (tags.includes('catalog')) score += 2;
    if (tags.includes('elegant')) score += 1;
    return { model, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map((entry) => entry.model);
}

/**
 * Picks a model from the pool using a stable hash (garment hash or seed).
 * @param {{ gender?: TryOnGender, category?: string, garmentHash?: string, seed?: number }} params
 * @returns {TryOnModel}
 */
export function selectTryOnModel({ gender, category, garmentHash, seed } = {}) {
  const resolvedGender = gender === 'male' ? 'male' : 'female';
  const requiredType = resolveRequiredModelType(category);
  const pool = preferStudioModels(filterTryOnModels(resolvedGender, requiredType));

  if (!pool.length) {
    const fallback = tryOnModels.find(
      (model) => model.gender === resolvedGender,
    ) || tryOnModels[0];

    if (!fallback) {
      throw new Error('Try-on model pool is empty.');
    }

    return fallback;
  }

  // Always prefer top studio models for full-body catalog try-on
  if (requiredType === 'full_body') {
    const studioOnly = pool.filter((model) => (model.tags || []).includes('bright'));
    const candidates = studioOnly.length ? studioOnly : pool;
    if (typeof garmentHash === 'string' && garmentHash.length > 0) {
      const parsed = Number.parseInt(garmentHash.slice(0, 8), 16);
      if (Number.isFinite(parsed)) {
        return candidates[Math.abs(parsed) % candidates.length];
      }
    }
    return candidates[0];
  }

  if (typeof garmentHash === 'string' && garmentHash.length > 0) {
    const parsed = Number.parseInt(garmentHash.slice(0, 8), 16);
    if (Number.isFinite(parsed)) {
      return pool[Math.abs(parsed) % pool.length];
    }
  }

  if (Number.isFinite(seed)) {
    return pool[Math.abs(seed) % pool.length];
  }

  return pool[0];
}

/**
 * Backward-compatible pool accessor for controller model pre-selection.
 * @param {TryOnGender | string | null | undefined} gender
 * @param {string | null | undefined} category
 * @returns {TryOnModel[]}
 */
export function getTryOnModelPool(gender, category) {
  const resolvedGender = gender === 'male' ? 'male' : 'female';
  const requiredType = resolveRequiredModelType(category);
  const pool = preferStudioModels(filterTryOnModels(resolvedGender, requiredType));

  return pool.length ? pool : tryOnModels.filter((model) => model.gender === resolvedGender);
}

export const DEFAULT_FEMALE_FULLBODY_MODEL = (
  preferStudioModels(
    tryOnModels.filter((model) => model.gender === 'female' && model.type === 'full_body'),
  )[0]?.url
  || tryOnModels[0]?.url
);
