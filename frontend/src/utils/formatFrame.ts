import type { AspectRatio } from '../api/generateImage';

export interface FormatFrameMeta {
  ratio: string;
  label: string;
  aspectClass: string;
  frameClass: string;
  filenameSuffix: string;
}

export function getFormatFrame(format: AspectRatio): FormatFrameMeta {
  if (format === 'story') {
    return {
      ratio: '9:16',
      label: 'Story',
      aspectClass: 'aspect-[9/16] max-h-[min(88dvh,920px)] w-full',
      frameClass: 'mx-auto w-full max-w-[min(100%,540px)]',
      filenameSuffix: 'story',
    };
  }

  return {
    ratio: '1:1',
    label: 'Square',
    aspectClass: 'aspect-square w-full',
    frameClass: 'mx-auto w-full',
    filenameSuffix: 'square',
  };
}
