// Unexpected errors (500s) are logged in full on the server but reach the
// client only as a generic message - raw Mongo/cast/stack text can reveal
// collection names, field names and internals. Errors that deliberately set
// a 4xx statusCode keep their message, since it's meant for the user.
// Every error body carries the request ID (section 62), which the server
// log line carries too, so a reported failure can be found.
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const requestId = req.requestId;
  console.error(`[request ${requestId || '-'}]`, err);
  const send = (status, body) => res.status(status).json({ ...body, requestId });
  if (err.type === 'entity.too.large') return send(413, { reason: 'Request body is too large' });
  if (err.type === 'entity.parse.failed') return send(400, { reason: 'Request body is not valid JSON' });

  // A value Mongoose refused (wrong type, not in an enum) is the caller's
  // mistake, not a server fault: 400, naming only the offending field(s) -
  // never the raw message, which carries model names and internals.
  if (err.name === 'ValidationError' && err.errors) {
    const fields = Object.keys(err.errors);
    return send(400, { reason: `Invalid value for: ${fields.join(', ')}`, fieldKey: fields[0] });
  }
  if (err.name === 'CastError') {
    return send(400, { reason: `Invalid value for: ${err.path}`, fieldKey: err.path });
  }

  const statusCode = err.statusCode || err.status || 500;
  const reason = statusCode < 500 && err.message ? err.message : 'Internal server error';
  send(statusCode, { reason, ...(err.code && statusCode < 500 && typeof err.code === 'string' ? { code: err.code } : {}) });
}

module.exports = errorHandler;
