const GALLERY_KEY = 'snapfeed.tryon.gallery';
const MAX_ITEMS = 48;

export interface GalleryItem {
  id: string;
  imageUrl: string;
  originalImageUrl?: string | null;
  createdAt: string;
  hashtags?: string[];
}

function readRaw(): GalleryItem[] {
  try {
    const raw = localStorage.getItem(GALLERY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRaw(items: GalleryItem[]) {
  localStorage.setItem(GALLERY_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
}

export function listGalleryItems(): GalleryItem[] {
  return readRaw().sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function addGalleryItem(item: Omit<GalleryItem, 'id' | 'createdAt'> & { id?: string; createdAt?: string }) {
  const next: GalleryItem = {
    id: item.id || crypto.randomUUID(),
    imageUrl: item.imageUrl,
    originalImageUrl: item.originalImageUrl ?? null,
    hashtags: item.hashtags ?? [],
    createdAt: item.createdAt || new Date().toISOString(),
  };

  const existing = readRaw().filter((entry) => entry.imageUrl !== next.imageUrl);
  writeRaw([next, ...existing]);
  return next;
}

export function removeGalleryItem(id: string) {
  writeRaw(readRaw().filter((item) => item.id !== id));
}

export function clearGallery() {
  localStorage.removeItem(GALLERY_KEY);
}
