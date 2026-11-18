import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import env, { isEdge } from './config/env.js';
import routes from './routes/index.js';
import { notFoundHandler, errorHandler } from './middleware/error.js';

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
if (!isEdge) app.use(compression()); // the Supabase gateway compresses on the edge
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
if (env.nodeEnv !== 'test' && !isEdge) app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

// Product images (already optimised 500x500 WebP) — cache aggressively
if (!isEdge) {
  fs.mkdirSync(env.uploadDir, { recursive: true });
  app.use('/uploads', express.static(env.uploadDir, { maxAge: '30d', immutable: true }));
}

app.use('/api', routes);

// Optionally serve the built React app from the same server (single-port install)
const webDist = process.env.WEB_DIST || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../frontend/dist');
if (!isEdge && fs.existsSync(path.join(webDist, 'index.html'))) {
  app.use(express.static(webDist));
  app.get(/^\/(?!api|uploads).*/, (req, res) => res.sendFile(path.join(webDist, 'index.html')));
}

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
