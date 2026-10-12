// Lists user-visible English left hard-coded in JSX (section 54): text
// between tags and the placeholder / title / aria-label / alt attributes.
// Usage: node scripts/find-untranslated.mjs [dir ...]   (exit 1 if any found)
//
// Heuristic, tuned to avoid false positives: needs at least two letters,
// ignores {expressions}, code-like tokens (IDs, URLs, {{placeholders}}),
// symbols-only text, and any line containing "i18n-ignore".
import fs from 'node:fs';
import path from 'node:path';

const roots = process.argv.slice(2).length ? process.argv.slice(2) : ['src'];
const SKIP_DIRS = new Set(['node_modules', 'locales', 'dist']);
const ATTRS = /\b(placeholder|title|aria-label|alt|label)="([^"{}]*[A-Za-z]{2,}[^"{}]*)"/g;
const TEXT = />([^<>{}]*[A-Za-z]{2,}[^<>{}]*)</g;
const CODE_LIKE = /^[\s\w./:@#$%&*+=?-]*(\{\{|https?:|curl |lr_|REG-|BOOK-|=>)/;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.jsx$/.test(entry.name)) out.push(full);
  }
  return out;
}

const findings = [];
for (const root of roots) {
  const targets = fs.statSync(root).isDirectory() ? walk(root) : [root];
  for (const file of targets) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (line.includes('i18n-ignore') || /^\s*(\/\/|\*|\/\*)/.test(line)) return;
      for (const re of [TEXT, ATTRS]) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(line))) {
          const text = (re === ATTRS ? m[2] : m[1]).trim();
          if (!text || CODE_LIKE.test(text) || /^[^A-Za-z]*$/.test(text)) continue;
          // Arrow functions / comparisons inside JSX braces split across "<" and ">".
          if (/[=&|()]/.test(text) && !/\s[a-z]+\s/i.test(text.replace(/[=&|()]/g, ' '))) continue;
          findings.push(`${file}:${i + 1}: ${text.slice(0, 80)}`);
        }
      }
    });
  }
}

if (findings.length) {
  console.log(findings.join('\n'));
  console.log(`\n${findings.length} possibly untranslated string(s).`);
  process.exitCode = 1;
} else {
  console.log('No hard-coded UI strings found.');
}
