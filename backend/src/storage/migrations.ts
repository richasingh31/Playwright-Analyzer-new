import { getPool, ensureDatabaseExists } from './db';

export async function runMigrations(): Promise<void> {
  await ensureDatabaseExists();
  const pool = await getPool();
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='reports' AND xtype='U')
    CREATE TABLE reports (
      id                  NVARCHAR(36)   NOT NULL PRIMARY KEY,
      name                NVARCHAR(500)  NOT NULL,
      uploaded_at         DATETIME2      NOT NULL,
      content_hash        CHAR(64)       NOT NULL,
      stats_total         INT            NOT NULL DEFAULT 0,
      stats_passed        INT            NOT NULL DEFAULT 0,
      stats_failed        INT            NOT NULL DEFAULT 0,
      stats_skipped       INT            NOT NULL DEFAULT 0,
      stats_flaky         INT            NOT NULL DEFAULT 0,
      stats_duration      FLOAT          NOT NULL DEFAULT 0,
      stats_pass_rate     FLOAT          NOT NULL DEFAULT 0,
      metadata_start_time BIGINT         NULL,
      metadata_workers    INT            NULL,
      environment         NVARCHAR(10)   NOT NULL DEFAULT 'QA',
      full_data           NVARCHAR(MAX)  NOT NULL,
      CONSTRAINT UQ_reports_content_hash UNIQUE (content_hash)
    )
  `);
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('reports') AND name = 'content_hash')
    BEGIN
      ALTER TABLE reports ADD content_hash CHAR(64) NULL
      EXEC('UPDATE reports SET content_hash = CONVERT(CHAR(64), HASHBYTES(''SHA2_256'', CONVERT(NVARCHAR(MAX), id)), 2) WHERE content_hash IS NULL')
      ALTER TABLE reports ALTER COLUMN content_hash CHAR(64) NOT NULL
      ALTER TABLE reports ADD CONSTRAINT UQ_reports_content_hash UNIQUE (content_hash)
    END
  `);
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('reports') AND name = 'environment')
    BEGIN
      ALTER TABLE reports ADD environment NVARCHAR(10) NULL
      EXEC('UPDATE reports SET environment = ''QA'' WHERE environment IS NULL')
      ALTER TABLE reports ALTER COLUMN environment NVARCHAR(10) NOT NULL
      ALTER TABLE reports ADD CONSTRAINT DF_reports_environment DEFAULT 'QA' FOR environment
    END
  `);
  console.log('Database migrations complete.');
}
