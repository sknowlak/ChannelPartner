// Translation coverage check for the mobile app (sections 54-55): every
// namespace under src/i18n/locales/en/ must exist for every language in
// src/i18n/languages.json with the same keys, string values, the same
// {{placeholders}} and no empty values, and be registered in
// src/i18n/resources.js. Plural keys are compared by base: each language
// needs exactly the plural forms it uses (Arabic six, Japanese one).
// Run: npm run test:i18n  (exits 1 on any problem).
const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '..', 'src', 'i18n', 'locales');
const RESOURCES_FILE = path.join(__dirname, '..', 'src', 'i18n', 'resources.js');
const LANGS = require('../src/i18n/languages.json').map((l) => l.code);
const PLURAL = /_(zero|one|two|few|many|other)$/;
const pluralForms = (lang) => {
  try { return new Intl.PluralRules(lang).resolvedOptions().pluralCategories; } catch { return ['one', 'other']; }
};
const BASE = 'en';

const problems = [];
const flatten = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? flatten(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]]));
const placeholders = (s) => (typeof s === 'string' ? [...s.matchAll(/{{\s*([\w.-]+)\s*}}/g)].map((m) => m[1]).sort().join(',') : '');

function load(lang, ns) {
  const file = path.join(LOCALES_DIR, lang, `${ns}.json`);
  if (!fs.existsSync(file)) {
    problems.push(`${lang}/${ns}.json is missing`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    problems.push(`${lang}/${ns}.json is not valid JSON: ${err.message}`);
    return null;
  }
}

const namespaces = fs.readdirSync(path.join(LOCALES_DIR, BASE)).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
const resourcesSrc = fs.readFileSync(RESOURCES_FILE, 'utf8');

for (const ns of namespaces) {
  const base = load(BASE, ns);
  if (!base) continue;
  const baseMap = new Map(flatten(base));
  for (const lang of LANGS) {
    if (!resourcesSrc.includes(`./locales/${lang}/${ns}.json`)) problems.push(`${lang}/${ns}.json is not imported in src/i18n/resources.js`);
    const data = lang === BASE ? base : load(lang, ns);
    if (!data) continue;
    const map = new Map(flatten(data));
    // English source for a key: plural forms compare with en _one / _other.
    const sourceOf = (key) => {
      const m = PLURAL.exec(key);
      if (!m) return baseMap.get(key);
      const base = key.slice(0, -m[0].length);
      return baseMap.get(`${base}_${m[1] === 'one' ? 'one' : 'other'}`) ?? baseMap.get(`${base}_other`);
    };
    for (const [key, value] of map) {
      if (typeof value !== 'string') problems.push(`${lang}/${ns}: "${key}" is not a string`);
      else if (!value.trim()) problems.push(`${lang}/${ns}: "${key}" is empty`);
      const source = sourceOf(key);
      if (source === undefined) problems.push(`${lang}/${ns}: extra key "${key}"`);
      else if (placeholders(value) !== placeholders(source)) {
        problems.push(`${lang}/${ns}: "${key}" placeholders {${placeholders(value)}} differ from en {${placeholders(source)}}`);
      }
    }
    const pluralBases = new Set();
    for (const key of baseMap.keys()) {
      const m = PLURAL.exec(key);
      if (m) pluralBases.add(key.slice(0, -m[0].length));
      else if (!map.has(key)) problems.push(`${lang}/${ns}: missing key "${key}"`);
    }
    for (const base of pluralBases) {
      for (const form of pluralForms(lang)) if (!map.has(`${base}_${form}`)) problems.push(`${lang}/${ns}: missing plural "${base}_${form}"`);
    }
  }
  for (const lang of LANGS) {
    const dir = path.join(LOCALES_DIR, lang);
    for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
      if (f.endsWith('.json') && !namespaces.includes(f.replace(/\.json$/, ''))) problems.push(`${lang}/${f} has no English counterpart`);
    }
  }
}

if (problems.length) {
  console.error([...new Set(problems)].join('\n'));
  console.error(`\n${new Set(problems).size} i18n problem(s) found.`);
  process.exit(1);
}
console.log(`i18n OK: ${namespaces.length} namespaces (${namespaces.join(', ')}) x ${LANGS.length} languages.`);
