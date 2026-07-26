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
  // msnodesqlv8 defaults to the ODBC driver name "SQL Server Native Client 11.0" on
  // Windows, which most modern installs don't have registered (they have "ODBC
  // Driver 17/18 for SQL Server" instead) — causing "Data source name not found".
  // Must match a driver name actually installed; check with:
  //   Get-OdbcDriver | Where-Object { $_.Name -like "*SQL Server*" }
  driver: process.env.DB_ODBC_DRIVER ?? 'ODBC Driver 17 for SQL Server',
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
