// Regenerates src/i18n/locales/en/data.json from the backend's built-in
// partner field definitions (backend/src/config/partnerFieldDefaults.js).
// Only these defaults are translated for display (see src/i18n/dataLabels.js);
// anything an admin adds or renames is shown exactly as stored.
// Usage: node scripts/generate-data-catalogue.mjs
// After running, add the same keys to locales/hi and locales/bn (the
// i18n test fails until every language has them).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { BASE_FIELD_DEFINITIONS } = require(path.join(here, '../../backend/src/config/partnerFieldDefaults.js'));

const catalogue = { fieldLabels: {}, groups: {}, options: {} };
for (const def of BASE_FIELD_DEFINITIONS) {
  catalogue.fieldLabels[def.fieldKey] = def.label;
  catalogue.groups[def.group] = def.group;
  for (const o of def.options || []) catalogue.options[o] = o;
}
// The admin form's default group for new custom fields.
catalogue.groups.Custom = 'Custom';

const out = path.join(here, '../src/i18n/locales/en/data.json');
fs.writeFileSync(out, `${JSON.stringify(catalogue, null, 2)}\n`);
console.log(`Wrote ${out}`);
