export const NO_TEXT_OVERLAY_RULE = `The user requested an image WITHOUT any text overlay. CRITICAL RULE: In your 'image_prompt', you MUST NOT include any words about text, labels, inscriptions, quotes, or letters. The generated image must be completely clean, containing only visual elements, scenery, or products. Absolutely no text inside the image.`;

export const NO_TEXT_IN_IMAGE_RULE =
  'No text, letters, words, logos, watermarks, labels or typography anywhere in the image.';

export const TEXT_OVERLAY_SPACE_RULE =
  'Leave generous clean negative space in the upper-center area for a text overlay. Do not render any text inside the image.';

export function parseIncludeText(value) {
  if (value === undefined || value === null) {
    return true;
  }
  return value === true;
}

export function appendNoTextRuleToPrompt(prompt) {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return NO_TEXT_OVERLAY_RULE;
  }
  return `${trimmed} ${NO_TEXT_OVERLAY_RULE}`;
}

export function extractQuotedOverlayText(prompt) {
  if (typeof prompt !== 'string' || !prompt.trim()) {
    return null;
  }

  const textInstructionMatch = prompt.match(/The text ["']([^"']+)["']/i);
  if (textInstructionMatch?.[1]) {
    return textInstructionMatch[1].trim();
  }

  const quotedMatch = prompt.match(/["']([^"']{2,80})["']/);
  return quotedMatch?.[1]?.trim() || null;
}
