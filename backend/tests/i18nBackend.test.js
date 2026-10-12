// Section 54: the backend stays language-neutral except for the default
// notification texts, which follow each recipient's language.
const { SUPPORTED_LANGUAGES, isSupportedLanguage } = require('../src/config/languages');
const { notificationTemplates, NOTIFICATION_TEMPLATES } = require('../src/i18n/notificationTemplates');
const { renderTemplate } = require('../src/services/webhookService');

const vars = (s) => [...s.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]).sort();

describe('supported languages', () => {
  test('the generated manifest decides; reviewed languages always present', () => {
    expect(SUPPORTED_LANGUAGES).toEqual(expect.arrayContaining(['en', 'hi', 'bn']));
    expect(isSupportedLanguage('hi')).toBe(true);
    expect(isSupportedLanguage('xx-not-a-language')).toBe(false);
    expect(isSupportedLanguage({ $ne: null })).toBe(false);
  });

  test('every supported language has notification texts', () => {
    for (const lang of SUPPORTED_LANGUAGES) expect(NOTIFICATION_TEMPLATES[lang]).toBeDefined();
  });
});

describe('notification default texts', () => {
  test('every language uses exactly the same variables as English', () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      for (const part of ['title', 'message']) {
        expect(vars(NOTIFICATION_TEMPLATES[lang][part])).toEqual(vars(NOTIFICATION_TEMPLATES.en[part]));
      }
    }
  });

  test('unknown or missing language falls back to English', () => {
    expect(notificationTemplates('xx')).toBe(NOTIFICATION_TEMPLATES.en);
    expect(notificationTemplates('')).toBe(NOTIFICATION_TEMPLATES.en);
  });

  test('stored values are inserted unchanged in every language', () => {
    const payload = { registrationId: 'REG-1', status: 'Site Visit', subStatus: '', customer: { name: 'Riya', mobile: '+919800000000' } };
    for (const lang of SUPPORTED_LANGUAGES) {
      const text = renderTemplate(notificationTemplates(lang).message, payload);
      expect(text).toContain('REG-1');
      expect(text).toContain('Site Visit');
      expect(text).toContain('+919800000000');
    }
    expect(renderTemplate(notificationTemplates('hi').message, payload)).toMatch(/लीड/);
  });
});
