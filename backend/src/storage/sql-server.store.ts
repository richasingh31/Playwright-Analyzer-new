import sql from 'mssql';
import type { ParsedReport, ReportSummary } from '../types/report.types';
import type { IReportRepository } from './store';
import { getPool } from './db';

export class SqlServerReportRepository implements IReportRepository {
  async save(report: ParsedReport): Promise<ParsedReport> {
    const pool = await getPool();
    await pool
      .request()
      .input('id', sql.NVarChar(36), report.id)
      .input('name', sql.NVarChar(500), report.name)
      .input('uploaded_at', sql.DateTime2, report.uploadedAt)
      .input('stats_total', sql.Int, report.stats.total)
      .input('stats_passed', sql.Int, report.stats.passed)
      .input('stats_failed', sql.Int, report.stats.failed)
      .input('stats_skipped', sql.Int, report.stats.skipped)
      .input('stats_flaky', sql.Int, report.stats.flaky)
      .input('stats_duration', sql.Float, report.stats.duration)
      .input('stats_pass_rate', sql.Float, report.stats.passRate)
      .input('metadata_start_time', sql.BigInt, report.metadata?.startTime ?? null)
      .input('metadata_workers', sql.Int, report.metadata?.workers ?? null)
      .input('full_data', sql.NVarChar(sql.MAX), JSON.stringify(report))
      .query(`
        MERGE reports AS target
        USING (SELECT @id AS id) AS source ON target.id = source.id
        WHEN MATCHED THEN
          UPDATE SET
            name                 = @name,
            uploaded_at          = @uploaded_at,
            stats_total          = @stats_total,
            stats_passed         = @stats_passed,
            stats_failed         = @stats_failed,
            stats_skipped        = @stats_skipped,
            stats_flaky          = @stats_flaky,
            stats_duration       = @stats_duration,
            stats_pass_rate      = @stats_pass_rate,
            metadata_start_time  = @metadata_start_time,
            metadata_workers     = @metadata_workers,
            full_data            = @full_data
        WHEN NOT MATCHED THEN
          INSERT (id, name, uploaded_at, stats_total, stats_passed, stats_failed,
                  stats_skipped, stats_flaky, stats_duration, stats_pass_rate,
                  metadata_start_time, metadata_workers, full_data)
          VALUES (@id, @name, @uploaded_at, @stats_total, @stats_passed, @stats_failed,
                  @stats_skipped, @stats_flaky, @stats_duration, @stats_pass_rate,
                  @metadata_start_time, @metadata_workers, @full_data);
      `);
    return report;
  }

  async findById(id: string): Promise<ParsedReport | null> {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.NVarChar(36), id)
      .query<{ full_data: string }>('SELECT full_data FROM reports WHERE id = @id');

    if (result.recordset.length === 0) return null;

    const report = JSON.parse(result.recordset[0].full_data) as ParsedReport;
    report.uploadedAt = new Date(report.uploadedAt);
    return report;
  }

  async findAll(): Promise<ReportSummary[]> {
    const pool = await getPool();
    const result = await pool.request().query<{
      id: string;
      name: string;
      uploaded_at: Date;
      stats_total: number;
      stats_passed: number;
      stats_failed: number;
      stats_skipped: number;
      stats_flaky: number;
      stats_duration: number;
      stats_pass_rate: number;
      metadata_start_time: number | null;
    }>(`
      SELECT id, name, uploaded_at,
             stats_total, stats_passed, stats_failed, stats_skipped, stats_flaky,
             stats_duration, stats_pass_rate, metadata_start_time
      FROM reports
      ORDER BY uploaded_at DESC
    `);

    return result.recordset.map((row) => ({
      id: row.id,
      name: row.name,
      uploadedAt: new Date(row.uploaded_at),
      startTime: row.metadata_start_time != null ? Number(row.metadata_start_time) : undefined,
      stats: {
        total: row.stats_total,
        passed: row.stats_passed,
        failed: row.stats_failed,
        skipped: row.stats_skipped,
        flaky: row.stats_flaky,
        duration: row.stats_duration,
        passRate: row.stats_pass_rate,
      },
    }));
  }

  async delete(id: string): Promise<boolean> {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.NVarChar(36), id)
      .query('DELETE FROM reports WHERE id = @id');
    return (result.rowsAffected[0] ?? 0) > 0;
  }
}
