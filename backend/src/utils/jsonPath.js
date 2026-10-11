// Reads a value out of an arbitrary JSON document by a simple path - the
// way a partner points at a field in SOMEONE ELSE's payload when mapping an
// integration (section 51): `data.id`, `lead.contact.phone`,
// `field_data.0.values.0` or `field_data[0].values[0]`, `items` for an array.
// No expressions or filters - just keys and array indexes.

function parsePath(path) {
  return String(path || '')
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .map((p) => p.trim())
    .filter(Boolean);
}

const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function getPath(obj, path) {
  const parts = parsePath(path);
  if (parts.length === 0) return obj;
  let current = obj;
  for (const key of parts) {
    if (current === null || current === undefined || BLOCKED_KEYS.has(key)) return undefined;
    current = current[key];
  }
  return current;
}

// Every leaf path in a sample document, for the mapping UI's "pick a field
// from what they sent" dropdown. Arrays contribute their first element only.
function listPaths(obj, prefix = '', out = [], depth = 0) {
  if (depth > 8 || out.length > 300) return out;
  if (Array.isArray(obj)) {
    if (obj.length === 0) out.push({ path: prefix, sample: [] });
    else listPaths(obj[0], prefix ? `${prefix}.0` : '0', out, depth + 1);
    return out;
  }
  if (obj !== null && typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      listPaths(value, prefix ? `${prefix}.${key}` : key, out, depth + 1);
    }
    return out;
  }
  out.push({ path: prefix, sample: obj });
  return out;
}

module.exports = { getPath, parsePath, listPaths };
