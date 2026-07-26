export const GALLERY_COLLECTIONS = ['looks', 'catalog', 'favorites'] as const;
export type GalleryCollection = (typeof GALLERY_COLLECTIONS)[number];

export function isGalleryCollection(value: string | null | undefined): value is GalleryCollection {
  return Boolean(value && (GALLERY_COLLECTIONS as readonly string[]).includes(value));
}
