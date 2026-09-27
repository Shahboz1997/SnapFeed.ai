export type LandingProofTabId = 'tryon' | 'packshot' | 'productToModel';

export type LandingProofExample = {
  id: LandingProofTabId;
  before: string;
  after: string;
  objectPosition?: string;
};

/** Landing before/after pairs (aligned v3 assets). */
export const LANDING_PROOF_EXAMPLES: LandingProofExample[] = [
  {
    id: 'tryon',
    before: '/studio-examples/proof/tryon-before-v3.png',
    after: '/studio-examples/proof/tryon-after-v3.png',
    objectPosition: 'center top',
  },
  {
    id: 'packshot',
    before: '/studio-examples/proof/packshot-before-v3.png',
    after: '/studio-examples/proof/packshot-after-v3.png',
    objectPosition: 'center center',
  },
  {
    id: 'productToModel',
    before: '/studio-examples/proof/product-to-model-before-v3.png',
    after: '/studio-examples/proof/product-to-model-after-v3.png',
    objectPosition: 'center top',
  },
];
