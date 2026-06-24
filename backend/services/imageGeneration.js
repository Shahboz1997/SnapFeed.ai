import { toFile } from 'openai';
import { getOpenAI } from '../config/openai.js';
import { ASPECT_RATIO_SIZES } from '../constants/image.js';
import { createError } from '../utils/errors.js';
import { saveBase64Image, saveImageBuffer } from '../utils/imageStorage.js';
import { upscaleImageBuffer } from './imageUpscaling.js';
import { detectMimeType, normalizeBase64Image } from './productImageAnalysis.js';
import { isBackgroundRemovalEnabled, removeProductBackground } from './backgroundRemoval.js';

const PRODUCT_IMAGE_EDIT_MODELS = (
  process.env.OPENAI_PRODUCT_IMAGE_MODELS
  || process.env.OPENAI_IMAGE_MODELS
  || process.env.OPENAI_IMAGE_MODEL
  || 'gpt-image-1.5,gpt-image-1'
)
  .split(',')
  .map((model) => model.trim())
  .filter(Boolean);

const GPT_IMAGE_MODEL_PATTERN = /^gpt-image-|^chatgpt-image-latest$/;

async function persistImageBuffer(buffer) {
  const upscaledBuffer = await upscaleImageBuffer(buffer);
  const filename = await saveImageBuffer(upscaledBuffer);
  return `/api/generated-images/${filename}`;
}

async function persistRemoteImage(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch generated image: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return persistImageBuffer(buffer);
}

export async function persistRemoteImageUrl(url) {
  return persistRemoteImage(url);
}

async function extractImageResult(image) {
  if (image?.b64_json) {
    const filename = await saveBase64Image(image.b64_json);
    return `/api/generated-images/${filename}`;
  }

  if (image?.url) {
    return persistRemoteImage(image.url);
  }

  return null;
}

async function requestImage(model, prompt, aspectRatio) {
  const client = getOpenAI();

  if (model === 'dall-e-2') {
    return client.images.generate({
      model: 'dall-e-2',
      prompt,
      n: 1,
      size: '1024x1024',
      response_format: 'url',
    });
  }

  return client.images.generate({
    model,
    prompt,
    n: 1,
    size: ASPECT_RATIO_SIZES[aspectRatio],
    quality: 'medium',
  });
}

function buildProductEditPrompt(imagePrompt, backgroundRemoved) {
  const lines = [
    'Product Image Editing / Background Inpainting task.',
    backgroundRemoved
      ? 'The input image is an isolated product cutout on a transparent background.'
      : 'The input image contains the product to preserve exactly as shown.',
    'Preserve the exact product: keep its shape, proportions, colors, logos, labels, and all identifying details unchanged.',
    'CRITICAL COLOR RULE: The product MUST keep its original bright color from the reference image. Do not darken, shade, or recolor the product to match the background. Avoid heavy dark shadows on the product surface.',
    'Enhance lighting, sharpness, and clarity of the product only.',
    backgroundRemoved
      ? 'Fill all transparent areas with the luxurious commercial studio environment described below.'
      : 'Replace or upgrade the background and environment as described below.',
    imagePrompt,
  ];

  return lines.join(' ');
}

async function prepareProductImageForEdit(base64Image) {
  if (!isBackgroundRemovalEnabled()) {
    const rawBase64 = normalizeBase64Image(base64Image);
    const mimeType = detectMimeType(base64Image);
    const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
    return {
      buffer: Buffer.from(rawBase64, 'base64'),
      mimeType,
      extension,
      backgroundRemoved: false,
    };
  }

  try {
    console.log('Removing product background before OpenAI edit...');
    const transparentPngBuffer = await removeProductBackground(base64Image);

    if (transparentPngBuffer?.length) {
      console.log('Product background removed successfully.');
      return {
        buffer: transparentPngBuffer,
        mimeType: 'image/png',
        extension: 'png',
        backgroundRemoved: true,
      };
    }
  } catch (error) {
    const message = error?.message || 'unknown error';
    console.warn(`Background removal failed, using original image: ${message}`);
  }

  const rawBase64 = normalizeBase64Image(base64Image);
  const mimeType = detectMimeType(base64Image);
  const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';

  return {
    buffer: Buffer.from(rawBase64, 'base64'),
    mimeType,
    extension,
    backgroundRemoved: false,
  };
}

async function requestProductImageEdit(model, base64Image, imagePrompt, aspectRatio) {
  const client = getOpenAI();
  const { buffer, mimeType, extension, backgroundRemoved } = await prepareProductImageForEdit(base64Image);
  const imageFile = await toFile(buffer, `product.${extension}`, { type: mimeType });
  const prompt = buildProductEditPrompt(imagePrompt, backgroundRemoved);

  if (GPT_IMAGE_MODEL_PATTERN.test(model)) {
    return client.images.edit({
      model,
      image: imageFile,
      prompt,
      n: 1,
      size: ASPECT_RATIO_SIZES[aspectRatio],
      quality: 'high',
      input_fidelity: 'high',
      background: backgroundRemoved ? 'opaque' : 'auto',
      output_format: 'png',
    });
  }

  if (model === 'dall-e-2') {
    return client.images.edit({
      model: 'dall-e-2',
      image: imageFile,
      prompt: prompt.slice(0, 1000),
      n: 1,
      size: '1024x1024',
      response_format: 'url',
    });
  }

  throw new Error(`Unsupported product image edit model: ${model}`);
}

export async function generateImageWithFallback(optimizedPrompt, aspectRatio) {
  const errors = [];
  const models = (
    process.env.OPENAI_IMAGE_MODELS || process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1.5,gpt-image-1,dall-e-2'
  )
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);

  for (const model of models) {
    try {
      console.log(`Trying image model: ${model}`);
      const response = await requestImage(model, optimizedPrompt, aspectRatio);
      const imageUrl = await extractImageResult(response.data[0]);

      if (imageUrl) {
        console.log(`Image generated with model: ${model}`);
        return { imageUrl, modelUsed: model };
      }

      errors.push(`${model}: empty response`);
    } catch (error) {
      const message = error?.message || 'unknown error';
      console.error(`Image model ${model} failed:`, message);
      errors.push(`${model}: ${message}`);
    }
  }

  const details = errors.join(' | ');
  const needsModelAccess = /does not exist|not found|not allowed|access/i.test(details);
  const needsVpn = /403|region|country|timed out/i.test(details);

  if (needsModelAccess) {
    throw createError(
      'No image model available. In OpenAI Dashboard → Project → Limits, enable gpt-image-1.5 or dall-e-2, then restart the backend.',
      403,
    );
  }

  if (needsVpn) {
    throw createError(
      'OpenAI is blocked or unreachable from your network. Turn on VPN (US/EU) or set OPENAI_BASE_URL in backend/.env.',
      502,
    );
  }

  throw createError(`Image generation failed. ${details}`, 502);
}

export async function generateProductImageWithReference(base64Image, imagePrompt, aspectRatio) {
  const errors = [];

  for (const model of PRODUCT_IMAGE_EDIT_MODELS) {
    try {
      console.log(`Trying product image edit model: ${model}`);
      const response = await requestProductImageEdit(model, base64Image, imagePrompt, aspectRatio);
      const imageUrl = await extractImageResult(response.data[0]);

      if (imageUrl) {
        console.log(`Product image edited with model: ${model}`);
        return { imageUrl, modelUsed: model };
      }

      errors.push(`${model}: empty response`);
    } catch (error) {
      const message = error?.message || 'unknown error';
      console.error(`Product image edit model ${model} failed:`, message);
      errors.push(`${model}: ${message}`);
    }
  }

  const details = errors.join(' | ');
  const needsModelAccess = /does not exist|not found|not allowed|access/i.test(details);
  const needsVpn = /403|region|country|timed out/i.test(details);

  if (needsModelAccess) {
    throw createError(
      'No product image edit model available. In OpenAI Dashboard → Project → Limits, enable gpt-image-1.5 or gpt-image-1, then restart the backend.',
      403,
    );
  }

  if (needsVpn) {
    throw createError(
      'OpenAI is blocked or unreachable from your network. Turn on VPN (US/EU) or set OPENAI_BASE_URL in backend/.env.',
      502,
    );
  }

  throw createError(`Product image generation failed. ${details}`, 502);
}
