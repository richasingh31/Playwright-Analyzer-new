import sql from 'mssql';

let poolPromise: Promise<sql.ConnectionPool> | null = null;

const config: sql.config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER ?? 'localhost',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
  database: process.env.DB_NAME,
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

export function getPool(): Promise<sql.ConnectionPool> {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(config).connect().then((pool) => {
      pool.on('error', (err) => {
        console.error('SQL pool error:', err);
        poolPromise = null;
      });
      return pool;
    });
    poolPromise.catch(() => {
      poolPromise = null;
    });
  }
  return poolPromise;
}
