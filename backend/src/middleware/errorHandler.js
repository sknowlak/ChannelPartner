// Unexpected errors (500s) are logged in full on the server but reach the
// client only as a generic message - raw Mongo/cast/stack text can reveal
// collection names, field names and internals. Errors that deliberately set
// a 4xx statusCode keep their message, since it's meant for the user.
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  console.error(err);
  if (err.type === 'entity.too.large') return res.status(413).json({ reason: 'Request body is too large' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ reason: 'Request body is not valid JSON' });

  const statusCode = err.statusCode || err.status || 500;
  const reason = statusCode < 500 && err.message ? err.message : 'Internal server error';
  res.status(statusCode).json({ reason });
}

module.exports = errorHandler;
