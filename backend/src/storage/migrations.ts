import { getPool } from './db';

export async function runMigrations(): Promise<void> {
  const pool = await getPool();
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='reports' AND xtype='U')
    CREATE TABLE reports (
      id               NVARCHAR(36)   NOT NULL PRIMARY KEY,
      name             NVARCHAR(500)  NOT NULL,
      uploaded_at      DATETIME2      NOT NULL,
      stats_total      INT            NOT NULL DEFAULT 0,
      stats_passed     INT            NOT NULL DEFAULT 0,
      stats_failed     INT            NOT NULL DEFAULT 0,
      stats_skipped    INT            NOT NULL DEFAULT 0,
      stats_flaky      INT            NOT NULL DEFAULT 0,
      stats_duration   FLOAT          NOT NULL DEFAULT 0,
      stats_pass_rate  FLOAT          NOT NULL DEFAULT 0,
      metadata_start_time BIGINT      NULL,
      metadata_workers INT            NULL,
      full_data        NVARCHAR(MAX)  NOT NULL
    )
  `);
  console.log('Database migrations complete.');
}
