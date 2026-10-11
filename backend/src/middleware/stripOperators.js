// Removes any key starting with "$" (and prototype-polluting keys) from req.body,
// req.query and req.params before a controller sees them.
//
// Several handlers pass request values straight into Mongo filters
// ({ email }, { projectId }, { status }). Without this, a JSON body like
// {"email":{"$regex":"^a"}} or a query string like ?status[$ne]=x becomes a
// query OPERATOR instead of a value - letting an unauthenticated caller
// enumerate customer emails through /duplicate-check, for example.
// Stripping at the edge covers every route at once, including ones added
// later; the few places that build operators themselves do so in code.
function clean(value, depth = 0) {
  if (depth > 20 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => clean(v, depth + 1));
  for (const key of Object.keys(value)) {
    if (key.startsWith('$') || key === '__proto__' || key === 'constructor' || key === 'prototype') {
      delete value[key];
    } else {
      value[key] = clean(value[key], depth + 1);
    }
  }
  return value;
}

function stripOperators(req, res, next) {
  clean(req.body);
  clean(req.query);
  clean(req.params);
  next();
}

module.exports = stripOperators;
module.exports.clean = clean;
