import type { TryOnCategory, TryOnGender } from './tryOnOptions';

const IDM_VTON_HUMAN_BASE =
  'https://raw.githubusercontent.com/yisol/IDM-VTON/main/gradio_demo/example/human';

const OOT_DIFFUSION_MODEL_BASE =
  'https://raw.githubusercontent.com/levihsu/OOTDiffusion/main/run/examples/model';

function idmHumanUrl(filename: string): string {
  return `${IDM_VTON_HUMAN_BASE}/${encodeURI(filename)}`;
}

function ootModelUrl(filename: string): string {
  return `${OOT_DIFFUSION_MODEL_BASE}/${encodeURI(filename)}`;
}

export type TryOnModelType = 'portrait' | 'full_body';

export interface TryOnModel {
  id: string;
  gender: TryOnGender;
  type: TryOnModelType;
  url: string;
}

export const tryOnModels: TryOnModel[] = [
  // Female — upper body / portrait (tops)
  { id: 'female_portrait_1', gender: 'female', type: 'portrait', url: idmHumanUrl('00034_00.jpg') },
  { id: 'female_portrait_2', gender: 'female', type: 'portrait', url: idmHumanUrl('00035_00.jpg') },
  { id: 'female_portrait_3', gender: 'female', type: 'portrait', url: idmHumanUrl('00055_00.jpg') },
  { id: 'female_portrait_4', gender: 'female', type: 'portrait', url: idmHumanUrl('01992_00.jpg') },
  { id: 'female_portrait_5', gender: 'female', type: 'portrait', url: ootModelUrl('02849_00.jpg') },
  { id: 'female_portrait_6', gender: 'female', type: 'portrait', url: ootModelUrl('01008_00.jpg') },
  { id: 'female_portrait_7', gender: 'female', type: 'portrait', url: ootModelUrl('05997_00.jpg') },
  { id: 'female_portrait_8', gender: 'female', type: 'portrait', url: ootModelUrl('14627_00.jpg') },
  { id: 'female_portrait_9', gender: 'female', type: 'portrait', url: ootModelUrl('model_3.png') },
  {
    id: 'female_portrait_10',
    gender: 'female',
    type: 'portrait',
    url: 'https://replicate.delivery/pbxt/Kgw71Am207JpZ6XXLtFeFNyHQhUEPtRiHuGXb7ZP8JgzyNOK/KakaoTalk_Photo_2024-04-04-21-20-19.png',
  },

  // Female — full body (dresses & bottoms)
  { id: 'female_full_body_1', gender: 'female', type: 'full_body', url: idmHumanUrl('taylor-.jpg') },
  { id: 'female_full_body_2', gender: 'female', type: 'full_body', url: idmHumanUrl('00121_00.jpg') },
  { id: 'female_full_body_3', gender: 'female', type: 'full_body', url: ootModelUrl('052767_0.jpg') },
  { id: 'female_full_body_4', gender: 'female', type: 'full_body', url: ootModelUrl('049447_0.jpg') },
  { id: 'female_full_body_5', gender: 'female', type: 'full_body', url: ootModelUrl('053700_0.jpg') },
  { id: 'female_full_body_6', gender: 'female', type: 'full_body', url: ootModelUrl('049713_0.jpg') },

  // Male — upper body / portrait (tops)
  { id: 'male_portrait_1', gender: 'male', type: 'portrait', url: idmHumanUrl('will1 (1).jpg') },
  { id: 'male_portrait_2', gender: 'male', type: 'portrait', url: idmHumanUrl('Jensen.jpeg') },
  { id: 'male_portrait_3', gender: 'male', type: 'portrait', url: ootModelUrl('model_6.png') },

  // Male — full body (dresses & bottoms)
  { id: 'male_full_body_1', gender: 'male', type: 'full_body', url: idmHumanUrl('sam1 (1).jpg') },
  { id: 'male_full_body_2', gender: 'male', type: 'full_body', url: idmHumanUrl('will1 (1).jpg') },
  { id: 'male_full_body_3', gender: 'male', type: 'full_body', url: ootModelUrl('051918_0.jpg') },
  { id: 'male_full_body_4', gender: 'male', type: 'full_body', url: ootModelUrl('051962_0.jpg') },
  { id: 'male_full_body_5', gender: 'male', type: 'full_body', url: ootModelUrl('049205_0.jpg') },
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
