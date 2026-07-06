import sql from 'mssql';

let pool: sql.ConnectionPool | null = null;

const config: sql.config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER ?? 'localhost\\SQLEXPRESS',
  database: process.env.DB_NAME ?? 'PlaywrightAnalyzer',
  options: {
    trustServerCertificate: true,
    encrypt: false,
    enableArithAbort: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

export async function getPool(): Promise<sql.ConnectionPool> {
  if (!pool) {
    pool = await new sql.ConnectionPool(config).connect();
    pool.on('error', (err) => {
      console.error('SQL pool error:', err);
      pool = null;
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.close();
    pool = null;
  }
}
