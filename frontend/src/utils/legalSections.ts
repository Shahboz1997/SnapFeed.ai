import type { TFunction } from 'i18next';
import type { LegalSection } from '../components/LegalPageLayout';

export function getLegalSections(t: TFunction, key: string): LegalSection[] {
  const value = t(key, { returnObjects: true });
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is LegalSection =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as LegalSection).title === 'string' &&
        typeof (item as LegalSection).body === 'string',
    )
    .map((item) => ({
      title: item.title,
      body: item.body,
      ...(typeof item.id === 'string' && item.id ? { id: item.id } : {}),
    }));
}
