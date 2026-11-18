import env from '../config/env.js';

function notFoundHandler(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = err.status || 500;
  let message = err.message || 'Something went wrong';

  // Friendly messages for common PostgreSQL errors
  if (err.code === '23505') {
    status = 409;
    const m = /Key \((\w+)\)/.exec(err.detail || '');
    message = `Duplicate value${m ? ` (${m[1]})` : ''} — this already exists`;
  } else if (err.code === '23503') {
    status = 409;
    message = 'This record is used elsewhere and cannot be deleted';
  } else if (err.code === '23514' || err.code === '22P02' || err.code === '22007') {
    status = 400;
    message = 'Invalid value — please check the form';
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

export { notFoundHandler, errorHandler };
