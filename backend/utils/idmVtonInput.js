import { IDM_VTON_SEED, IDM_VTON_STEPS } from '../constants/image.js';
import { createError } from './errors.js';

/** @typedef {'upper_body' | 'lower_body' | 'dresses'} IdmVtonCategory */

export const IDM_VTON_CATEGORIES = Object.freeze(['upper_body', 'lower_body', 'dresses']);

const DEFAULT_GARMENT_DESCRIPTION = 'Fashion garment';

/**
 * Clamps inference steps to the Replicate schema range (1–40, default 30).
 * @param {number | undefined} steps
 * @returns {number}
 */
export function clampIdmVtonSteps(steps = IDM_VTON_STEPS) {
  const parsed = Number(steps);
  if (!Number.isFinite(parsed)) {
    return 30;
  }
  return Math.min(40, Math.max(1, Math.round(parsed)));
}

/**
 * @param {unknown} category
 * @returns {IdmVtonCategory}
 */
export function normalizeIdmVtonCategory(category) {
  const normalized = typeof category === 'string' ? category.trim().toLowerCase() : '';

  switch (normalized) {
    case 'top':
    case 'upper_body':
    case 'upperbody':
      return 'upper_body';
    case 'bottom':
    case 'lower_body':
    case 'lowerbody':
      return 'lower_body';
    case 'dress':
    case 'dresses':
      return 'dresses';
    default:
      return 'upper_body';
  }
}

/**
 * Per Replicate schema: crop human framing for upper_body; full body for lower_body/dresses.
 * garm_img is pre-normalized to 3:4 before the API call.
 * @param {IdmVtonCategory} category
 * @returns {boolean}
 */
export function resolveIdmVtonCrop(category) {
  return category === 'upper_body';
}

/**
 * Per Replicate schema: force_dc is false by default, true when category=dresses.
 * @param {IdmVtonCategory} category
 * @returns {boolean}
 */
export function resolveIdmVtonForceDc(category) {
  return category === 'dresses';
}

/**
 * Builds a Replicate cuuupid/idm-vton input object aligned with the official schema.
 * Required: garm_img, human_img.
 *
 * @param {{
 *   garmImg: string,
 *   humanImg: string,
 *   category: string,
 *   garmentDes?: string,
 *   seed?: number,
 *   steps?: number,
 * }} params
 * @returns {{
 *   garm_img: string,
 *   human_img: string,
 *   garment_des: string,
 *   category: IdmVtonCategory,
 *   crop: boolean,
 *   force_dc: boolean,
 *   steps: number,
 *   seed: number,
 *   mask_only: boolean,
 * }}
 */
export function buildIdmVtonInput({
  garmImg,
  humanImg,
  category,
  garmentDes,
  seed = IDM_VTON_SEED,
  steps = IDM_VTON_STEPS,
}) {
  const garm_img = typeof garmImg === 'string' ? garmImg.trim() : '';
  const human_img = typeof humanImg === 'string' ? humanImg.trim() : '';

  if (!garm_img) {
    throw createError('Try-on requires garm_img (garment image).', 400);
  }

  if (!human_img) {
    throw createError('Try-on requires human_img (model photo).', 400);
  }

  const resolvedCategory = normalizeIdmVtonCategory(category);
  const garment_des = typeof garmentDes === 'string' && garmentDes.trim()
    ? garmentDes.trim().slice(0, 500)
    : DEFAULT_GARMENT_DESCRIPTION;

  const parsedSeed = Number(seed);
  const resolvedSeed = Number.isFinite(parsedSeed) ? Math.round(parsedSeed) : IDM_VTON_SEED;

  return {
    garm_img,
    human_img,
    garment_des,
    category: resolvedCategory,
    crop: resolveIdmVtonCrop(resolvedCategory),
    force_dc: resolveIdmVtonForceDc(resolvedCategory),
    steps: clampIdmVtonSteps(steps),
    seed: resolvedSeed,
    mask_only: false,
  };
}
