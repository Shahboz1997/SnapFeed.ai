/** Draw a light SnapFeed watermark on a PNG/JPEG blob for share/download. */
export async function watermarkImageBlob(
  blob: Blob,
  label = 'SnapFeed.ai',
): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return blob;
  }

  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();

  const fontSize = Math.max(14, Math.round(canvas.width * 0.028));
  ctx.font = `600 ${fontSize}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';

  const pad = Math.round(fontSize * 0.7);
  const x = canvas.width - pad;
  const y = canvas.height - pad;

  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.strokeStyle = 'rgba(24,24,27,0.35)';
  ctx.lineWidth = Math.max(1, fontSize * 0.08);
  ctx.strokeText(label, x, y);
  ctx.fillText(label, x, y);

  return new Promise((resolve) => {
    canvas.toBlob((next) => resolve(next || blob), 'image/png');
  });
}
