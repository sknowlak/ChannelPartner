const fs = require('fs');
const path = require('path');
const { DEFAULT_LANGUAGE } = require('../config/languages');

// Default texts for notification rules that don't define their own
// (sections 54-55), per recipient language - each recipient gets the
// default in the language they chose in My Profile, so one scheduled job can
// notify a Hindi and an English speaker correctly. A rule's own custom
// title/message is the partner's text and is sent as written. Variables
// ({{status}}, {{customer.name}}, ...) are filled with the stored values
// unchanged.
//
// One file per language: locales/<code>/notifications.json - en, hi and bn
// are reviewed; the rest are produced by tools/i18n/translate.mjs.
const LOCALES_DIR = path.join(__dirname, 'locales');
const TEMPLATES = {};
for (const code of fs.readdirSync(LOCALES_DIR)) {
  const file = path.join(LOCALES_DIR, code, 'notifications.json');
  if (fs.existsSync(file)) TEMPLATES[code] = JSON.parse(fs.readFileSync(file, 'utf8'));
}

function notificationTemplates(language) {
  return TEMPLATES[language] || TEMPLATES[DEFAULT_LANGUAGE];
}

module.exports = { notificationTemplates, NOTIFICATION_TEMPLATES: TEMPLATES };
