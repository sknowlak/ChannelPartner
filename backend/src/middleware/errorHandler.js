// Unexpected errors (500s) are logged in full on the server but reach the
// client only as a generic message - raw Mongo/cast/stack text can reveal
// collection names, field names and internals. Errors that deliberately set
// a 4xx statusCode keep their message, since it's meant for the user.
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  console.error(err);
  if (err.type === 'entity.too.large') return res.status(413).json({ reason: 'Request body is too large' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ reason: 'Request body is not valid JSON' });

  // A value Mongoose refused (wrong type, not in an enum) is the caller's
  // mistake, not a server fault: 400, naming only the offending field(s) -
  // never the raw message, which carries model names and internals.
  if (err.name === 'ValidationError' && err.errors) {
    const fields = Object.keys(err.errors);
    return res.status(400).json({ reason: `Invalid value for: ${fields.join(', ')}`, fieldKey: fields[0] });
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ reason: `Invalid value for: ${err.path}`, fieldKey: err.path });
  }

  const statusCode = err.statusCode || err.status || 500;
  const reason = statusCode < 500 && err.message ? err.message : 'Internal server error';
  res.status(statusCode).json({ reason });
}

module.exports = errorHandler;
