import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import type { ParsedReport, ReportSummary, Environment } from '../types/report.types';
import type { IReportRepository } from './store';
import { parsePlaywrightReport } from '../services/parser.service';

const ENVIRONMENTS: Environment[] = ['QA', 'SIT', 'PPE'];

// backend/src/storage/file.store.ts -> backend/data, whether run from src (tsx)
// or from dist (compiled) — both sit two levels under backend/.
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

function envDir(environment: Environment): string {
  return path.join(DATA_DIR, environment);
}

interface FileEntry {
  filePath: string;
  environment: Environment;
}

async function listXmlFiles(): Promise<FileEntry[]> {
  const files: FileEntry[] = [];
  for (const environment of ENVIRONMENTS) {
    const dir = envDir(environment);
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw err;
    }
    for (const entry of entries) {
      if (entry.toLowerCase().endsWith('.xml')) files.push({ filePath: path.join(dir, entry), environment });
    }
  }
  return files;
}

async function hashFile(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  return createHash('sha256').update(buffer).digest('hex');
}

async function findFileById(id: string): Promise<FileEntry | null> {
  for (const entry of await listXmlFiles()) {
    if ((await hashFile(entry.filePath)) === id) return entry;
  }
  return null;
}

async function parseFileAt(filePath: string, environment: Environment): Promise<ParsedReport> {
  const buffer = await fs.readFile(filePath);
  const contentHash = createHash('sha256').update(buffer).digest('hex');
  const report = await parsePlaywrightReport(buffer, path.basename(filePath), contentHash, environment);

  // The folder a report lives in is the authoritative environment — that's how
  // reports are organised on disk and shouldn't be second-guessed by content
  // sniffing. The content hash doubles as a stable id, since nothing else
  // persists one across restarts.
  report.id = contentHash;
  report.environment = environment;
  report.uploadedAt = (await fs.stat(filePath)).mtime;
  return report;
}

/**
 * Reads reports directly from raw JUnit XML files under backend/data/<environment>/ —
 * whichever folder a file sits in becomes its Environment. Uploading via the API
 * just writes the file into that folder; nothing else treats it differently from
 * a file placed there by hand.
 */
export class FileSystemReportRepository implements IReportRepository {
  async save(buffer: Buffer, fileName: string, environment: Environment): Promise<ParsedReport> {
    const dir = envDir(environment);
    await fs.mkdir(dir, { recursive: true });

    const contentHash = createHash('sha256').update(buffer).digest('hex');
    const ext = path.extname(fileName) || '.xml';
    const base = path.basename(fileName, ext).replace(/[\\/:*?"<>|]/g, '_');
    const filePath = path.join(dir, `${base}__${contentHash.slice(0, 8)}${ext}`);

    await fs.writeFile(filePath, buffer);
    return parseFileAt(filePath, environment);
  }

  async findById(id: string): Promise<ParsedReport | null> {
    const entry = await findFileById(id);
    return entry ? parseFileAt(entry.filePath, entry.environment) : null;
  }

  async findByContentHash(contentHash: string): Promise<ParsedReport | null> {
    return this.findById(contentHash);
  }

  async findAll(): Promise<ReportSummary[]> {
    const files = await listXmlFiles();
    const reports = await Promise.all(files.map((f) => parseFileAt(f.filePath, f.environment)));

    return reports
      .map((report) => ({
        id: report.id,
        name: report.name,
        uploadedAt: report.uploadedAt,
        startTime: report.metadata?.startTime,
        environment: report.environment,
        stats: report.stats,
      }))
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
  }

  async delete(id: string): Promise<boolean> {
    const entry = await findFileById(id);
    if (!entry) return false;
    await fs.unlink(entry.filePath);
    return true;
  }
}
