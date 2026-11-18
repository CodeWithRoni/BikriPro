const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const env = require('./config/env');
const routes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middleware/error');

const app = express();
app.set('trust proxy', 1);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: false }));
app.use(cors({
  origin(origin, cb) {
    // Allow same-origin / native shells (no Origin header) and configured origins
    if (!origin || env.corsOrigins.includes(origin) || env.corsOrigins.includes('*')) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
}));
app.use(compression());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
if (env.nodeEnv !== 'test') app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

// Product images (already optimised 500x500 WebP) — cache aggressively
fs.mkdirSync(env.uploadDir, { recursive: true });
app.use('/uploads', express.static(env.uploadDir, { maxAge: '30d', immutable: true }));

app.use('/api', routes);

// Optionally serve the built React app from the same server (single-port install)
const webDist = process.env.WEB_DIST || path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(path.join(webDist, 'index.html'))) {
  app.use(express.static(webDist));
  app.get(/^\/(?!api|uploads).*/, (req, res) => res.sendFile(path.join(webDist, 'index.html')));
}

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
