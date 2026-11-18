class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const badRequest = (msg, details) => new HttpError(400, msg, details);
const notFound = (msg = 'Not found') => new HttpError(404, msg);
const forbidden = (msg = 'Forbidden') => new HttpError(403, msg);

/** Wrap async route handlers so thrown errors reach the error middleware. */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Throw 400 if any listed field is missing/empty in obj. */
function requireFields(obj, fields) {
  const missing = fields.filter((f) => obj[f] === undefined || obj[f] === null || obj[f] === '');
  if (missing.length) throw badRequest(`Missing required field(s): ${missing.join(', ')}`);
}

/** Parse page/limit query params with sane bounds. */
function paging(q, defLimit = 25) {
  const limit = Math.min(Math.max(parseInt(q.limit, 10) || defLimit, 1), 500);
  const page = Math.max(parseInt(q.page, 10) || 1, 1);
  return { limit, page, offset: (page - 1) * limit };
}

/** Round to 2dp avoiding float drift. */
const money = (n) => Math.round((Number(n) || 0) * 100) / 100;

const today = () => {
  // YYYY-MM-DD in Asia/Dhaka
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
};

export { HttpError, badRequest, notFound, forbidden, asyncHandler, requireFields, paging, money, today };
