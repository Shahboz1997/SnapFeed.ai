import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import sharp from 'sharp';
import Replicate from 'replicate';
import {
  buildBranchABackgroundInput,
  resolveBranchAModelsToTry,
  resolveBranchABackgroundMode,
} from '../constants/nanoBanana.js';

const PRODUCT_REFERENCE_MAX_EDGE = 768;

async function prepareProductReferenceDataUri(imageBuffer) {
  const jpegBuffer = await sharp(imageBuffer)
    .resize(PRODUCT_REFERENCE_MAX_EDGE, PRODUCT_REFERENCE_MAX_EDGE, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 82 })
    .toBuffer();

  return `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`;
}

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_PROMPT =
  'High-end premium commercial studio advertising photography. An absolutely empty, clean vacant monochromatic geometric exhibition platform stands in the center, featuring a completely clear and empty top surface ready for product placement. Completely empty frame background, no foreign objects, no hero product.';

const ASPECT_RATIO = '9:16';
const TIMEOUT_MS = 180_000;

async function withTimeout(promise, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS);
    }),
  ]);
}

function resolveOutputUrl(output) {
  const item = Array.isArray(output) ? output[0] : output;
  if (!item) return null;
  if (typeof item.url === 'function') {
    const url = item.url();
    return url instanceof URL ? url.href : String(url);
  }
  if (typeof item === 'string' && item.startsWith('http')) return item;
  return null;
}

async function testModel(replicate, model, productDataUri) {
  const mode = resolveBranchABackgroundMode(model, productDataUri);
  const input = buildBranchABackgroundInput(model, TEST_PROMPT, ASPECT_RATIO, productDataUri);
  const started = Date.now();

  console.log(`\n--- Testing ${model} (${mode}) ---`);

  try {
    const output = await withTimeout(
      replicate.run(model, { input }),
      model,
    );
    const url = resolveOutputUrl(output);

    if (!url) {
      console.log('FAIL: no output URL');
      return { model, ok: false, error: 'no output URL' };
    }

    const response = await fetch(url);
    if (!response.ok) {
      console.log(`FAIL: fetch ${response.status}`);
      return { model, ok: false, error: `fetch ${response.status}` };
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const outPath = path.resolve(__dirname, `../test-model-${model.replace(/\//g, '_')}.png`);
    fs.writeFileSync(outPath, buffer);

    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`OK in ${elapsed}s — ${(buffer.length / 1024).toFixed(1)} KB → ${outPath}`);
    return { model, ok: true, elapsed, bytes: buffer.length, path: outPath, mode };
  } catch (error) {
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`FAIL in ${elapsed}s: ${error.message}`);
    return { model, ok: false, error: error.message, elapsed };
  }
}

async function testFullPipeline(imagePath) {
  if (!fs.existsSync(imagePath)) {
    console.log('\nSkipping full pipeline — image not found:', imagePath);
    return null;
  }

  const buffer = fs.readFileSync(imagePath);
  const base64Image = buffer.toString('base64');
  const started = Date.now();

  console.log('\n=== Full product pipeline test ===');
  console.log('Image:', imagePath, `(${(buffer.length / 1024).toFixed(1)} KB)`);

  const response = await fetch('http://localhost:5000/api/generate-product-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      base64Image,
      image: base64Image,
      platform: 'instagram',
      format: 'story',
      mode: 'product',
      includeText: false,
      lang: 'ru',
    }),
  });

  const data = await response.json();
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  if (!response.ok) {
    console.log(`Pipeline FAIL (${response.status}) after ${elapsed}s:`, data.error || data);
    return { ok: false, error: data.error, elapsed };
  }

  const outPath = path.resolve(__dirname, '../test-output-pipeline-story.png');

  if (data.imageUrl?.startsWith('data:image')) {
    const b64 = data.imageUrl.split(',')[1];
    fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
  } else if (data.imageUrl?.startsWith('/api/')) {
    const imgRes = await fetch(`http://localhost:5000${data.imageUrl}`);
    fs.writeFileSync(outPath, Buffer.from(await imgRes.arrayBuffer()));
  }

  console.log(`Pipeline OK in ${elapsed}s`);
  console.log('Branch:', data.branchUsed);
  console.log('Model (from optimizedPrompt length):', data.optimizedPrompt?.length);
  console.log('Saved:', outPath);
  return { ok: true, elapsed, path: outPath, data };
}

async function main() {
  const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
  const models = resolveBranchAModelsToTry();
  const onlyModel = process.argv.find((arg) => arg.startsWith('--model='))?.split('=')[1];
  const skipModels = process.argv.includes('--skip-models');
  const imagePath = process.argv.find((arg) => /\.(png|jpe?g|webp)$/i.test(arg))
    || path.resolve(__dirname, '../debug_pure_background.png');

  let productDataUri = null;
  if (fs.existsSync(imagePath)) {
    const refBuffer = await prepareProductReferenceDataUri(fs.readFileSync(imagePath));
    productDataUri = refBuffer;
  }

  console.log('Branch A models:', models.join(' → '));
  console.log('Product reference:', productDataUri ? 'yes' : 'no');

  const results = [];

  if (!skipModels) {
    const toTest = onlyModel ? [onlyModel] : [models[0]];

    for (const model of toTest) {
      results.push(await testModel(replicate, model, productDataUri));
    }
  }

  const pipelineResult = await testFullPipeline(imagePath);

  const modelOk = results.filter((r) => r.ok).length;
  const modelTotal = results.length;

  console.log('\n=== Summary ===');
  if (modelTotal) {
    console.log(`Model tests: ${modelOk}/${modelTotal} passed`);
    results.forEach((r) => {
      console.log(`  ${r.ok ? '✓' : '✗'} ${r.model}${r.mode ? ` (${r.mode})` : ''}${r.error ? ` — ${r.error}` : ''}`);
    });
  }
  console.log(`Pipeline: ${pipelineResult?.ok ? '✓ passed' : pipelineResult ? `✗ ${pipelineResult.error}` : 'skipped'}`);

  if (modelTotal && modelOk === 0) {
    process.exit(1);
  }

  if (pipelineResult && !pipelineResult.ok) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
