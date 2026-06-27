const STYLE_PRESERVE_KEYWORDS = [
  'isometric',
  'diorama',
  'miniature',
  'tilt-shift',
  'tilt shift',
  '3d render',
  '3d miniature',
  'cinematic',
  'photorealistic',
  'anime',
  'illustration',
  'watercolor',
  'oil painting',
  'neon',
  'cyberpunk',
  'vintage',
  'macro photography',
  'clay render',
  'low poly',
  'pixel art',
  'studio ghibli',
  'hyperrealistic',
];

export function isDetailedScenePrompt(prompt) {
  if (typeof prompt !== 'string') {
    return false;
  }

  const trimmed = prompt.trim();
  if (trimmed.length < 80) {
    return false;
  }

  const lower = trimmed.toLowerCase();
  const latinChars = trimmed.match(/[a-zA-Z]/g)?.length ?? 0;
  const mostlyEnglish = latinChars / Math.max(trimmed.length, 1) > 0.65;
  const hasStyleKeyword = STYLE_PRESERVE_KEYWORDS.some((keyword) => lower.includes(keyword));
  const hasRichDetail = trimmed.split(/[.,;]/).filter((part) => part.trim().length > 12).length >= 3;

  return mostlyEnglish && (hasStyleKeyword || (trimmed.length >= 140 && hasRichDetail));
}

export function preserveDetailedPrompt(prompt, maxLength) {
  return prompt.trim().slice(0, maxLength);
}
