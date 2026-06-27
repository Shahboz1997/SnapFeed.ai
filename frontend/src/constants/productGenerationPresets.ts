export type ProductGenerationMode = 'product' | 'tryon';

export const DEFAULT_PRODUCT_FILL_PROMPT =
  'High-end premium commercial studio advertising photography. An absolutely empty, clean vacant monochromatic geometric exhibition platform stands in the center, featuring a completely clear and empty top surface ready for product placement. The backdrop is an elegant, minimalist professional studio background with a soft seamless gradient and subtle volumetric atmosphere. Masterfully illuminated by dramatic three-point studio lighting, with a soft key light and continuous rim light creating a luxury brand aesthetic. Beautiful clean professional depth of field, sharp crisp focus on the empty center of the platform, background smoothly blurred into an elegant soft bokeh. 8k resolution, ray-traced lighting, hyper-realistic studio setup, completely empty frame background, no foreign objects, no extra items.';

/** Display-only labels; presets are applied on the backend after mode is sent. */
export const MODE_PRESETS: Record<ProductGenerationMode, string> = {
  product: DEFAULT_PRODUCT_FILL_PROMPT,
  tryon:
    'Fashion lookbook photography, lookbook примерка on model, highly detailed clothing texture, soft studio light, realistic skin, dress full body, 8k',
};

export function buildFinalUserWish(
  mode: ProductGenerationMode,
  manualWish: string,
): string {
  const preset = MODE_PRESETS[mode];
  const trimmed = manualWish.trim();

  if (!trimmed) {
    return preset;
  }

  if (mode === 'product') {
    return `${DEFAULT_PRODUCT_FILL_PROMPT}, ${trimmed}`;
  }

  return `${preset}. ${trimmed}`;
}
