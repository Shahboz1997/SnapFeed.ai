const IDM_VTON_HUMAN_BASE =
  'https://raw.githubusercontent.com/yisol/IDM-VTON/main/gradio_demo/example/human';

function humanUrl(filename) {
  return `${IDM_VTON_HUMAN_BASE}/${encodeURI(filename)}`;
}

/** @typedef {'female' | 'male'} TryOnGender */
/** @typedef {'portrait' | 'full_body'} TryOnModelType */
/** @typedef {{ id: string, gender: TryOnGender, type: TryOnModelType, url: string }} TryOnModel */

/** @type {TryOnModel[]} */
export const tryOnModels = [
  {
    id: 'female_portrait_1',
    gender: 'female',
    type: 'portrait',
    url: humanUrl('00034_00.jpg'),
  },
  {
    id: 'female_portrait_2',
    gender: 'female',
    type: 'portrait',
    url: humanUrl('00035_00.jpg'),
  },
  {
    id: 'female_portrait_3',
    gender: 'female',
    type: 'portrait',
    url: humanUrl('00055_00.jpg'),
  },
  {
    id: 'female_portrait_4',
    gender: 'female',
    type: 'portrait',
    url: humanUrl('01992_00.jpg'),
  },
  {
    id: 'female_full_body_1',
    gender: 'female',
    type: 'full_body',
    url: humanUrl('taylor-.jpg'),
  },
  {
    id: 'female_full_body_2',
    gender: 'female',
    type: 'full_body',
    url: humanUrl('00121_00.jpg'),
  },
  {
    id: 'male_portrait_1',
    gender: 'male',
    type: 'portrait',
    url: humanUrl('will1 (1).jpg'),
  },
  {
    id: 'male_portrait_2',
    gender: 'male',
    type: 'portrait',
    url: humanUrl('Jensen.jpeg'),
  },
  {
    id: 'male_full_body_1',
    gender: 'male',
    type: 'full_body',
    url: humanUrl('will1 (1).jpg'),
  },
  {
    id: 'male_full_body_2',
    gender: 'male',
    type: 'full_body',
    url: humanUrl('sam1 (1).jpg'),
  },
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

  if (
    normalized === 'dress'
    || normalized === 'dresses'
    || normalized === 'bottom'
    || normalized === 'lower_body'
    || normalized === 'lowerbody'
  ) {
    return 'full_body';
  }

  return 'portrait';
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
 * Picks a model from the pool using a stable hash (garment hash or seed).
 * @param {{ gender?: TryOnGender, category?: string, garmentHash?: string, seed?: number }} params
 * @returns {TryOnModel}
 */
export function selectTryOnModel({ gender, category, garmentHash, seed } = {}) {
  const resolvedGender = gender === 'male' ? 'male' : 'female';
  const requiredType = resolveRequiredModelType(category);
  const pool = filterTryOnModels(resolvedGender, requiredType);

  if (!pool.length) {
    const fallback = tryOnModels.find(
      (model) => model.gender === resolvedGender,
    ) || tryOnModels[0];

    if (!fallback) {
      throw new Error('Try-on model pool is empty.');
    }

    return fallback;
  }

  if (typeof garmentHash === 'string' && garmentHash.length > 0 && requiredType !== 'full_body') {
    const parsed = Number.parseInt(garmentHash.slice(0, 8), 16);
    if (Number.isFinite(parsed)) {
      return pool[Math.abs(parsed) % pool.length];
    }
  }

  if (Number.isFinite(seed) && requiredType !== 'full_body') {
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
  const pool = filterTryOnModels(resolvedGender, requiredType);

  return pool.length ? pool : tryOnModels.filter((model) => model.gender === resolvedGender);
}

export const DEFAULT_FEMALE_FULLBODY_MODEL = (
  tryOnModels.find((model) => model.gender === 'female' && model.type === 'full_body')?.url
  || tryOnModels[0]?.url
);
