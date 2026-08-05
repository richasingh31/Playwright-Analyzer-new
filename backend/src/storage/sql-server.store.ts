// Not currently used — see the note atop db.ts. Kept commented out alongside
// db.ts and migrations.ts in case SQL Server storage is wanted again.
// Note: IReportRepository.save() has since changed shape — it now takes
// (buffer, fileName, environment) instead of a pre-parsed ParsedReport, to
// support reading raw XML files straight from backend/data/. This class's
// save() would need updating to match before it compiles again.
/*
import sql from 'mssql/msnodesqlv8';
import type { ParsedReport, ReportSummary, Environment } from '../types/report.types';
import type { IReportRepository } from './store';
import { getPool } from './db';

interface ReportSummaryRow {
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
  environment: string;
}

// Reports saved before the environment column existed have no `environment` key
// in their stored full_data JSON blob — treat those as QA (the only environment
// that existed until now).
function withEnvironmentFallback(report: ParsedReport): ParsedReport {
  return { ...report, environment: (report.environment as Environment | undefined) ?? 'QA' };
}

export class SqlServerReportRepository implements IReportRepository {
  async save(report: ParsedReport): Promise<ParsedReport> {
    const pool = await getPool();
    await pool
      .request()
      .input('id', sql.NVarChar(36), report.id)
      .input('name', sql.NVarChar(500), report.name)
      .input('uploaded_at', sql.DateTime2, report.uploadedAt)
      .input('content_hash', sql.Char(64), report.contentHash)
      .input('environment', sql.NVarChar(10), report.environment)
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
        INSERT INTO reports
          (id, name, uploaded_at, content_hash, environment, stats_total, stats_passed, stats_failed,
           stats_skipped, stats_flaky, stats_duration, stats_pass_rate,
           metadata_start_time, metadata_workers, full_data)
        VALUES
          (@id, @name, @uploaded_at, @content_hash, @environment, @stats_total, @stats_passed, @stats_failed,
           @stats_skipped, @stats_flaky, @stats_duration, @stats_pass_rate,
           @metadata_start_time, @metadata_workers, @full_data)
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
    return withEnvironmentFallback(report);
  }

  async findByContentHash(contentHash: string): Promise<ParsedReport | null> {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('content_hash', sql.Char(64), contentHash)
      .query<{ full_data: string }>('SELECT full_data FROM reports WHERE content_hash = @content_hash');

    if (result.recordset.length === 0) return null;

    const report = JSON.parse(result.recordset[0].full_data) as ParsedReport;
    report.uploadedAt = new Date(report.uploadedAt);
    return withEnvironmentFallback(report);
  }

  async findAll(): Promise<ReportSummary[]> {
    const pool = await getPool();
    const result = await pool.request().query<ReportSummaryRow>(`
      SELECT id, name, uploaded_at, environment,
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
      environment: (row.environment as Environment) ?? 'QA',
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
*/
