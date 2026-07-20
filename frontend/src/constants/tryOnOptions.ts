export type TryOnGender = 'female' | 'male';
/** FASHN auto-detects garment type — Studio always uses auto. */
export type TryOnCategory = 'auto' | 'top' | 'bottom' | 'dress';
export type TryOnManualCategory = 'top' | 'bottom' | 'dress';

export const DEFAULT_TRYON_GENDER: TryOnGender = 'female';
export const DEFAULT_TRYON_CATEGORY: TryOnCategory = 'auto';

export const TRYON_GENDER_OPTIONS: TryOnGender[] = ['female', 'male'];
/** Legacy panel only — Studio does not show these. */
export const TRYON_CATEGORY_OPTIONS: TryOnManualCategory[] = ['top', 'bottom', 'dress'];
