const GALLERY_KEY = 'snapfeed.tryon.gallery';
const MAX_ITEMS = 48;
/** Stay under the typical 5 MB localStorage cap, leaving room for other site keys. */
const GALLERY_BUDGET_BYTES = 3_500_000;

export interface GalleryItem {
  id: string;
  imageUrl: string;
  originalImageUrl?: string | null;
  createdAt: string;
  hashtags?: string[];
  collection?: string | null;
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

function isQuotaError(error: unknown): boolean {
  if (!(error instanceof DOMException)) return false;
  return error.name === 'QuotaExceededError'
    || error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || error.code === 22;
}

function byteSize(items: GalleryItem[]): number {
  return new Blob([JSON.stringify(items)]).size;
}

function withoutInlineOriginal(item: GalleryItem): GalleryItem {
  if (!item.originalImageUrl?.startsWith('data:')) return item;
  return { ...item, originalImageUrl: null };
}

function pruneToBudget(items: GalleryItem[]): { items: GalleryItem[]; removedCount: number } {
  let next = items.slice(0, MAX_ITEMS);
  let removedCount = Math.max(0, items.length - next.length);

  while (next.length > 1 && byteSize(next) > GALLERY_BUDGET_BYTES) {
    next = next.slice(0, -1);
    removedCount += 1;
  }

  if (byteSize(next) > GALLERY_BUDGET_BYTES) {
    next = next.map(withoutInlineOriginal);
  }

  return { items: next, removedCount };
}

function commitItems(items: GalleryItem[]): number {
  let { items: next, removedCount } = pruneToBudget(items);

  while (next.length > 0) {
    try {
      localStorage.setItem(GALLERY_KEY, JSON.stringify(next));
      return removedCount;
    } catch (error) {
      if (!isQuotaError(error)) throw error;
      if (next.length === 1) {
        const slim = withoutInlineOriginal(next[0]);
        if (slim.originalImageUrl !== next[0].originalImageUrl) {
          next = [slim];
          continue;
        }
        throw error;
      }
      next = next.slice(0, -1);
      removedCount += 1;
    }
  }

  return removedCount;
}

function writeRaw(items: GalleryItem[]) {
  const payload = JSON.stringify(items.slice(0, MAX_ITEMS));
  try {
    localStorage.setItem(GALLERY_KEY, payload);
  } catch (error) {
    if (!isQuotaError(error)) throw error;
    localStorage.removeItem(GALLERY_KEY);
    localStorage.setItem(GALLERY_KEY, payload);
  }
}

export function listGalleryItems(): GalleryItem[] {
  return readRaw().sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function addGalleryItem(item: Omit<GalleryItem, 'id' | 'createdAt'> & { id?: string; createdAt?: string }): { item: GalleryItem; removedCount: number } {
  const next: GalleryItem = {
    id: item.id || crypto.randomUUID(),
    imageUrl: item.imageUrl,
    originalImageUrl: item.originalImageUrl ?? null,
    hashtags: item.hashtags ?? [],
    collection: item.collection ?? null,
    createdAt: item.createdAt || new Date().toISOString(),
  };

  const existing = readRaw().filter((entry) => entry.imageUrl !== next.imageUrl);
  const removedCount = commitItems([next, ...existing]);
  return { item: next, removedCount };
}

export function removeGalleryItem(id: string) {
  writeRaw(readRaw().filter((item) => item.id !== id));
}

export function setGalleryItemCollection(id: string, collection: string | null) {
  const next = readRaw().map((item) => (
    item.id === id ? { ...item, collection } : item
  ));
  writeRaw(next);
}

export function clearGallery() {
  localStorage.removeItem(GALLERY_KEY);
}
