import 'dotenv/config';
import util from 'node:util';
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

async function start() {
  try {
    await runMigrations();
  } catch (err) {
    console.error(
      '\n❌  Could not connect to SQL Server / run migrations.\n' +
        `   Check DB_SERVER/DB_PORT/DB_NAME in backend/.env, and that:\n` +
        '   - SQL Server\'s TCP/IP protocol is enabled (SQL Server Configuration Manager →\n' +
        '     SQL Server Network Configuration → Protocols → TCP/IP → Enabled) with a\n' +
        '     known static port under TCP/IP Properties → IP Addresses → IPAll → TCP Port\n' +
        '   - the SQL Server service has been restarted after that change\n' +
        '   - Windows Firewall allows inbound connections on that port\n' +
        '   - this is running under a Windows account that has access to the target\n' +
        '     database (Windows Authentication / Trusted Connection — no DB_USER/DB_PASSWORD)\n' +
        '   - the msnodesqlv8 native module installed correctly (npm install must be run\n' +
        '     on this same Windows machine — it will not work with a copied node_modules)\n',
    );
    console.error(util.inspect(err, { depth: null, showHidden: true }));
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`\n🚀  Playwright Analyzer API  →  http://localhost:${PORT}\n`);
  });
}

start();
