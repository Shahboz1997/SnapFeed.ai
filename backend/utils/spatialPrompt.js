const EXTERIOR_PLACEMENT_KEYWORDS = [
  'outside the entrance',
  'outside the door',
  'outside the window',
  'outside the cafe',
  'outside the café',
  'outside the shop',
  'outside the store',
  'visible outside',
  'seen outside',
  'through the open door',
  'through the doorway',
  'through the entrance',
  'through the window',
  'on the sidewalk',
  'on the street',
  'on the pavement',
  'in the street',
  'exterior view',
  'visible through',
  'seen through',
  'outside entrance',
  'outside door',
  'снаружи',
  'на улице',
  'за дверью',
  'у входа снаружи',
  'виден снаружи',
  'видно снаруди',
  'через дверь',
  'через вход',
  'через окно',
];

const EXTERIOR_SUBJECT_PATTERNS = [
  /(?:^|[.!?]\s+)(?:a|an|the)\s+(.+?)\s+(?:is\s+)?visible\s+outside(?:\s+the\s+(?:entrance|door|window|caf[eé]|shop|store))?/i,
  /(?:^|[.!?]\s+)(?:a|an|the)\s+(.+?)\s+(?:stands?|parked|sitting|leaning)\s+outside(?:\s+the\s+(?:entrance|door|window))?/i,
  /outside\s+(?:the\s+)?(?:entrance|door|window)[^.]{0,80}?(?:a|an|the)\s+(.+?)(?:[.,]|$)/i,
];

export function detectExteriorPlacementRequest(text) {
  const lower = typeof text === 'string' ? text.toLowerCase() : '';
  if (!lower.trim()) {
    return false;
  }

  return EXTERIOR_PLACEMENT_KEYWORDS.some((keyword) => lower.includes(keyword));
}

export function extractExteriorSubject(userPrompt) {
  if (typeof userPrompt !== 'string' || !userPrompt.trim()) {
    return null;
  }

  const sentences = userPrompt.split(/(?<=[.!?])\s+/);

  for (const sentence of sentences) {
    if (!detectExteriorPlacementRequest(sentence)) {
      continue;
    }

    for (const pattern of EXTERIOR_SUBJECT_PATTERNS) {
      const match = sentence.match(pattern);
      const candidate = match?.[1]?.trim();
      if (candidate && candidate.length >= 3 && candidate.length <= 80) {
        return candidate.replace(/\s+/g, ' ');
      }
    }
  }

  for (const pattern of EXTERIOR_SUBJECT_PATTERNS) {
    const match = userPrompt.match(pattern);
    const candidate = match?.[1]?.trim();
    if (candidate && candidate.length >= 3 && candidate.length <= 80) {
      return candidate.replace(/\s+/g, ' ');
    }
  }

  return null;
}

export function buildFluxExteriorCompositionBlock(subjectLabel) {
  const subject = subjectLabel || 'the exterior object';

  return (
    'CRITICAL SPATIAL COMPOSITION: Camera is INSIDE the room looking toward the front entrance. '
    + `${subject} must be OUTSIDE on the sidewalk or street, visible through the open glass door or window in the BACKGROUND — `
    + `NOT standing on the interior floor in the foreground. `
    + `The interior floor and foreground must be completely empty of ${subject}. `
    + `${subject} appears in the bright exterior zone beyond the doorway, separated from the interior by the door frame.`
  );
}

export function reinforceFluxSpatialPrompt(userPrompt, optimizedPrompt, maxLength = 900) {
  if (!detectExteriorPlacementRequest(userPrompt)) {
    return optimizedPrompt;
  }

  const subject = extractExteriorSubject(userPrompt);
  const block = buildFluxExteriorCompositionBlock(subject);
  const trimmedOptimized = typeof optimizedPrompt === 'string' ? optimizedPrompt.trim() : '';

  if (!trimmedOptimized) {
    return block.slice(0, maxLength);
  }

  const combined = `${block} ${trimmedOptimized} ${block}`;
  return combined.slice(0, maxLength);
}
