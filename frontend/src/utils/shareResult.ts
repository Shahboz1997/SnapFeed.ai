import { downloadImageBlob, triggerBlobDownload } from '../api/downloadImage';
import { COMPANY, COMPANY_SITE_HOST } from '../constants/company';
import { watermarkImageBlob } from './watermarkImage';

export async function shareOrDownloadResult(imageUrl: string, caption: string): Promise<'shared' | 'downloaded' | 'copied'> {
  const raw = await downloadImageBlob(imageUrl);
  const blob = await watermarkImageBlob(raw);
  const file = new File([blob], `snapfeed-${Date.now()}.png`, { type: 'image/png' });
  const shareTitle = COMPANY.brand;
  const shareText = caption.includes(COMPANY_SITE_HOST)
    ? caption
    : `${caption}\n${COMPANY.siteUrl}`;

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      const canFiles = typeof navigator.canShare === 'function'
        ? navigator.canShare({ files: [file] })
        : true;
      if (canFiles) {
        await navigator.share({
          files: [file],
          title: shareTitle,
          text: shareText,
        });
        return 'shared';
      }
      await navigator.share({ title: shareTitle, text: shareText });
      triggerBlobDownload(blob, file.name);
      return 'shared';
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        throw err;
      }
    }
  }

  triggerBlobDownload(blob, file.name);
  try {
    await navigator.clipboard?.writeText(shareText);
    return 'copied';
  } catch {
    return 'downloaded';
  }
}

export async function downloadWithWatermark(imageUrl: string, filename?: string): Promise<void> {
  const raw = await downloadImageBlob(imageUrl);
  const blob = await watermarkImageBlob(raw);
  triggerBlobDownload(blob, filename || `snapfeed-${Date.now()}.png`);
}
