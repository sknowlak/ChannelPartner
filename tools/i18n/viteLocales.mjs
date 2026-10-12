// Vite plugin shared by frontend/ and admin/ (section 55).
//
// With 200+ languages, bundling every locale JSON as a JS chunk makes builds
// take minutes (one chunk per language x namespace). Instead the non-English
// files are copied to dist/locales/<lang>/<ns>.json as plain assets and
// fetched at runtime only for the language in use; English stays bundled as
// the always-present fallback. In dev the same URLs are served straight from
// src/i18n/locales. __I18N_VERSION__ (a content hash) busts caches when any
// translation changes.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const SAFE = /^[A-Za-z0-9-]+\/[A-Za-z0-9_-]+\.json$/;

export default function i18nLocales({ dir, base = 'locales' }) {
  const list = () => fs.readdirSync(dir)
    .filter((lang) => lang !== 'en' && fs.statSync(path.join(dir, lang)).isDirectory())
    .flatMap((lang) => fs.readdirSync(path.join(dir, lang)).filter((f) => f.endsWith('.json')).map((f) => `${lang}/${f}`))
    .sort();
  let version = 'dev';

  return {
    name: 'i18n-locales',
    config(_, { command }) {
      if (command === 'build') {
        const hash = crypto.createHash('sha1');
        for (const rel of list()) hash.update(rel).update(fs.readFileSync(path.join(dir, rel)));
        version = hash.digest('hex').slice(0, 10);
      }
      return { define: { __I18N_VERSION__: JSON.stringify(version) } };
    },
    configureServer(server) {
      server.middlewares.use(`/${base}/`, (req, res, next) => {
        const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
        const file = path.join(dir, rel);
        if (!SAFE.test(rel) || rel.startsWith('en/') || !fs.existsSync(file)) return next();
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(fs.readFileSync(file));
      });
    },
    generateBundle() {
      for (const rel of list()) {
        const source = JSON.stringify(JSON.parse(fs.readFileSync(path.join(dir, rel), 'utf8')));
        this.emitFile({ type: 'asset', fileName: `${base}/${rel}`, source });
      }
    }
  };
}
