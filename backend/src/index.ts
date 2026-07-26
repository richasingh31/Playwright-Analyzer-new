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
        `   Check DB_SERVER/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD in backend/.env, and that:\n` +
        '   - SQL Server\'s TCP/IP protocol is enabled (SQL Server Configuration Manager →\n' +
        '     SQL Server Network Configuration → Protocols → TCP/IP → Enabled) with a\n' +
        '     known static port under TCP/IP Properties → IP Addresses → IPAll → TCP Port\n' +
        '   - the SQL Server service has been restarted after that change\n' +
        '   - Windows Firewall allows inbound connections on that port\n' +
        '   - the SQL login has access to the target database\n',
    );
    console.error(err);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`\n🚀  Playwright Analyzer API  →  http://localhost:${PORT}\n`);
  });
}

start();
