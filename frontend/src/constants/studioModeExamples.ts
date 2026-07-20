export type StudioModeExampleId = 'tryon' | 'packshot' | 'product-to-model';

export type StudioModeExample = {
  before?: string;
  after?: string;
  /** Single hero when split before/after is not available */
  image?: string;
  titleKey: string;
  descriptionKey: string;
};

/** Fan collage samples for Try-On empty panels (FASHN-style). */
export const TRYON_PRODUCT_FAN = [
  '/studio-examples/tryon-product-1.png',
  '/studio-examples/tryon-product-3.png',
  '/studio-examples/tryon-product-2.png',
] as const;

export const TRYON_MODEL_FAN = [
  '/studio-examples/tryon-model-1.png',
  '/studio-examples/tryon-model-3.png',
  '/studio-examples/tryon-model-2.png',
] as const;

/** Hover / focus demo cards for studio mode pills (FASHN-style). */
export const STUDIO_MODE_EXAMPLES: Record<StudioModeExampleId, StudioModeExample> = {
  'product-to-model': {
    before: '/studio-examples/product-to-model-before-2.png',
    after: '/studio-examples/product-to-model-after-2.png',
    titleKey: 'studio.modeProductToModel',
    descriptionKey: 'studio.modeProductToModelDesc',
  },
  tryon: {
    titleKey: 'studio.modeTryOn',
    descriptionKey: 'studio.modeTryOnDesc',
  },
  packshot: {
    before: '/studio-examples/packshot-before.png',
    after: '/studio-examples/packshot-after.png',
    titleKey: 'studio.modePackshot',
    descriptionKey: 'studio.modePackshotDesc',
  },
};
