const env = require('../config/env');

function notFoundHandler(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = err.status || 500;
  let message = err.message || 'Something went wrong';

  // Friendly messages for common MySQL errors
  if (err.code === 'ER_DUP_ENTRY') {
    status = 409;
    const m = /for key '(?:\w+\.)?(\w+)'/.exec(err.sqlMessage || '');
    message = `Duplicate value${m ? ` (${m[1]})` : ''} — this already exists`;
  } else if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED') {
    status = 409;
    message = 'This record is used elsewhere and cannot be deleted';
  } else if (err.code === 'LIMIT_FILE_SIZE') {
    status = 413;
    message = 'File is too large';
  }

  if (status >= 500) console.error(err);
  res.status(status).json({
    message,
    ...(err.details ? { details: err.details } : {}),
    ...(env.nodeEnv !== 'production' && status >= 500 ? { stack: err.stack } : {}),
  });
}

module.exports = { notFoundHandler, errorHandler };
