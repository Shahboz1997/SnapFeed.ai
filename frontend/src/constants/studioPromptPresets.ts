export const STUDIO_PROMPT_PRESET_KEYS = [
  'studioLight',
  'softShadows',
  'lookbook',
  'fullBody',
  'cleanBg',
  'naturalFit',
] as const;

export type StudioPromptPresetKey = (typeof STUDIO_PROMPT_PRESET_KEYS)[number];

/** English phrases FASHN understands well (sent to the API, not shown as chip labels). */
export const STUDIO_PROMPT_PRESET_EN: Record<StudioPromptPresetKey, string> = {
  studioLight: 'bright professional studio lighting',
  softShadows: 'soft natural shadows',
  lookbook: 'editorial lookbook pose and styling',
  fullBody: 'full body framing head to toe',
  cleanBg: 'clean minimal studio background',
  naturalFit: 'natural realistic clothing fit and fabric drape',
};

export function composeStudioUserWish(
  freeText: string,
  selected: readonly StudioPromptPresetKey[],
): string {
  const parts = [
    freeText.trim(),
    ...selected.map((key) => STUDIO_PROMPT_PRESET_EN[key]),
  ].filter(Boolean);
  return parts.join(', ');
}
