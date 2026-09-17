function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  console.error(err);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({ reason: err.message || 'Internal server error' });
}

module.exports = errorHandler;
