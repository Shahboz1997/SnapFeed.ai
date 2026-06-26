const LANGUAGE_NAMES = {
  ru: 'Russian',
  en: 'English',
  uz: 'Uzbek',
  tg: 'Tajik',
};

const DEFAULT_HASHTAGS_BY_LANG = {
  ru: ['#Контент', '#SMM'],
  en: ['#SocialMedia', '#ContentCreator'],
  uz: ['#Kontent', '#SMM'],
  tg: ['#Мундариҷа', '#SMM'],
};

const LANGUAGE_EXAMPLES = {
  ru: 'A minimalist tech background with studio lighting. The Russian text "НОВЫЙ КУРС" is written clearly in a bold font.',
  en: 'A minimalist tech background with studio lighting. The English text "NEW COURSE" is written clearly in a bold font.',
  uz: 'A minimalist tech background with studio lighting. The Uzbek text "YANGI KURS" is written clearly in a bold font.',
  tg: 'A minimalist tech background with studio lighting. The Tajik text "КУРСИ НАВ" is written clearly in a bold font.',
};

export function normalizeLangCode(code) {
  if (!code || typeof code !== 'string') {
    return 'ru';
  }

  const normalized = code.trim().split('-')[0].toLowerCase();
  return LANGUAGE_NAMES[normalized] ? normalized : 'ru';
}

export function getLanguageName(code) {
  const normalized = normalizeLangCode(code);
  return LANGUAGE_NAMES[normalized] || 'Russian';
}

export function getDefaultHashtags(lang) {
  const normalized = normalizeLangCode(lang);
  return DEFAULT_HASHTAGS_BY_LANG[normalized] || DEFAULT_HASHTAGS_BY_LANG.ru;
}

export function stripHashtagsFromPrompt(prompt) {
  return prompt
    .replace(/(?:^|\s)#[\w\u0400-\u04FF\u0500-\u052F\u0600-\u06FF]+/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function buildLanguageExample(lang) {
  const normalized = normalizeLangCode(lang);
  const example = LANGUAGE_EXAMPLES[normalized] || LANGUAGE_EXAMPLES.ru;
  const languageName = getLanguageName(lang);

  return `EXAMPLE (lang is '${normalized}'): optimizedPrompt should look like: '${example}' and hashtags must be in ${languageName}.`;
}

export function buildDalleOnlyLanguageRule(lang) {
  const languageName = getLanguageName(lang);
  const normalized = normalizeLangCode(lang);
  const example = LANGUAGE_EXAMPLES[normalized] || LANGUAGE_EXAMPLES.ru;

  return `The user's interface language is ${languageName} (lang code: ${normalized}).

CRITICAL RULE FOR IMAGE PROMPT COMPOSITION:
1. Write the SCENE DESCRIPTION (visual layout, lighting, colors, style, composition, background, objects, mood) strictly in ENGLISH. FLUX produces the highest quality images when the scene is described in English.
2. Write the ON-IMAGE TEXT OVERLAY strictly in ${languageName}: pick ONE short phrase (maximum 3-4 words) in ${languageName}, wrap it in double quotes, and instruct the image AI explicitly in English, for example:
   The text "СПОРТ И ЖИЗНЬ" is written clearly in a bold minimalist font.
   Use correct grammar and alphabet (Cyrillic for Russian/Tajik, Latin for Uzbek/English). Do not mix languages inside the quoted text.

Do NOT write the entire prompt in ${languageName}. Only the quoted on-image text must be in ${languageName}; the scene description must stay in English.
Do NOT include hashtags in the prompt — hashtags are generated separately by the server.

EXAMPLE (lang is '${normalized}'): '${example}'`;
}

export function buildLanguageRule(lang) {
  const languageName = getLanguageName(lang);
  const languageExample = buildLanguageExample(lang);

  return `The user's interface language is ${languageName} (lang code: ${normalizeLangCode(lang)}).

CRITICAL RULE FOR IMAGE PROMPT COMPOSITION:
1. Write the SCENE DESCRIPTION (visual layout, lighting, colors, style, composition, background, objects, mood) strictly in ENGLISH. FLUX produces the highest quality images when the scene is described in English.
2. Write the ON-IMAGE TEXT OVERLAY strictly in ${languageName}: pick ONE short phrase (maximum 3-4 words) in ${languageName}, wrap it in double quotes, and instruct the image AI explicitly in English, for example:
   The text "СПОРТ И ЖИЗНЬ" is written clearly in a bold minimalist font.
   Use correct grammar and alphabet (Cyrillic for Russian/Tajik, Latin for Uzbek/English). Do not mix languages inside the quoted text.
3. Generate HASHTAGS strictly in ${languageName} (each starting with #).

Do NOT write the entire optimizedPrompt in ${languageName}. Only the quoted on-image text and hashtags must be in ${languageName}; the rest of the prompt must stay in English.

${languageExample}`;
}
