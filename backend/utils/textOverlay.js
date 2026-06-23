export const NO_TEXT_OVERLAY_RULE = `The user requested an image WITHOUT any text overlay. CRITICAL RULE: In your 'image_prompt' for DALL-E, you MUST NOT include any words about text, labels, inscriptions, quotes, or letters. The generated image must be completely clean, containing only visual elements, scenery, or products. Absolutely no text inside the image.`;

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
