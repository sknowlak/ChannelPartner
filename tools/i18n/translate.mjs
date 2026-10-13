#!/usr/bin/env node
// Build-time machine translation of the UI (spec section 55).
//
//   node tools/i18n/translate.mjs --provider google --langs all --max 10
//   node tools/i18n/translate.mjs --provider azure  --langs ta,te,mr
//   node tools/i18n/translate.mjs --provider google --list          (show available languages)
//   node tools/i18n/translate.mjs --provider mock   --langs ta --dry-run
//   node tools/i18n/translate.mjs --provider google-free --langs all   (no key; unofficial endpoint)
//
// Reads the English JSON of every app (frontend, admin, mobile, backend
// notification texts), sends ONLY UI text to the chosen provider (never
// customer data - there is none in these files), and writes
// locales/<lang>/<namespace>.json for each app, then regenerates the
// language manifests the apps read their language list from.
//
// Safe to re-run:
// - "reviewed" languages (manifest quality: reviewed - en, hi, bn today) are
//   never machine-written;
// - a machine translation someone edited by hand is kept (the cache records
//   what the machine produced; a different value in the file = a human edit);
// - only keys that are new, or whose English changed, are sent again.
// {{placeholders}}, <0>..</0> markup, and product/technical terms are
// protected; a result that loses or alters any of them is replaced by the
// English text for that key and reported, so nothing breaks at runtime.
//
// Keys come from tools/i18n/.env (gitignored) or the environment:
//   GOOGLE_TRANSLATE_API_KEY                     (Google Cloud Translation v2)
//   AZURE_TRANSLATOR_KEY + AZURE_TRANSLATOR_REGION (Azure AI Translator v3)
//   DEEPL_API_KEY                                (DeepL; ~30 languages only)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOL_DIR, '../..');
const MASTER_MANIFEST = path.join(TOOL_DIR, 'languages.json');
const CACHE_DIR = path.join(TOOL_DIR, 'cache');

const APPS = {
  frontend: { locales: 'frontend/src/i18n/locales', manifest: 'frontend/src/i18n/languages.json' },
  admin: { locales: 'admin/src/i18n/locales', manifest: 'admin/src/i18n/languages.json' },
  mobile: { locales: 'mobile/src/i18n/locales', manifest: 'mobile/src/i18n/languages.json', resources: 'mobile/src/i18n/resources.js' },
  backend: { locales: 'backend/src/i18n/locales', manifest: 'backend/src/config/languages.json' }
};

// Never translated: product names and technical tokens users know in English.
const TERMS = [
  'Leadrat', 'OAuth 2.0', 'OAuth', 'HMAC', 'SHA-256', 'SHA-1', 'SHA-512', 'Base64', 'API', 'URL', 'URLs', 'JSON', 'cURL',
  'CSV', 'HTTPS', 'HTTP', 'BHK', 'UTM', 'CRM', 'CRMs', 'Webhook', 'Webhooks', 'webhook', 'webhooks', 'ID', 'IDs', 'SMS',
  'WhatsApp', 'Zapier', 'n8n', 'Postman', 'Facebook', 'Meta', 'Google', 'Azure', 'DeepL', 'OpenAPI', 'REST', 'GET', 'POST',
  'PUT', 'PATCH', 'DELETE', 'UTC', 'IST', 'KYC', 'PAN', 'GSTIN', 'RERA', 'IFSC',
  'LinkedIn Ads', 'LinkedIn', 'Lead Gen Forms Manager', 'Lead Gen Forms', 'Lead Gen Form', 'Conversions API', 'Campaign Manager',
  'Content Admin'
];
const RTL = new Set(['ar', 'he', 'iw', 'fa', 'ur', 'ps', 'sd', 'ug', 'yi', 'dv', 'ckb', 'ku-Arab', 'pa-Arab', 'ks', 'syr', 'prs']);
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

// ---------------------------------------------------------------- args/env
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
  return acc;
}, []));

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnvFile(path.join(TOOL_DIR, '.env'));

// ---------------------------------------------------------------- helpers
// The cache keeps short hashes, not text: [hash(English source), hash(machine
// output)] per key - enough to spot changed English and human edits, at a
// fraction of the size (249 languages x ~1,750 keys). Old {src, mt} entries
// are still understood.
const digest = (s) => (s === undefined ? undefined : crypto.createHash('sha1').update(String(s)).digest('base64url').slice(0, 10));
const cacheEntry = (c) => (Array.isArray(c) ? c : c && [digest(c.src), digest(c.mt)]);
const readJson = (f, fallback) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : fallback);
const writeJson = (f, data) => {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, `${JSON.stringify(data, null, 2)}\n`);
};
const SEP = '\u0001';

function flatten(obj, prefix = [], out = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') flatten(v, [...prefix, k], out);
    else out.set([...prefix, k].join(SEP), v);
  }
  return out;
}
function unflatten(map) {
  const out = {};
  for (const [key, value] of map) {
    const parts = key.split(SEP);
    let node = out;
    parts.slice(0, -1).forEach((p) => { node = node[p] ||= {}; });
    node[parts[parts.length - 1]] = value;
  }
  return out;
}
const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function decodeHtml(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&');
}

// Turns one English string into provider HTML in which everything that must
// survive untouched is wrapped as translate="no", and <Trans> markup -
// numbered (<0>…</0>) or named (<action>…</action>) - becomes real elements
// the provider keeps in place. Empty or self-closing tags (<fieldkey></fieldkey>,
// <br/>) are protected whole, since providers may drop empty elements.
const termPattern = TERMS.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length).join('|');
const TOKEN = new RegExp(`(\\{\\{[^}]+\\}\\}|\\$t\\([^)]*\\)|<([A-Za-z0-9]+)><\\/\\2>|<[A-Za-z0-9]+\\s*/>|<\\/?[A-Za-z0-9]+>|(?<![\\w-])(?:${termPattern})(?![\\w-]))`, 'g');

function mask(text) {
  const tokens = [];
  let html = '';
  let last = 0;
  // Only a matched <x>…</x> pair is markup; a lone "<token>" is literal text.
  const matches = [...text.matchAll(TOKEN)];
  const paired = new Set();
  const openAt = [];
  matches.forEach((m, i) => {
    const o = /^<([A-Za-z0-9]+)>$/.exec(m[0]);
    const c = /^<\/([A-Za-z0-9]+)>$/.exec(m[0]);
    if (o) openAt.push([o[1], i]);
    else if (c) {
      const j = openAt.findLastIndex(([n]) => n === c[1]);
      if (j >= 0) { paired.add(openAt[j][1]).add(i); openAt.splice(j); }
    }
  });
  for (const [i, m] of matches.entries()) {
    html += escapeHtml(text.slice(last, m.index));
    const tok = m[0];
    const open = paired.has(i) && /^<([A-Za-z0-9]+)>$/.exec(tok);
    const close = paired.has(i) && /^<\/([A-Za-z0-9]+)>$/.exec(tok);
    if (open) html += `<b data-k="${open[1]}">`;
    else if (close) html += '</b>';
    else {
      tokens.push(tok);
      html += `<span translate="no" class="notranslate" data-p="${tokens.length - 1}">${escapeHtml(tok)}</span>`;
    }
    last = m.index + tok.length;
  }
  html += escapeHtml(text.slice(last));
  return { html, tokens };
}

function unmask(html, tokens) {
  let s = html.replace(/<span[^>]*data-p="(\d+)"[^>]*>[\s\S]*?<\/span>/g, (_, n) => `\u0002${n}\u0003`);
  const stack = [];
  s = s.replace(/<b[^>]*data-k="([A-Za-z0-9]+)"[^>]*>|<\/b>/g, (m, n) => {
    if (n !== undefined) { stack.push(n); return `\u0004${n}\u0005`; }
    return `\u0006${stack.pop() ?? ''}\u0005`;
  });
  s = decodeHtml(s.replace(/<[^>]+>/g, ''));
  return s
    .replace(/\u0002(\d+)\u0003/g, (_, n) => tokens[Number(n)] ?? '')
    .replace(/\u0004([A-Za-z0-9]+)\u0005/g, '<$1>')
    .replace(/\u0006([A-Za-z0-9]*)\u0005/g, '</$1>')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

const protectedParts = (s) => [...String(s).matchAll(/\{\{[^}]+\}\}|<\/?[A-Za-z0-9]+\s*\/?>/g)].map((m) => m[0].replace(/\s+/g, '')).sort().join('|');

// ---------------------------------------------------------------- providers
async function http(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  if (!res.ok) throw new Error(`${options?.method || 'GET'} ${url.replace(/key=[^&]+/, 'key=***')} -> HTTP ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}
const chunk = (items, size, maxChars) => {
  const out = [];
  let cur = [];
  let chars = 0;
  for (const it of items) {
    if (cur.length && (cur.length >= size || chars + it.length > maxChars)) { out.push(cur); cur = []; chars = 0; }
    cur.push(it);
    chars += it.length;
  }
  if (cur.length) out.push(cur);
  return out;
};
const normalizeCode = (c) => ({ iw: 'he', jw: 'jv', 'zh': 'zh-CN' }[c] || c);

const PROVIDERS = {
  google: () => {
    const key = process.env.GOOGLE_TRANSLATE_API_KEY;
    if (!key) throw new Error('Set GOOGLE_TRANSLATE_API_KEY in tools/i18n/.env');
    const base = 'https://translation.googleapis.com/language/translate/v2';
    return {
      async languages() {
        const d = await http(`${base}/languages?key=${key}&target=en`);
        return d.data.languages.map((l) => ({ code: normalizeCode(l.language), englishName: l.name, providerCode: l.language }));
      },
      async translate(htmls, lang) {
        const out = [];
        for (const batch of chunk(htmls, 100, 25000)) {
          const d = await http(`${base}?key=${key}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ q: batch, source: 'en', target: lang.providerCode, format: 'html' })
          });
          out.push(...d.data.translations.map((t) => t.translatedText));
        }
        return out;
      }
    };
  },
  azure: () => {
    const key = process.env.AZURE_TRANSLATOR_KEY;
    const region = process.env.AZURE_TRANSLATOR_REGION;
    if (!key) throw new Error('Set AZURE_TRANSLATOR_KEY (and AZURE_TRANSLATOR_REGION) in tools/i18n/.env');
    const base = 'https://api.cognitive.microsofttranslator.com';
    return {
      async languages() {
        const d = await http(`${base}/languages?api-version=3.0&scope=translation`, { headers: { 'Accept-Language': 'en' } });
        return Object.entries(d.translation).map(([code, l]) => ({ code: normalizeCode(code), englishName: l.name, nativeName: l.nativeName, dir: l.dir, providerCode: code }));
      },
      async translate(htmls, lang) {
        const out = [];
        for (const batch of chunk(htmls, 100, 40000)) {
          const d = await http(`${base}/translate?api-version=3.0&from=en&to=${encodeURIComponent(lang.providerCode)}&textType=html`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Ocp-Apim-Subscription-Key': key, ...(region ? { 'Ocp-Apim-Subscription-Region': region } : {}) },
            body: JSON.stringify(batch.map((Text) => ({ Text })))
          });
          out.push(...d.map((r) => r.translations[0].text));
        }
        return out;
      }
    };
  },
  deepl: () => {
    const key = process.env.DEEPL_API_KEY;
    if (!key) throw new Error('Set DEEPL_API_KEY in tools/i18n/.env');
    const base = key.endsWith(':fx') ? 'https://api-free.deepl.com/v2' : 'https://api.deepl.com/v2';
    const headers = { Authorization: `DeepL-Auth-Key ${key}`, 'Content-Type': 'application/json' };
    return {
      async languages() {
        const d = await http(`${base}/languages?type=target`, { headers });
        return d.map((l) => ({ code: normalizeCode(l.language.toLowerCase().replace(/-(\w+)$/, (_, r) => `-${r.toUpperCase()}`)), englishName: l.name, providerCode: l.language }));
      },
      async translate(htmls, lang) {
        const out = [];
        for (const batch of chunk(htmls, 50, 100000)) {
          const d = await http(`${base}/translate`, {
            method: 'POST', headers,
            body: JSON.stringify({ text: batch, source_lang: 'EN', target_lang: lang.providerCode, tag_handling: 'html', ignore_tags: ['span'] })
          });
          out.push(...d.translations.map((t) => t.text));
        }
        return out;
      }
    };
  },
  // Keyless: the public endpoint translate.google.com's own pages use. Same
  // engine as the paid API, but unofficial and rate-limited - fine for
  // build-time generation, slower (small batches, pauses, retries).
  'google-free': () => {
    const base = 'https://translate.googleapis.com/translate_a';
    const pause = (ms) => new Promise((r) => setTimeout(r, ms));
    async function call(batch, lang) {
      const body = new URLSearchParams();
      for (const q of batch) body.append('q', q);
      for (let attempt = 1; ; attempt++) {
        try {
          const d = await http(`${base}/t?client=gtx&sl=en&tl=${encodeURIComponent(lang.providerCode)}&format=html`, {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body
          });
          const out = d.map((r) => (Array.isArray(r) ? r[0] : r));
          if (out.length !== batch.length) throw new Error(`expected ${batch.length} results, got ${out.length}`);
          return out;
        } catch (err) {
          if (attempt >= 6) throw err;
          await pause(2000 * 2 ** attempt);
        }
      }
    }
    return {
      async languages() {
        const d = await http(`${base}/l?client=gtx&hl=en`);
        return Object.entries(d.tl).map(([code, englishName]) => ({ code: normalizeCode(code), englishName, providerCode: code }));
      },
      async translate(htmls, lang) {
        const out = [];
        for (const batch of chunk(htmls, 60, 4000)) {
          out.push(...await call(batch, lang));
          await pause(250);
        }
        return out;
      }
    };
  },
  // Offline stand-in for testing this script: "translates" by marking each
  // translatable word, keeping all protected parts and markup.
  mock: () => ({
    async languages() {
      return [['ta', 'Tamil'], ['ar', 'Arabic'], ['ja', 'Japanese'], ['ru', 'Russian']].map(([code, englishName]) => ({ code, englishName, providerCode: code }));
    },
    async translate(htmls, lang) {
      // Mark words in every text node, but never inside translate="no" spans.
      return htmls.map((h) => h.split(/(<span translate="no"[^>]*>[\s\S]*?<\/span>|<[^>]+>)/).map((part) => (
        part.startsWith('<') ? part : part.replace(/\b([A-Za-z]{2,})\b/g, `${lang.code}·$1`)
      )).join(''));
    }
  })
};

// ---------------------------------------------------------------- core
function pluralCategories(code) {
  try {
    return new Intl.PluralRules(code).resolvedOptions().pluralCategories;
  } catch {
    return ['one', 'other'];
  }
}

// Which English strings need (re)translating for one app + language.
function plan(app, lang) {
  const enDir = path.join(ROOT, APPS[app].locales, 'en');
  const cacheFile = path.join(CACHE_DIR, app, `${lang.code}.json`);
  const cache = readJson(cacheFile, {});
  const work = [];
  const files = {};
  for (const file of fs.readdirSync(enDir).filter((f) => f.endsWith('.json'))) {
    const ns = file.replace(/\.json$/, '');
    const en = flatten(readJson(path.join(enDir, file)));
    const target = flatten(readJson(path.join(ROOT, APPS[app].locales, lang.code, file), {}));
    const nsCache = Object.fromEntries(Object.entries(cache[ns] || {}).map(([k, c]) => [k, cacheEntry(c)]));
    files[ns] = { en, target, nsCache };
    const seen = new Set();
    for (const [key, source] of en) {
      if (typeof source !== 'string') continue;
      const base = key.replace(PLURAL_SUFFIX, '');
      const isPlural = PLURAL_SUFFIX.test(key);
      // Keys as they will exist in the target (plural categories differ by language).
      const targetKeys = isPlural ? pluralCategories(lang.code).map((c) => `${base}_${c}`) : [key];
      if (isPlural && seen.has(base)) continue;
      seen.add(base);
      const sourcesNeeded = isPlural ? [`${base}_one`, `${base}_other`].filter((k) => en.has(k)) : [key];
      for (const srcKey of sourcesNeeded) {
        const cached = cacheEntry(nsCache[srcKey]);
        // The target key that holds this source's translation (for plurals in
        // languages without a "one" form, _one has no target key of its own).
        const current = target.get(srcKey) ?? (srcKey.endsWith('_other') ? target.get(targetKeys.find((k) => target.has(k)) || '') : undefined);
        if (cached) {
          if (cached[1] !== null && current !== undefined && digest(current) !== cached[1]) continue; // edited by a person - keep
          // English unchanged - skip, unless it was kept in English last time
          // (placeholders damaged; cached as null), so the next run retries it.
          if (cached[0] === digest(en.get(srcKey)) && cached[1] !== null && !args.retranslate) continue;
        } else if (current !== undefined && !args.retranslate) {
          continue; // existing text not produced by this tool - keep
        }
        work.push({ ns, key: srcKey, source: en.get(srcKey) });
      }
    }
  }
  return { files, work, cache, cacheFile };
}

function write(app, lang, files, translated, failed, cache, cacheFile) {
  const cats = pluralCategories(lang.code);
  for (const [ns, { en, target, nsCache }] of Object.entries(files)) {
    const out = new Map();
    const value = (k) => translated.get(`${ns}${SEP}${k}`) ?? target.get(k);
    for (const [key, source] of en) {
      if (typeof source !== 'string') { out.set(key, source); continue; }
      if (PLURAL_SUFFIX.test(key)) {
        const base = key.replace(PLURAL_SUFFIX, '');
        if (out.has(`${base}_other`)) continue;
        const one = value(`${base}_one`) ?? en.get(`${base}_one`) ?? en.get(`${base}_other`);
        const other = value(`${base}_other`) ?? en.get(`${base}_other`);
        for (const c of cats) out.set(`${base}_${c}`, c === 'one' ? one : other);
        continue;
      }
      out.set(key, value(key) ?? source);
    }
    for (const [k, mt] of translated) {
      const [tns, ...rest] = k.split(SEP);
      if (tns === ns) nsCache[rest.join(SEP)] = [digest(en.get(rest.join(SEP))), failed.has(k) ? null : digest(mt)];
    }
    cache[ns] = nsCache;
    if (!args['dry-run']) writeJson(path.join(ROOT, APPS[app].locales, lang.code, `${ns}.json`), unflatten(out));
  }
  if (!args['dry-run']) {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, `${JSON.stringify(cache)}
`);
  }
}

function languageEntry(lang) {
  let name = lang.nativeName;
  if (!name) {
    try { name = new Intl.DisplayNames([lang.code], { type: 'language' }).of(lang.code); } catch { /* unknown to ICU */ }
  }
  if (!name || name === lang.code) name = lang.englishName;
  let dir = lang.dir;
  if (!dir) {
    try { dir = new Intl.Locale(lang.code).getTextInfo?.().direction || new Intl.Locale(lang.code).textInfo?.direction; } catch { /* ignore */ }
  }
  if (!dir) dir = RTL.has(lang.code.split('-')[0]) ? 'rtl' : 'ltr';
  return { code: lang.code, name: name.charAt(0).toLocaleUpperCase(lang.code) + name.slice(1), englishName: lang.englishName, intl: lang.code, dir, quality: 'machine' };
}

// A language is listed only when EVERY app has all its files - so the
// dropdown never offers a language some screen can't show.
function writeManifests(master) {
  const complete = master.filter((l) => l.quality === 'reviewed' || Object.values(APPS).every((a) => {
    const enDir = path.join(ROOT, a.locales, 'en');
    return fs.readdirSync(enDir).every((f) => fs.existsSync(path.join(ROOT, a.locales, l.code, f)));
  }));
  writeJson(MASTER_MANIFEST, master);
  for (const a of Object.values(APPS)) writeJson(path.join(ROOT, a.manifest), complete);
  // Metro can't discover files at runtime: regenerate the mobile import list.
  const mob = APPS.mobile;
  const nss = fs.readdirSync(path.join(ROOT, mob.locales, 'en')).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', ''));
  const ident = (code, ns) => `${code.replace(/[^A-Za-z0-9]/g, '_')}_${ns}`;
  const lines = [
    '// GENERATED by tools/i18n/translate.mjs - do not edit by hand.',
    '// Metro has no import.meta.glob, so every language/namespace file is',
    '// required statically (bundled with the app). File name = namespace.'
  ];
  for (const l of complete) for (const ns of nss) lines.push(`import ${ident(l.code, ns)} from './locales/${l.code}/${ns}.json';`);
  lines.push('', 'export const resources = {');
  for (const l of complete) lines.push(`  '${l.code}': { ${nss.map((ns) => `${ns}: ${ident(l.code, ns)}`).join(', ')} },`);
  lines.push('};', '', `export const NAMESPACES = ${JSON.stringify(nss)};`, '');
  fs.writeFileSync(path.join(ROOT, mob.resources), lines.join('\n'));
  return complete;
}

// ---------------------------------------------------------------- main
async function main() {
  const master = readJson(MASTER_MANIFEST, []);
  // --remove ta,te : withdraw machine-translated languages (files, cache and
  // manifest entries). Reviewed languages can't be removed this way.
  if (args.remove) {
    const codes = String(args.remove).split(',').filter(Boolean);
    const blocked = codes.filter((c) => master.find((l) => l.code === c)?.quality === 'reviewed' || c === 'en');
    if (blocked.length) throw new Error(`Refusing to remove reviewed language(s): ${blocked.join(', ')}`);
    for (const code of codes) {
      for (const [app, a] of Object.entries(APPS)) {
        fs.rmSync(path.join(ROOT, a.locales, code), { recursive: true, force: true });
        fs.rmSync(path.join(CACHE_DIR, app, `${code}.json`), { force: true });
      }
    }
    const remaining = master.filter((l) => !codes.includes(l.code));
    const complete = writeManifests(remaining);
    console.log(`Removed ${codes.join(', ')}. Languages offered: ${complete.map((l) => l.code).join(', ')}`);
    return;
  }
  if (args['manifest-only']) {
    const complete = writeManifests(master);
    console.log(`Manifests written: ${complete.map((l) => l.code).join(', ')}`);
    return;
  }
  const provider = PROVIDERS[args.provider || 'google']?.();
  if (!provider) throw new Error(`Unknown --provider ${args.provider}. Use google, google-free, azure, deepl or mock.`);
  const available = await provider.languages();
  if (args.list) {
    console.log(available.map((l) => `${l.code}\t${l.englishName}`).join('\n'));
    console.log(`\n${available.length} languages available.`);
    return;
  }

  const reviewed = new Set(master.filter((l) => l.quality === 'reviewed').map((l) => l.code));
  const wanted = args.langs === 'all' || !args.langs ? available : available.filter((l) => String(args.langs).split(',').includes(l.code));
  let queue = wanted.filter((l) => l.code !== 'en' && !reviewed.has(l.code));
  if (args.max) {
    const done = new Set(master.filter((l) => l.quality === 'machine').map((l) => l.code));
    queue = queue.filter((l) => !done.has(l.code) || args.update).slice(0, Number(args.max));
  }
  if (!queue.length) { console.log('Nothing to translate.'); return; }

  for (const lang of queue) {
    const problems = [];
    let sent = 0;
    for (const app of Object.keys(APPS)) {
      const { files, work, cache, cacheFile } = plan(app, lang);
      const translated = new Map();
      const failed = new Set();
      if (work.length) {
        const masked = work.map((w) => mask(w.source));
        const out = await provider.translate(masked.map((m) => m.html), lang);
        out.forEach((html, i) => {
          const result = unmask(html, masked[i].tokens);
          const ok = result && protectedParts(result) === protectedParts(work[i].source);
          if (!ok) failed.add(`${work[i].ns}${SEP}${work[i].key}`);
          if (!ok) problems.push(`${app}:${work[i].ns}:${work[i].key.split(SEP).join('.')}`);
          translated.set(`${work[i].ns}${SEP}${work[i].key}`, ok ? result : work[i].source);
        });
        sent += work.length;
      }
      write(app, lang, files, translated, failed, cache, cacheFile);
    }
    const entry = languageEntry(lang);
    const idx = master.findIndex((l) => l.code === lang.code);
    if (idx >= 0) master[idx] = { ...master[idx], ...entry, quality: master[idx].quality }; else master.push(entry);
    console.log(`${lang.code} (${lang.englishName}): ${sent} string(s) translated${problems.length ? `, ${problems.length} kept in English (placeholders/markup changed): ${problems.slice(0, 5).join(', ')}${problems.length > 5 ? ' ...' : ''}` : ''}`);
  }
  if (!args['dry-run']) {
    const complete = writeManifests(master);
    console.log(`\nLanguages offered in the apps (${complete.length}): ${complete.map((l) => l.code).join(', ')}`);
  }
}

// Run only when invoked as a script (the tests import the helpers below).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}

export { mask, unmask, protectedParts, flatten, unflatten, pluralCategories };
