// "Paste a client CRM's cURL, map its body keys to our lead fields"
// (section 47). The client's cURL is just an example request filled with
// real data - this turns it into a Custom-format webhook whose body keeps
// the client's exact shape, with each value swapped for a {{placeholder}}
// (or left as a fixed value / null) per the partner's mapping.

// --- cURL parsing -------------------------------------------------------

// Parse errors keep an English message (tests, logs) and carry an
// `i18nKey` (integrations namespace) + params so the page can show them in
// the user's language.
function parseError(message, i18nKey, i18nParams) {
  const err = new Error(message);
  err.i18nKey = i18nKey;
  err.i18nParams = i18nParams;
  return err;
}

// Shell-style tokenizer for the subset of syntax a copied cURL uses:
// single quotes (literal), double quotes (backslash escapes), and
// backslash-newline line continuations.
function tokenize(input) {
  const tokens = [];
  let current = '';
  let inToken = false;
  let i = 0;
  const src = input.replace(/\\\r?\n/g, ' ');
  while (i < src.length) {
    const ch = src[i];
    if (ch === "'") {
      const end = src.indexOf("'", i + 1);
      if (end === -1) throw parseError('Unclosed single quote in cURL command', 'curl.errors.unclosedSingle');
      current += src.slice(i + 1, end);
      inToken = true;
      i = end + 1;
    } else if (ch === '"') {
      i += 1;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\' && i + 1 < src.length && '"\\$`'.includes(src[i + 1])) i += 1;
        current += src[i];
        i += 1;
      }
      if (i >= src.length) throw parseError('Unclosed double quote in cURL command', 'curl.errors.unclosedDouble');
      inToken = true;
      i += 1;
    } else if (/\s/.test(ch)) {
      if (inToken) tokens.push(current);
      current = '';
      inToken = false;
      i += 1;
    } else {
      if (ch === '\\' && i + 1 < src.length) i += 1;
      current += src[i];
      inToken = true;
      i += 1;
    }
  }
  if (inToken) tokens.push(current);
  return tokens;
}

const DATA_FLAGS = ['-d', '--data', '--data-raw', '--data-binary', '--data-ascii', '--json'];
const FLAGS_WITH_VALUE = ['-u', '--user', '-A', '--user-agent', '-e', '--referer', '-b', '--cookie', '-o', '--output', '-m', '--max-time', '--connect-timeout'];

export function parseCurl(input) {
  const tokens = tokenize(String(input || '').trim());
  if (tokens[0] !== 'curl') throw parseError('Paste a command that starts with "curl"', 'curl.errors.notCurl');

  let url = '';
  let method = '';
  const headers = {};
  let body = '';

  for (let i = 1; i < tokens.length; i += 1) {
    const tok = tokens[i];
    const next = () => {
      i += 1;
      if (i >= tokens.length) throw parseError(`Missing value after ${tok}`, 'curl.errors.missingValue', { flag: tok });
      return tokens[i];
    };
    if (tok === '-X' || tok === '--request') method = next().toUpperCase();
    else if (tok === '-H' || tok === '--header') {
      const raw = next();
      const idx = raw.indexOf(':');
      if (idx > 0) headers[raw.slice(0, idx).trim()] = raw.slice(idx + 1).trim();
    } else if (DATA_FLAGS.includes(tok)) {
      if (tok === '--json' && !Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) headers['Content-Type'] = 'application/json';
      body = body ? `${body}&${next()}` : next();
    } else if (tok === '--url') url = next();
    else if (FLAGS_WITH_VALUE.includes(tok)) next();
    else if (!tok.startsWith('-') && !url) url = tok;
  }

  if (!url) throw parseError('No URL found in the cURL command', 'curl.errors.noUrl');
  // The webhook model only supports body-carrying methods.
  if (!['POST', 'PUT', 'PATCH'].includes(method)) method = 'POST';

  let name = 'Client CRM';
  try {
    name = new URL(url).hostname;
  } catch {
    throw parseError(`"${url}" is not a valid URL`, 'curl.errors.invalidUrl', { url });
  }

  return { name, url, method, headers, body };
}

// --- Body <-> mapping rows ---------------------------------------------

const PLACEHOLDER_RE = /^\{\{\s*([\w.]+)\s*\}\}$/;

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// One row per leaf key (nested objects are walked, arrays are leaves).
// A row is { path: ['a','b'], kind: 'FIELD'|'NULL'|'FIXED', field, value }.
export function rowsFromBody(body) {
  const rows = [];
  const walk = (obj, prefix) => {
    for (const [key, value] of Object.entries(obj)) {
      const path = [...prefix, key];
      if (isPlainObject(value) && Object.keys(value).length > 0) walk(value, path);
      else if (value === null) rows.push({ path, kind: 'NULL' });
      else if (typeof value === 'string' && PLACEHOLDER_RE.test(value)) rows.push({ path, kind: 'FIELD', field: value.match(PLACEHOLDER_RE)[1] });
      else rows.push({ path, kind: 'FIXED', value });
    }
  };
  walk(body, []);
  return rows;
}

export function bodyFromRows(templateBody, rows) {
  const out = JSON.parse(JSON.stringify(templateBody));
  for (const row of rows) {
    let target = out;
    for (const key of row.path.slice(0, -1)) target = target[key];
    const leaf = row.path[row.path.length - 1];
    if (row.kind === 'FIELD') target[leaf] = `{{${row.field}}}`;
    else if (row.kind === 'NULL') target[leaf] = null;
    else target[leaf] = row.value;
  }
  return out;
}

// Returns the template as a JSON object if it is one (placeholders are
// written inside quotes, so a mapped template is still valid JSON), else null.
export function parseTemplateObject(template) {
  try {
    const parsed = JSON.parse(template);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// --- Auto-suggest -------------------------------------------------------

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

// Common client-CRM key names that don't literally match our field key or
// label. Keys are normalized (lowercase, alphanumeric only).
const SYNONYMS = {
  name: 'customer.name',
  fullname: 'customer.name',
  leadname: 'customer.name',
  customername: 'customer.name',
  mobile: 'customer.mobile',
  phone: 'customer.mobile',
  phonenumber: 'customer.mobile',
  mobilenumber: 'customer.mobile',
  contactno: 'customer.mobile',
  contactnumber: 'customer.mobile',
  alternatecontactno: 'customer.alternateMobile',
  alternatephone: 'customer.alternateMobile',
  alternatemobile: 'customer.alternateMobile',
  email: 'customer.email',
  emailid: 'customer.email',
  countrycode: 'customer.countryCode',
  location: 'preferredLocation',
  budget: 'budgetMax',
  maxbudget: 'budgetMax',
  leadexpectedbudget: 'budgetMin',
  minbudget: 'budgetMin',
  notes: 'notes',
  remarks: 'notes',
  comments: 'notes',
  project: 'projectId',
  projectname: 'projectId',
  property: 'customFields.propertyNames',
  propertyname: 'customFields.propertyNames',
  bhk: 'bhk',
  bhktype: 'bhk',
  subsource: 'customFields.subSource',
  primaryuser: 'customFields.primaryOwner',
  secondaryuser: 'customFields.secondaryOwner',
  campaignname: 'customFields.campaignNames',
  agencyname: 'customFields.agencyNames',
  channelpartnername: 'partner.name',
  channelpartnermobile: 'partner.mobile',
  channelpartneremail: 'partner.email',
  referenceid: 'registrationId',
  refrenceno: 'registrationId',
  referenceno: 'registrationId',
  externalid: 'registrationId'
};

// Picks a field for a client key: synonym table first, then an exact
// (normalized) match on the field path's last segment or its label.
export function suggestField(key, fieldOptions) {
  const k = norm(key);
  const known = new Set(fieldOptions.map((f) => f.path));
  if (SYNONYMS[k] && known.has(SYNONYMS[k])) return SYNONYMS[k];
  const hit = fieldOptions.find((f) => norm(f.path.split('.').pop()) === k)
    || fieldOptions.find((f) => norm(f.label) === k);
  return hit ? hit.path : null;
}

// Builds the starting mapping for a freshly pasted cURL body. Only keys
// whose example value is a string or null are auto-mapped - numbers,
// booleans, GUIDs-that-don't-match-a-field etc. are usually the client's
// own constants (e.g. Leadrat's "LeadSource": 41) and stay fixed.
export function suggestRows(body, fieldOptions) {
  return rowsFromBody(body).map((row) => {
    if (row.kind === 'FIELD') return row;
    const original = row.kind === 'NULL' ? null : row.value;
    const field = (original === null || typeof original === 'string') ? suggestField(row.path[row.path.length - 1], fieldOptions) : null;
    if (field) return { path: row.path, kind: 'FIELD', field };
    // Unmatched keys keep the example's value as a fixed value - it may be a
    // real client constant (an account ID, a source code), so it's left for
    // the partner to review rather than silently dropped.
    return row;
  });
}
