import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import reportRoutes from './routes/reports.routes';

const app = express();
const PORT = process.env.PORT ?? 4000;

// backend/src/index.ts -> backend/../frontend/dist, whether run from src (tsx)
// or from dist (compiled) — both sit one level under backend/.
const FRONTEND_DIST = path.join(__dirname, '..', '..', 'frontend', 'dist');

app.use(helmet());
app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: true,
  }),
);
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 2000,
    message: { error: 'Too many requests — please try again later.' },
  }),
);
app.use(morgan('dev'));
app.use(express.json());

app.use('/api/reports', reportRoutes);

app.get('/health', (_req, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString() }),
);

// Serve the built frontend so the UI and API share one port. Build it first
// with `npm run build` in frontend/ — this only serves what's already there.
app.use(express.static(FRONTEND_DIST));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    res.status(404).json({ error: 'Not found.' });
    return;
  }
  res.sendFile(path.join(FRONTEND_DIST, 'index.html'), (err) => {
    if (err) next(err);
  });
});

// Global error handler
app.use(
  (
    err: Error & { status?: number },
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(err);
    res
      .status(err.status ?? 500)
      .json({ error: err.message ?? 'Internal server error.' });
  },
);

if (!fs.existsSync(path.join(FRONTEND_DIST, 'index.html'))) {
  console.warn(
    `\n⚠️  frontend/dist not found — run "npm run build" in frontend/ so the UI can be served from this port.\n`,
  );
}

app.listen(PORT, () => {
  console.log(`\n🚀  Playwright Analyzer  →  http://localhost:${PORT}\n`);
});
