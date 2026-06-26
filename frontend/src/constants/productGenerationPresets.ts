export type ProductGenerationMode = 'product' | 'tryon';

/** Display-only labels; presets are applied on the backend after mode is sent. */
export const MODE_PRESETS: Record<ProductGenerationMode, string> = {
  product:
    'High-end commercial product photography, professional studio lighting, hyper-realistic, 8k, sharp focus, clean minimalist background',
  tryon:
    'Fashion lookbook photography, lookbook примерка on model, highly detailed clothing texture, soft studio light, realistic skin, dress full body, 8k',
};

export function buildFinalUserWish(
  mode: ProductGenerationMode,
  manualWish: string,
): string {
  const preset = MODE_PRESETS[mode];
  const trimmed = manualWish.trim();
  return trimmed ? `${preset}. ${trimmed}` : preset;
}
