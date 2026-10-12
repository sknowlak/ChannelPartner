// node --test tools/i18n   (section 55)
// The masking must survive a provider that rewrites every text node, and
// any damage to placeholders or <Trans> tags must be detected.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mask, unmask, protectedParts, pluralCategories } from './translate.mjs';

// Stand-in provider: rewrites all translatable text, keeps markup.
const fakeTranslate = (html) => html
  .split(/(<span translate="no"[^>]*>[\s\S]*?<\/span>|<[^>]+>)/)
  .map((p) => (p.startsWith('<') ? p : p.replace(/[A-Za-z]{2,}/g, (w) => w.toUpperCase())))
  .join('');

const CASES = [
  '{{field}} is required.',
  'Have the client\'s cURL? <action>Import from cURL</action> to fill this in.',
  'Template with <fieldkey></fieldkey> placeholders (e.g. <example></example>).',
  'Use <strong>{{count}}</strong> of <1>your</1> API keys<br/> now & then',
  'Leadrat sends a JSON webhook to {{url}}'
];

for (const source of CASES) {
  test(`round-trips: ${source}`, () => {
    const { html, tokens } = mask(source);
    const result = unmask(fakeTranslate(html), tokens);
    assert.equal(protectedParts(result), protectedParts(source));
    for (const term of ['Leadrat', 'JSON', 'API', 'cURL']) {
      if (source.includes(term)) assert.ok(result.includes(term), `${term} kept`);
    }
  });
}

test('damaged tags and placeholders are detected', () => {
  assert.notEqual(protectedParts('<ACTION>x</ACTION>'), protectedParts('<action>x</action>'));
  assert.notEqual(protectedParts('{{feld}} fehlt'), protectedParts('{{field}} is required'));
});

test('plural forms follow each language', () => {
  assert.deepEqual(pluralCategories('ja'), ['other']);
  assert.ok(pluralCategories('ar').includes('few') && pluralCategories('ar').includes('zero'));
  assert.deepEqual([...pluralCategories('en')].sort(), ['one', 'other']);
});
