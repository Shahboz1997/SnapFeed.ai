/** FASHN-compatible studio output settings (ratio / resolution / generation mode). */

export const STUDIO_ASPECT_RATIOS = [
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '4:5',
  '5:4',
  '9:16',
  '16:9',
] as const;

export type StudioAspectRatio = (typeof STUDIO_ASPECT_RATIOS)[number];

/** UI + API: auto omits resolution so FASHN uses its default. */
export const STUDIO_RESOLUTIONS = ['auto', '1k', '2k', '4k'] as const;
export type StudioResolution = (typeof STUDIO_RESOLUTIONS)[number];

/** auto omits generation_mode so FASHN picks; others map 1:1 to the API. */
export const STUDIO_QUALITY_MODES = ['auto', 'fast', 'balanced', 'quality'] as const;
export type StudioQualityMode = (typeof STUDIO_QUALITY_MODES)[number];

/** 1 image = 1 credit; 3 variants = 2 credits. */
export const STUDIO_VARIANT_COUNTS = [1, 3] as const;
export type StudioVariantCount = (typeof STUDIO_VARIANT_COUNTS)[number];

export type StudioOutputSettings = {
  aspectRatio: StudioAspectRatio;
  resolution: StudioResolution;
  qualityMode: StudioQualityMode;
  numImages: StudioVariantCount;
};

export const DEFAULT_STUDIO_OUTPUT_SETTINGS: StudioOutputSettings = {
  aspectRatio: '3:4',
  resolution: '1k',
  qualityMode: 'fast',
  numImages: 1,
};

export function creditCostForVariantCount(count: number): number {
  return count >= 3 ? 2 : 1;
}

/** Map ratio → legacy square/story format used by non-FASHN product branch. */
export function aspectRatioToLegacyFormat(ratio: StudioAspectRatio): 'square' | 'story' {
  const [w, h] = ratio.split(':').map(Number);
  if (!w || !h) return 'story';
  return w >= h ? 'square' : 'story';
}

export function resolutionLabel(resolution: StudioResolution): string {
  switch (resolution) {
    case 'auto':
      return 'Auto';
    case '1k':
      return '1K';
    case '2k':
      return '2K';
    case '4k':
      return '4K';
    default:
      return '1K';
  }
}

/** Megapixel labels matching FASHN App (1k≈1MP, 2k≈4MP, 4k≈16MP). */
export function resolutionMenuLabel(resolution: StudioResolution): string {
  switch (resolution) {
    case 'auto':
      return 'Auto';
    case '1k':
      return '1MP';
    case '2k':
      return '4MP';
    case '4k':
      return '16MP';
    default:
      return '1MP';
  }
}
