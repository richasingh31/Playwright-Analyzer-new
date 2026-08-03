// Windows Authentication (Trusted Connection) has no concept on tedious (mssql's
// default driver) — it requires the native msnodesqlv8 driver instead. Every mssql
// import in this codebase must come from 'mssql/msnodesqlv8' consistently, or a
// `connection.on is not a function` error is thrown at runtime.
import sql from 'mssql/msnodesqlv8';

let poolPromise: Promise<sql.ConnectionPool> | null = null;

// A named SQL Server instance (e.g. SQL Server Express, installed as
// "SQLEXPRESS") does NOT listen on the fixed TCP port 1433 — it uses a dynamic
// port that the SQL Server Browser service resolves from the instance name.
// Prefer connecting via DB_INSTANCE; only fall back to a fixed DB_PORT when no
// instance name is configured (i.e. a default instance).
const instanceName = process.env.DB_INSTANCE || undefined;

const config: sql.config = {
  server: process.env.DB_SERVER ?? 'localhost',
  port:
    !instanceName && process.env.DB_PORT
      ? Number(process.env.DB_PORT)
      : undefined,
  database: process.env.DB_NAME,
  // msnodesqlv8 defaults to the ODBC driver name "SQL Server Native Client 11.0" on
  // Windows, which most modern installs don't have registered (they have "ODBC
  // Driver 17/18 for SQL Server" instead) — causing "Data source name not found".
  // Must match a driver name actually installed; check with:
  //   Get-OdbcDriver | Where-Object { $_.Name -like "*SQL Server*" }
  driver: process.env.DB_ODBC_DRIVER ?? 'ODBC Driver 17 for SQL Server',
  options: {
    trustedConnection: true,
    ...(instanceName ? { instanceName } : {}),
  },
  // mssql defaults requestTimeout to 15s, which large reports (full_data is the
  // whole parsed report as JSON, stored in one NVARCHAR(MAX) insert) can exceed —
  // that's what throws "query timeout expired". Give inserts more headroom.
  requestTimeout: Number(process.env.DB_REQUEST_TIMEOUT_MS ?? 60000),
  connectionTimeout: Number(process.env.DB_CONNECTION_TIMEOUT_MS ?? 30000),
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

// The target database may not exist yet on a fresh SQL Server install — the
// migrations connect straight to DB_NAME and would fail with error 4060
// ("Cannot open database ... requested by the login"). Connect to the always-
// present `master` database first and create the target database if needed.
export async function ensureDatabaseExists(): Promise<void> {
  const dbName = config.database;
  if (!dbName) {
    throw new Error('DB_NAME is not set in backend/.env');
  }

  const masterConfig: sql.config = { ...config, database: 'master' };
  const masterPool = await new sql.ConnectionPool(masterConfig).connect();
  try {
    await masterPool
      .request()
      .input('name', sql.NVarChar, dbName)
      .query(
        `IF DB_ID(@name) IS NULL EXEC('CREATE DATABASE [' + @name + ']')`,
      );
  } finally {
    await masterPool.close();
  }
}