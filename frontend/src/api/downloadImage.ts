import { ApiError } from './generateImage';

const API_URL = import.meta.env.VITE_API_URL ?? '';

export async function downloadImageBlob(imageUrl: string): Promise<Blob> {
  let response: Response;

  try {
    response = await fetch(`${API_URL}/api/download-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUrl }),
    });
  } catch {
    throw new ApiError('Unable to reach the server for download.');
  }

  if (!response.ok) {
    let message = 'Failed to download image.';
    try {
      const data = await response.json();
      if (data.error) message = data.error;
    } catch {
      // response is not JSON
    }
    throw new ApiError(message, response.status);
  }

  return response.blob();
}

export function triggerBlobDownload(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}
