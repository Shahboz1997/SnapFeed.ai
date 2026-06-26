import type { TryOnCategory, TryOnGender } from './tryOnOptions';

const IDM_VTON_HUMAN_BASE =
  'https://raw.githubusercontent.com/yisol/IDM-VTON/main/gradio_demo/example/human';

function humanUrl(filename: string): string {
  return `${IDM_VTON_HUMAN_BASE}/${encodeURI(filename)}`;
}

export type TryOnModelType = 'portrait' | 'full_body';

export interface TryOnModel {
  id: string;
  gender: TryOnGender;
  type: TryOnModelType;
  url: string;
}

export const tryOnModels: TryOnModel[] = [
  { id: 'female_portrait_1', gender: 'female', type: 'portrait', url: humanUrl('00034_00.jpg') },
  { id: 'female_portrait_2', gender: 'female', type: 'portrait', url: humanUrl('00035_00.jpg') },
  { id: 'female_portrait_3', gender: 'female', type: 'portrait', url: humanUrl('00055_00.jpg') },
  { id: 'female_portrait_4', gender: 'female', type: 'portrait', url: humanUrl('01992_00.jpg') },
  { id: 'female_full_body_1', gender: 'female', type: 'full_body', url: humanUrl('taylor-.jpg') },
  { id: 'female_full_body_2', gender: 'female', type: 'full_body', url: humanUrl('00121_00.jpg') },
  { id: 'male_portrait_1', gender: 'male', type: 'portrait', url: humanUrl('will1 (1).jpg') },
  { id: 'male_portrait_2', gender: 'male', type: 'portrait', url: humanUrl('Jensen.jpeg') },
  { id: 'male_full_body_1', gender: 'male', type: 'full_body', url: humanUrl('will1 (1).jpg') },
  { id: 'male_full_body_2', gender: 'male', type: 'full_body', url: humanUrl('sam1 (1).jpg') },
];

export function resolveRequiredModelType(category: TryOnCategory | string | null | undefined): TryOnModelType {
  const normalized = typeof category === 'string' ? category.trim().toLowerCase() : '';

  if (
    normalized === 'dress'
    || normalized === 'bottom'
    || normalized === 'lower_body'
  ) {
    return 'full_body';
  }

  return 'portrait';
}

export function filterTryOnModels(gender: TryOnGender, type: TryOnModelType): TryOnModel[] {
  return tryOnModels.filter((model) => model.gender === gender && model.type === type);
}
