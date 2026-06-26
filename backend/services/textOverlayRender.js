import sharp from 'sharp';

function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function resolveFontSize(textLength, width, format) {
  const base = format === 'story' ? 0.062 : 0.072;

  if (textLength > 28) {
    return Math.round(width * (base - 0.022));
  }

  if (textLength > 18) {
    return Math.round(width * (base - 0.012));
  }

  return Math.round(width * base);
}

export async function applyTextOverlay(imageBuffer, overlayText, format = 'square') {
  if (!overlayText?.trim() || !imageBuffer?.length) {
    return imageBuffer;
  }

  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width || 1024;
  const height = metadata.height || 1024;
  const text = overlayText.trim().toUpperCase();
  const fontSize = resolveFontSize(text.length, width, format);
  const yPosition = format === 'story' ? Math.round(height * 0.2) : Math.round(height * 0.36);
  const escaped = escapeXml(text);

  const svg = `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#000000" flood-opacity="0.4"/>
    </filter>
  </defs>
  <text
    x="50%"
    y="${yPosition}"
    text-anchor="middle"
    dominant-baseline="middle"
    font-family="Arial, Helvetica, DejaVu Sans, sans-serif"
    font-size="${fontSize}"
    font-weight="700"
    letter-spacing="1"
    fill="#FFFFFF"
    filter="url(#shadow)"
  >${escaped}</text>
</svg>`;

  return sharp(imageBuffer)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();
}
