import type { ParsedReport, ReportSummary } from '../types/report.types';
import { SqlServerReportRepository } from './sql-server.store';

export interface IReportRepository {
  save(report: ParsedReport): Promise<ParsedReport>;
  findById(id: string): Promise<ParsedReport | null>;
  findAll(): Promise<ReportSummary[]>;
  delete(id: string): Promise<boolean>;
}

class InMemoryReportRepository implements IReportRepository {
  private readonly reports = new Map<string, ParsedReport>();

  async save(report: ParsedReport): Promise<ParsedReport> {
    this.reports.set(report.id, report);
    return report;
  }

  async findById(id: string): Promise<ParsedReport | null> {
    return this.reports.get(id) ?? null;
  }

  async findAll(): Promise<ReportSummary[]> {
    return Array.from(this.reports.values())
      .map(({ id, name, uploadedAt, stats, metadata }) => ({
        id,
        name,
        uploadedAt,
        stats,
        startTime: metadata?.startTime,
      }))
      .sort(
        (a, b) =>
          new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
      );
  }

  async delete(id: string): Promise<boolean> {
    return this.reports.delete(id);
  }
}

export const reportRepository: IReportRepository =
  process.env.USE_DATABASE === 'true'
    ? new SqlServerReportRepository()
    : new InMemoryReportRepository();
