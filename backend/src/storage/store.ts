import type { ParsedReport, ReportSummary, Environment } from '../types/report.types';
import { FileSystemReportRepository } from './file.store';

/**
 * Repository interface — swap the singleton export below to change storage
 * backends; all other code stays the same. A SQL Server-backed implementation
 * exists commented out in sql-server.store.ts (db.ts / migrations.ts too) if
 * that's wanted again later — see the note atop db.ts to re-enable it.
 */
export interface IReportRepository {
  save(buffer: Buffer, fileName: string, environment: Environment): Promise<ParsedReport>;
  findById(id: string): Promise<ParsedReport | null>;
  findByContentHash(contentHash: string): Promise<ParsedReport | null>;
  findAll(): Promise<ReportSummary[]>;
  delete(id: string): Promise<boolean>;
}

export const reportRepository: IReportRepository = new FileSystemReportRepository();
