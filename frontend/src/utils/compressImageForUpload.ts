const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

export async function compressImageForUpload(dataUrl: string): Promise<string> {
  if (!dataUrl.startsWith('data:image/')) {
    return dataUrl;
  }

  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      const largestSide = Math.max(image.width, image.height);
      const scale = largestSide > MAX_DIMENSION ? MAX_DIMENSION / largestSide : 1;
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Canvas is not available.'));
        return;
      }

      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
    };

    image.onerror = () => {
      reject(new Error('Failed to load image for compression.'));
    };

    image.src = dataUrl;
  });
}
