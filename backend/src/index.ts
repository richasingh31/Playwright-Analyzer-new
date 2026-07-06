import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import reportRoutes from './routes/reports.routes';
import { runMigrations } from './storage/migrations';

const app = express();
const PORT = process.env.PORT ?? 4000;

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
    max: 200,
    message: { error: 'Too many requests — please try again later.' },
  }),
);
app.use(morgan('dev'));
app.use(express.json());

app.use('/api/reports', reportRoutes);

app.get('/health', (_req, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString() }),
);

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

async function start() {
  if (process.env.USE_DATABASE === 'true') {
    console.log('Connecting to SQL Server and running migrations...');
    await runMigrations();
  }

  app.listen(PORT, () => {
    console.log(`\n🚀  Playwright Analyzer API  →  http://localhost:${PORT}\n`);
    console.log(
      `   Storage: ${process.env.USE_DATABASE === 'true' ? 'SQL Server' : 'In-memory'}\n`,
    );
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
