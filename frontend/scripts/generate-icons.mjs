import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '../public');
const svgPath = path.join(publicDir, 'favicon.svg');
const svg = fs.readFileSync(svgPath);

const BRAND_BG = { r: 15, g: 23, b: 42, alpha: 1 };

async function writePng(name, size) {
  await sharp(svg)
    .resize(size, size)
    .png()
    .toFile(path.join(publicDir, name));
}

async function writeMaskable(name, size) {
  const iconSize = Math.round(size * 0.64);
  const padding = Math.floor((size - iconSize) / 2);
  const iconBuf = await sharp(svg).resize(iconSize, iconSize).png().toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BRAND_BG,
    },
  })
    .composite([{ input: iconBuf, left: padding, top: padding }])
    .png()
    .toFile(path.join(publicDir, name));
}

async function writeIco() {
  const sizes = [16, 32, 48];
  const pngBuffers = await Promise.all(
    sizes.map((size) => sharp(svg).resize(size, size).png().toBuffer()),
  );

  const headerSize = 6;
  const entrySize = 16;
  const offset = headerSize + entrySize * pngBuffers.length;
  let dataOffset = offset;
  const entries = [];

  for (let i = 0; i < pngBuffers.length; i += 1) {
    entries.push({
      width: sizes[i] === 256 ? 0 : sizes[i],
      height: sizes[i] === 256 ? 0 : sizes[i],
      size: pngBuffers[i].length,
      offset: dataOffset,
      buffer: pngBuffers[i],
    });
    dataOffset += pngBuffers[i].length;
  }

  const totalSize = dataOffset;
  const buffer = Buffer.alloc(totalSize);
  let cursor = 0;

  buffer.writeUInt16LE(0, cursor); cursor += 2;
  buffer.writeUInt16LE(1, cursor); cursor += 2;
  buffer.writeUInt16LE(pngBuffers.length, cursor); cursor += 2;

  for (const entry of entries) {
    buffer.writeUInt8(entry.width, cursor); cursor += 1;
    buffer.writeUInt8(entry.height, cursor); cursor += 1;
    buffer.writeUInt8(0, cursor); cursor += 1;
    buffer.writeUInt8(0, cursor); cursor += 1;
    buffer.writeUInt16LE(1, cursor); cursor += 2;
    buffer.writeUInt16LE(32, cursor); cursor += 2;
    buffer.writeUInt32LE(entry.size, cursor); cursor += 4;
    buffer.writeUInt32LE(entry.offset, cursor); cursor += 4;
  }

  for (const entry of entries) {
    entry.buffer.copy(buffer, entry.offset);
  }

  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), buffer);
}

await writePng('favicon-16.png', 16);
await writePng('favicon-32.png', 32);
await writePng('apple-touch-icon.png', 180);
await writePng('icon-192.png', 192);
await writePng('icon-512.png', 512);
await writeMaskable('icon-512-maskable.png', 512);
await writeIco();

console.log('Generated PWA icons in frontend/public');
