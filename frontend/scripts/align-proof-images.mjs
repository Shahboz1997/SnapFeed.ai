/**
 * Bake shoulder-aligned before/after proof pairs (900×1200).
 *
 * Auto shoulder detection is unreliable (hair vs fabric). Placement is
 * manually tuned per pair — edit TUNING if a slider still looks off.
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '../public');
const outDir = path.join(publicDir, 'studio-examples/proof');
const W = 900;
const H = 1200;
const BG = { r: 245, g: 245, b: 246, alpha: 255 };
const WHITE = { r: 255, g: 255, b: 255, alpha: 255 };

fs.mkdirSync(outDir, { recursive: true });

function colorDist(r, g, b, br, bg, bb) {
  return Math.abs(r - br) + Math.abs(g - bg) + Math.abs(b - bb);
}

/** Flood-fill corner-similar background → transparent subject. */
async function cutout(inputPath, tol = 52) {
  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const total = width * height;
  const bg = new Uint8Array(total);

  const corners = [
    [1, 1],
    [width - 2, 1],
    [1, height - 2],
    [width - 2, height - 2],
    [Math.floor(width / 2), 1],
  ].map(([x, y]) => {
    const i = (y * width + x) * channels;
    return [data[i], data[i + 1], data[i + 2]];
  });

  const isBg = (idx) => {
    const i = idx * channels;
    if (data[i + 3] < 12) return true;
    return corners.some(([cr, cg, cb]) => colorDist(data[i], data[i + 1], data[i + 2], cr, cg, cb) <= tol);
  };

  const stack = [];
  const seed = (idx) => {
    if (idx < 0 || idx >= total || bg[idx] || !isBg(idx)) return;
    bg[idx] = 1;
    stack.push(idx);
  };
  for (let x = 0; x < width; x++) {
    seed(x);
    seed((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    seed(y * width);
    seed(y * width + width - 1);
  }
  while (stack.length) {
    const idx = stack.pop();
    const x = idx % width;
    for (const n of [idx - 1, idx + 1, idx - width, idx + width]) {
      if (n < 0 || n >= total) continue;
      if (Math.abs((n % width) - x) > 1) continue;
      seed(n);
    }
  }

  const out = Buffer.alloc(total * 4);
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (let i = 0; i < total; i++) {
    const s = i * channels;
    const d = i * 4;
    if (bg[i]) {
      out[d + 3] = 0;
      continue;
    }
    out[d] = data[s];
    out[d + 1] = data[s + 1];
    out[d + 2] = data[s + 2];
    out[d + 3] = 255;
    const x = i % width;
    const y = (i - x) / width;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  return {
    rgba: out,
    width,
    height,
    bbox: {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    },
  };
}

/** Prefer dark fabric bbox (black garments); else opaque bbox. */
function subjectBox(cut, { darkOnly = false, lumMax = 75, minRowN = 60, minRowW = 120 } = {}) {
  const { rgba, width, height, bbox } = cut;
  if (!darkOnly) return bbox;

  const rows = [];
  for (let y = bbox.minY; y <= bbox.maxY; y++) {
    let minX = width;
    let maxX = -1;
    let n = 0;
    for (let x = bbox.minX; x <= bbox.maxX; x++) {
      const i = (y * width + x) * 4;
      if (rgba[i + 3] < 20) continue;
      const lum = (rgba[i] + rgba[i + 1] + rgba[i + 2]) / 3;
      if (lum > lumMax) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      n++;
    }
    if (n >= minRowN && maxX - minX + 1 >= minRowW) {
      rows.push({ y, minX, maxX });
    }
  }
  if (rows.length < 20) return bbox;

  const minY = rows[0].y;
  const maxY = rows[rows.length - 1].y;
  const minX = Math.min(...rows.map((r) => r.minX));
  const maxX = Math.max(...rows.map((r) => r.maxX));
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

async function fitModel(modelPath, { background = BG, flattenBg = false } = {}) {
  const meta = await sharp(modelPath).metadata();
  const pad = 0.02;
  const scale = Math.min(
    (W * (1 - pad * 2)) / meta.width,
    (H * (1 - pad * 2)) / meta.height,
  );
  const tw = Math.round(meta.width * scale);
  const th = Math.round(meta.height * scale);
  const left = Math.round((W - tw) / 2);
  const top = Math.round((H - th) / 2);

  let subject = await sharp(modelPath)
    .resize({ width: tw, height: th, fit: 'fill' })
    .png()
    .toBuffer();

  // Cut subject out of studio plate and drop onto a flat catalog background.
  if (flattenBg) {
    const tmp = path.join(outDir, '_tmp-model-flat.png');
    await fs.promises.writeFile(tmp, subject);
    const cut = await cutout(tmp, 42);
    await fs.promises.unlink(tmp).catch(() => {});
    subject = await sharp(cut.rgba, {
      raw: { width: cut.width, height: cut.height, channels: 4 },
    })
      .png()
      .toBuffer();
    return sharp({
      create: { width: W, height: H, channels: 4, background },
    })
      .composite([{ input: subject, left, top }])
      .png()
      .toBuffer();
  }

  return sharp({
    create: { width: W, height: H, channels: 4, background },
  })
    .composite([{ input: subject, left, top }])
    .png()
    .toBuffer();
}

/**
 * Place product so its top-left garment box matches the tuned frame.
 * @param {{ top: number, height: number, width: number, centerX: number, darkOnly?: boolean }} frame
 *   Pixel box on the 900×1200 canvas (top/height/width/centerX).
 */
async function fitProduct(productPath, frame, { tol = 52 } = {}) {
  let extracted;

  const canvasBg = frame.background || BG;

  // Absolute pixel crop in the SOURCE file (most reliable for tricky studio shots).
  if (frame.sourceCrop) {
    const c = frame.sourceCrop;
    const { data, info } = await sharp(productPath)
      .extract({ left: c.left, top: c.top, width: c.width, height: c.height })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;
    const tol = frame.productTol ?? 48;

    if (frame.whitenStudio) {
      // Flood from edges: turn connected studio plate into pure white (keep dress).
      const corners = [
        [1, 1],
        [width - 2, 1],
        [1, height - 2],
        [width - 2, height - 2],
        [Math.floor(width / 2), 1],
      ].map(([x, y]) => {
        const i = (y * width + x) * channels;
        return [data[i], data[i + 1], data[i + 2]];
      });
      const total = width * height;
      const marked = new Uint8Array(total);
      const stack = [];
      const isStudio = (idx) => {
        const i = idx * channels;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const chroma = Math.max(r, g, b) - Math.min(r, g, b);
        // Don't whiten saturated fabric (blue florals).
        if (chroma > 40) return false;
        return corners.some(
          ([cr, cg, cb]) => colorDist(r, g, b, cr, cg, cb) <= tol,
        );
      };
      const seed = (idx) => {
        if (idx < 0 || idx >= total || marked[idx] || !isStudio(idx)) return;
        marked[idx] = 1;
        stack.push(idx);
      };
      for (let x = 0; x < width; x++) {
        seed(x);
        seed((height - 1) * width + x);
      }
      for (let y = 0; y < height; y++) {
        seed(y * width);
        seed(y * width + width - 1);
      }
      while (stack.length) {
        const idx = stack.pop();
        const x = idx % width;
        for (const n of [idx - 1, idx + 1, idx - width, idx + width]) {
          if (n < 0 || n >= total) continue;
          if (Math.abs((n % width) - x) > 1) continue;
          seed(n);
        }
      }
      for (let i = 0; i < total; i++) {
        if (!marked[i]) continue;
        const o = i * channels;
        data[o] = 255;
        data[o + 1] = 255;
        data[o + 2] = 255;
        data[o + 3] = 255;
      }
    }

    // Tight bbox around remaining non-white content (the dress).
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * channels;
        const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
        if (lum > 250) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    const bw = Math.max(1, maxX - minX + 1);
    const bh = Math.max(1, maxY - minY + 1);
    const cropped = await sharp(data, { raw: { width, height, channels } })
      .extract({ left: minX, top: minY, width: bw, height: bh })
      .png()
      .toBuffer({ resolveWithObject: true });

    const scale = frame.height / cropped.info.height;
    const pw = Math.round(cropped.info.width * scale);
    const ph = Math.round(cropped.info.height * scale);
    const resized = await sharp(cropped.data)
      .resize({ width: pw, height: ph, fit: 'fill' })
      .png()
      .toBuffer();
    const left = Math.round(frame.centerX - pw / 2);
    const top = Math.round(frame.top);
    console.log(
      `  product(sourceCrop+whiten) ${pw}x${ph} at (${left},${top}) @y=${frame.top}`,
    );
    return sharp({
      create: { width: W, height: H, channels: 4, background: canvasBg },
    })
      .composite([{
        input: resized,
        left: Math.max(0, Math.min(W - pw, left)),
        top: Math.max(0, Math.min(H - ph, top)),
      }])
      .png()
      .toBuffer();
  }

  if (frame.noCutout) {
    // Light garments: trim margins, optionally lock to light fabric (skip dark studio void).
    const { data, info } = await sharp(productPath)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let minX = info.width;
    let minY = info.height;
    let maxX = 0;
    let maxY = 0;

    if (frame.lightFabricCrop) {
      // White / pastel garment only — skip dark studio void and grey pedestals.
      for (let y = 0; y < info.height; y++) {
        let rowMin = info.width;
        let rowMax = -1;
        let light = 0;
        for (let x = 0; x < info.width; x++) {
          const i = (y * info.width + x) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const lum = (r + g + b) / 3;
          const chroma = Math.max(r, g, b) - Math.min(r, g, b);
          // Pedestal/concrete is grey (low chroma); floral fabric has blue flecks.
          if (data[i + 3] < 20 || lum > 242 || lum < 165) continue;
          if (chroma < 8 && lum < 210) continue;
          light++;
          rowMin = Math.min(rowMin, x);
          rowMax = Math.max(rowMax, x);
        }
        if (light < 70) continue;
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        minX = Math.min(minX, rowMin);
        maxX = Math.max(maxX, rowMax);
      }
    } else {
      for (let y = 0; y < info.height; y++) {
        for (let x = 0; x < info.width; x++) {
          const i = (y * info.width + x) * 4;
          const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
          if (data[i + 3] < 20 || lum > 242) continue;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }

    // Drop pedestal / floor props under the garment (packshot).
    const bottomCrop = Math.min(0.45, Math.max(0, frame.bottomCropFrac || 0));
    if (bottomCrop > 0) {
      maxY = minY + Math.round((maxY - minY + 1) * (1 - bottomCrop)) - 1;
    }
    const bw = Math.max(1, maxX - minX + 1);
    const bh = Math.max(1, maxY - minY + 1);
    const scale = frame.height / bh;
    const pw = Math.round(bw * scale);
    const ph = Math.round(bh * scale);
    const resized = await sharp(productPath)
      .extract({ left: minX, top: minY, width: bw, height: bh })
      .resize({ width: pw, height: ph, fit: 'fill' })
      .png()
      .toBuffer();
    const left = Math.round(frame.centerX - pw / 2);
    const top = Math.round(frame.top);
    console.log(
      `  product(trim) ${pw}x${ph} at (${left},${top}) from ${bw}x${bh} @y=${frame.top} bottomCrop=${bottomCrop}`,
    );
    return sharp({
      create: { width: W, height: H, channels: 4, background: canvasBg },
    })
      .composite([{
        input: resized,
        left: Math.max(0, Math.min(W - pw, left)),
        top: Math.max(0, Math.min(H - ph, top)),
      }])
      .png()
      .toBuffer();
  }

  const cut = await cutout(productPath, tol);
  const box = subjectBox(cut, { darkOnly: Boolean(frame.darkOnly) });

  extracted = await sharp(cut.rgba, {
    raw: { width: cut.width, height: cut.height, channels: 4 },
  })
    .extract({
      left: box.minX,
      top: box.minY,
      width: box.width,
      height: box.height,
    })
    .png()
    .toBuffer({ resolveWithObject: true });

  // Pin TOP to frame.top and match height so shoulders/hem register.
  const scale = frame.height / extracted.info.height;
  const pw = Math.round(extracted.info.width * scale);
  const ph = Math.round(extracted.info.height * scale);

  const resized = await sharp(extracted.data)
    .resize({ width: pw, height: ph, fit: 'fill' })
    .png()
    .toBuffer();

  const left = Math.round(frame.centerX - pw / 2);
  const top = Math.round(frame.top);

  console.log(
    `  product ${pw}x${ph} at (${left},${top})  target ${frame.width}x${frame.height} @y=${frame.top}`,
  );

  return sharp({
    create: { width: W, height: H, channels: 4, background: canvasBg },
  })
    .composite([{
      input: resized,
      left: Math.max(0, Math.min(W - pw, left)),
      top: Math.max(0, Math.min(H - ph, top)),
    }])
    .png()
    .toBuffer();
}

async function savePair(id, beforeBuf, afterBuf, guideY) {
  await fs.promises.writeFile(path.join(outDir, `${id}-before-v3.png`), beforeBuf);
  await fs.promises.writeFile(path.join(outDir, `${id}-after-v3.png`), afterBuf);

  // 50/50 slider mock for visual QA
  const b = await sharp(beforeBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const a = await sharp(afterBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const src = x < W / 2 ? b.data : a.data;
      out[i] = src[i];
      out[i + 1] = src[i + 1];
      out[i + 2] = src[i + 2];
      out[i + 3] = 255;
    }
  }
  const y = Math.round(guideY);
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    out[i] = 22;
    out[i + 1] = 163;
    out[i + 2] = 74;
  }
  // center divider
  for (let yy = 0; yy < H; yy++) {
    const i = (yy * W + Math.floor(W / 2)) * 4;
    out[i] = 255;
    out[i + 1] = 255;
    out[i + 2] = 255;
  }

  await sharp(out, { raw: { width: W, height: H, channels: 4 } })
    .png()
    .toFile(path.join(outDir, `_${id}-overlay.png`));
  console.log(`  saved ${id}`);
}

/**
 * MANUAL TUNING — fractions of canvas, tuned for the slider at 50%.
 * top/height/width/centerX are in pixels on 900×1200.
 */
const TUNING = {
  'product-to-model': {
    // Switched to front-facing white set (before-2/after-2) — black dress pose never locked.
    top: 272,
    height: 870,
    width: 360,
    centerX: 450,
    noCutout: true,
    productTol: 48,
  },
  packshot: {
    // Pure white catalog bg — replace studio plate by edge flood, keep dress.
    top: 230,
    height: 880,
    width: 340,
    centerX: 450,
    sourceCrop: { left: 55, top: 145, width: 460, height: 640 },
    background: WHITE,
    productTol: 38,
    whitenStudio: true,
  },
  tryon: {
    // Leave as-is (card 3 is fine).
    top: 255,
    height: 870,
    width: 360,
    centerX: 455,
    noCutout: true,
    productTol: 48,
  },
};

console.log('product-to-model');
{
  // Front-facing white set — full-bleed cover so shoulders share the frame
  // (black midi ¾ pose could never lock cleanly).
  const beforeRaw = await sharp(path.join(publicDir, 'studio-examples/product-to-model-before-2.png'))
    .resize(W, H, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer();
  const afterRaw = await sharp(path.join(publicDir, 'studio-examples/product-to-model-after-2.png'))
    .resize(W, H, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer();
  const before = await unifyStudioBackground(beforeRaw);
  const after = await unifyStudioBackground(afterRaw);
  await savePair('product-to-model', before, after, 260);
}

/** Lift low-chroma studio walls toward the same cool white (keeps floral dress). */
async function unifyStudioBackground(inputBuf) {
  const { data, info } = await sharp(inputBuf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    const lum = (r + g + b) / 3;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    // Skip saturated fabric (florals) and dark subject detail / hair.
    if (chroma > 28 || lum < 95) continue;
    // Also skip warm skin tones in the mid band.
    if (r > g + 15 && r > b + 15 && lum < 210) continue;
    const t = Math.min(1, (lum - 95) / 110) * 0.78;
    data[o] = Math.round(r + (248 - r) * t);
    data[o + 1] = Math.round(g + (248 - g) * t);
    data[o + 2] = Math.round(b + (248 - b) * t);
  }
  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

console.log('packshot');
{
  // Full-bleed cover + unified cool-white studio walls (no letterbox card).
  const beforeRaw = await sharp(path.join(publicDir, 'studio-examples/packshot-after.png'))
    .resize(W, H, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer();
  const afterRaw = await sharp(path.join(publicDir, 'studio-examples/packshot-before.png'))
    .resize(W, H, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer();
  const before = await unifyStudioBackground(beforeRaw);
  const after = await unifyStudioBackground(afterRaw);
  await savePair('packshot', before, after, 220);
}

console.log('tryon');
{
  const t = TUNING.tryon;
  const after = await fitModel(
    path.join(publicDir, 'fashn-tryon-result.png'),
  );
  const before = await fitProduct(
    path.join(publicDir, 'studio-examples/tryon-product-2.png'),
    t,
    { tol: t.productTol },
  );
  await savePair('tryon', before, after, t.top);
}

console.log('done — inspect public/studio-examples/proof/_*-overlay.png');
