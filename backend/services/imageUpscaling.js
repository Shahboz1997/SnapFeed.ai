import sharp from 'sharp';

const UPSCALE_ENABLED = process.env.IMAGE_UPSCALE_ENABLED !== 'false';
const UPSCALE_FACTOR = [2, 4].includes(Number(process.env.IMAGE_UPSCALE_FACTOR))
  ? Number(process.env.IMAGE_UPSCALE_FACTOR)
  : 2;

const MAX_SOURCE_DIMENSION = 1536;

function shouldSkipUpscale(width, height) {
  if (!width || !height) return true;
  return Math.max(width, height) > MAX_SOURCE_DIMENSION;
}

export function isImageUpscalingEnabled() {
  return UPSCALE_ENABLED;
}

export function getUpscaleFactor() {
  return UPSCALE_FACTOR;
}

export async function upscaleImageBuffer(inputBuffer) {
  if (!UPSCALE_ENABLED || !inputBuffer?.length) {
    return inputBuffer;
  }

  const metadata = await sharp(inputBuffer).metadata();
  const { width = 0, height = 0 } = metadata;

  if (shouldSkipUpscale(width, height)) {
    return inputBuffer;
  }

  const targetWidth = Math.round(width * UPSCALE_FACTOR);
  const targetHeight = Math.round(height * UPSCALE_FACTOR);

  console.log(`Upscaling image ${width}x${height} → ${targetWidth}x${targetHeight} (${UPSCALE_FACTOR}x)`);

  return sharp(inputBuffer)
    .resize(targetWidth, targetHeight, {
      kernel: sharp.kernel.lanczos3,
      fit: 'fill',
    })
    .sharpen({
      sigma: 0.8,
      m1: 1.0,
      m2: 0.4,
    })
    .png({
      compressionLevel: 6,
      quality: 95,
      effort: 7,
    })
    .toBuffer();
}
