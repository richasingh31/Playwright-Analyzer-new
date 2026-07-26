// Windows Authentication (Trusted Connection) has no concept on tedious (mssql's
// default driver) — it requires the native msnodesqlv8 driver instead. Every mssql
// import in this codebase must come from 'mssql/msnodesqlv8' consistently, or a
// `connection.on is not a function` error is thrown at runtime.
import sql from 'mssql/msnodesqlv8';

let poolPromise: Promise<sql.ConnectionPool> | null = null;

const config: sql.config = {
  server: process.env.DB_SERVER ?? 'localhost',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
  database: process.env.DB_NAME,
  options: {
    trustedConnection: true,
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
