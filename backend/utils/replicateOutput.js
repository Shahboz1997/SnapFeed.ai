export function resolveReplicateImageUrl(output) {
  const item = Array.isArray(output) ? output[0] : output;

  if (!item) {
    return null;
  }

  if (typeof item.url === 'function') {
    const url = item.url();
    if (url instanceof URL) {
      return url.href;
    }
    return String(url);
  }

  if (typeof item === 'string') {
    return item;
  }

  if (typeof item.toString === 'function') {
    const asString = item.toString();
    if (asString && asString.startsWith('http')) {
      return asString;
    }
  }

  return null;
}
