import * as cheerio from 'cheerio';
import * as zlib from 'zlib';
import AdmZip from 'adm-zip';
import { v4 as uuidv4 } from 'uuid';
import type {
  ParsedReport,
  TestSuite,
  TestResult,
  TestStatus,
  ErrorCategory,
  ErrorGroup,
  PlaywrightJsonReport,
  PlaywrightJsonSuite,
  PlaywrightJsonTest,
} from '../types/report.types';

// ── Error categorisation ──────────────────────────────────────────────────────

const ERROR_PATTERNS: Array<{ pattern: RegExp; category: ErrorCategory }> = [
  {
    pattern: /expect\s*\(|toBe\(|toEqual\(|toContain\(|AssertionError|assertion failed/i,
    category: 'assertion',
  },
  {
    pattern: /timeout|timed out|exceeded.*timeout|waiting.*\d+ms/i,
    category: 'timeout',
  },
  {
    pattern: /net::|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|fetch failed|network|http.*error|xhr/i,
    category: 'network',
  },
  {
    pattern:
      /element.*not found|locator.*resolve|waiting for selector|no element.*match|strict mode violation|Target closed/i,
    category: 'element-not-found',
  },
  {
    pattern: /TypeError|ReferenceError|SyntaxError|RangeError|is not a function|Cannot read/i,
    category: 'runtime',
  },
];

function categorizeError(message: string): ErrorCategory {
  for (const { pattern, category } of ERROR_PATTERNS) {
    if (pattern.test(message)) return category;
  }
  return 'application';
}

// ── Decompression helpers ─────────────────────────────────────────────────────

function tryDecompress(base64: string): string | null {
  try {
    const buf = Buffer.from(base64.trim(), 'base64');
    try {
      return zlib.gunzipSync(buf).toString('utf-8');
    } catch {
      return zlib.inflateRawSync(buf).toString('utf-8');
    }
  } catch {
    return null;
  }
}

// ── ZIP extraction (PW ≥ 1.44 — script id="playwrightReportBase64") ─────────

function extractFromZip(html: string): PlaywrightJsonReport | null {
  const $ = cheerio.load(html);
  const zipScript = $('#playwrightReportBase64');
  if (!zipScript.length) return null;

  const raw = (zipScript.html() ?? '').trim();
  const dataUriPrefix = 'data:application/zip;base64,';
  const b64 = raw.startsWith(dataUriPrefix) ? raw.slice(dataUriPrefix.length) : raw;
  if (!b64) return null;

  try {
    const buf = Buffer.from(b64, 'base64');
    const zip = new AdmZip(buf);
    const reportEntry = zip.getEntry('report.json');
    if (!reportEntry) return null;

    const report = JSON.parse(reportEntry.getData().toString('utf-8')) as PlaywrightJsonReport;

    // Merge detailed test results from individual file JSONs
    if (report.files) {
      report.files = report.files.map((fileEntry) => {
        const fileId = (fileEntry as PlaywrightJsonSuite & { fileId?: string }).fileId;
        if (!fileId) return fileEntry;
        const detailEntry = zip.getEntry(`${fileId}.json`);
        if (!detailEntry) return fileEntry;
        try {
          const detail = JSON.parse(detailEntry.getData().toString('utf-8')) as PlaywrightJsonSuite & { tests?: ZipTest[] };
          // Normalise errors array → error object that mapTests expects
          if (detail.tests) {
            (fileEntry as PlaywrightJsonSuite).tests = detail.tests.map(normalizeZipTest);
          }
        } catch { /* keep fileEntry as-is */ }
        return fileEntry;
      });
    }

    return report;
  } catch {
    return null;
  }
}

interface ZipTestResult {
  duration: number;
  startTime?: string;
  retry?: number;
  status: 'passed' | 'failed' | 'timedout' | 'interrupted' | 'skipped';
  errors?: Array<{ message?: string; stack?: string; value?: string }>;
}

interface ZipTest {
  testId?: string;
  title: string;
  projectName?: string;
  location?: { file: string; line: number; column: number };
  duration?: number;
  outcome?: 'skipped' | 'expected' | 'unexpected' | 'flaky';
  path?: string[];
  ok?: boolean;
  results: ZipTestResult[];
}

function normalizeZipTest(t: ZipTest): PlaywrightJsonTest {
  return {
    testId: t.testId,
    title: t.title,
    projectName: t.projectName,
    location: t.location,
    outcome: t.outcome,
    path: t.path,
    ok: t.ok,
    results: t.results.map((r) => ({
      duration: r.duration,
      status: r.status,
      retry: r.retry,
      error: r.errors?.[0]
        ? { message: r.errors[0].message, stack: r.errors[0].stack, value: r.errors[0].value }
        : undefined,
    })),
  };
}

// ── HTML → JSON extraction (handles multiple PW versions) ────────────────────

function extractReportJson(html: string): PlaywrightJsonReport | null {
  // Strategy 1 (PW ≥ 1.44): ZIP blob in <script id="playwrightReportBase64">
  const zipResult = extractFromZip(html);
  if (zipResult) return zipResult;

  const $ = cheerio.load(html);
  const scripts: string[] = [];
  $('script').each((_, el) => {
    const content = $(el).html();
    if (content) scripts.push(content);
  });

  // Strategy 2: base64+gzip variable (PW ≥ 1.22)
  const base64VarPatterns = [
    /window\.playwrightReportBase64\s*=\s*["']([A-Za-z0-9+/=\r\n]+)["']/,
    /window\.__pw_report_data\s*=\s*["']([A-Za-z0-9+/=\r\n]+)["']/,
    /reportBase64\s*=\s*["']([A-Za-z0-9+/=\r\n]+)["']/,
  ];

  for (const script of scripts) {
    for (const re of base64VarPatterns) {
      const m = script.match(re);
      if (m?.[1]) {
        const raw = tryDecompress(m[1]);
        if (raw) {
          try {
            return JSON.parse(raw) as PlaywrightJsonReport;
          } catch { /* try next */ }
        }
      }
    }

    // Strategy 3: direct JSON variable
    const directPatterns = [
      /window\.__PLAYWRIGHT_REPORT__\s*=\s*(\{[\s\S]*?\});\s*(?:window|<\/script>)/,
      /window\.__pw_report\s*=\s*(\{[\s\S]*?\});\s*(?:window|<\/script>)/,
    ];
    for (const re of directPatterns) {
      const m = script.match(re);
      if (m?.[1]) {
        try {
          return JSON.parse(m[1]) as PlaywrightJsonReport;
        } catch { /* try next */ }
      }
    }
  }

  // Strategy 4: script tag with data id
  const tagged = $('#reactData, #reportData, [data-playwright-report]').html();
  if (tagged) {
    try {
      return JSON.parse(tagged) as PlaywrightJsonReport;
    } catch { /* fall through */ }
  }

  return null;
}

// ── Data mapping ──────────────────────────────────────────────────────────────

function outcomeToStatus(
  outcome?: string,
  rawStatus?: string,
): TestStatus {
  if (outcome === 'flaky') return 'flaky';
  if (
    outcome === 'skipped' ||
    rawStatus === 'skipped'
  )
    return 'skipped';
  if (
    outcome === 'unexpected' ||
    rawStatus === 'failed' ||
    rawStatus === 'timedout' ||
    rawStatus === 'interrupted'
  )
    return 'failed';
  return 'passed';
}

function mapTests(
  raw: PlaywrightJsonTest[],
  file: string,
  suitePath: string,
): TestResult[] {
  return raw.map((t) => {
    const lastResult = t.results[t.results.length - 1];
    const status = outcomeToStatus(t.outcome, lastResult?.status);
    const rawErr = lastResult?.error;
    const errorMsg =
      rawErr?.message ?? rawErr?.value ?? '';

    return {
      id: t.testId ?? uuidv4(),
      title: t.title,
      fullTitle: [...(t.path ?? [suitePath]), t.title].join(' › '),
      status,
      duration: lastResult?.duration ?? 0,
      error: rawErr
        ? {
            message: errorMsg,
            stack: rawErr.stack,
            category: categorizeError(errorMsg),
          }
        : undefined,
      file: t.location?.file ?? file,
      line: t.location?.line,
      retries: Math.max(0, (t.results.length ?? 1) - 1),
    };
  });
}

function mapSuites(
  raw: PlaywrightJsonSuite[],
  parentFile = '',
): TestSuite[] {
  return raw.map((s) => {
    const file = s.location?.file ?? s.file ?? s.fileName ?? parentFile;
    const childSuites = mapSuites(s.suites ?? [], file);
    const directTests = mapTests(s.tests ?? [], file, s.title);
    const allTests = [...directTests, ...childSuites.flatMap(flattenTests)];

    return {
      id: s.fileId ?? uuidv4(),
      title: s.title ?? s.fileName ?? file,
      file,
      tests: directTests,
      suites: childSuites,
      stats: {
        total: allTests.length,
        passed: allTests.filter((t) => t.status === 'passed').length,
        failed: allTests.filter((t) => t.status === 'failed').length,
        skipped: allTests.filter((t) => t.status === 'skipped').length,
        flaky: allTests.filter((t) => t.status === 'flaky').length,
      },
    };
  });
}

function flattenTests(suite: TestSuite): TestResult[] {
  return [
    ...suite.tests,
    ...suite.suites.flatMap(flattenTests),
  ];
}

function buildErrorGroups(suites: TestSuite[]): ErrorGroup[] {
  const allFailed = suites
    .flatMap(flattenTests)
    .filter((t) => (t.status === 'failed' || t.status === 'flaky') && t.error);

  const grouped = new Map<ErrorCategory, TestResult[]>();
  for (const test of allFailed) {
    const cat = test.error!.category;
    grouped.set(cat, [...(grouped.get(cat) ?? []), test]);
  }

  const labels: Record<ErrorCategory, string> = {
    assertion: 'Assertion Failures',
    timeout: 'Timeout Errors',
    network: 'Network Errors',
    'element-not-found': 'Element Not Found',
    runtime: 'Runtime Errors',
    application: 'Application Errors',
  };

  return Array.from(grouped.entries())
    .map(([category, tests]) => ({
      category,
      label: labels[category],
      count: tests.length,
      tests,
    }))
    .sort((a, b) => b.count - a.count);
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function parsePlaywrightReport(
  fileBuffer: Buffer,
  fileName: string,
  contentHash: string,
): Promise<ParsedReport> {
  const html = fileBuffer.toString('utf-8');
  const json = extractReportJson(html);

  if (!json) {
    throw Object.assign(
      new Error(
        'Unable to parse Playwright HTML report. ' +
          'Please ensure you are uploading a valid Playwright-generated HTML report.',
      ),
      { status: 422 },
    );
  }

  const rawSuites = json.files ?? json.suites ?? [];
  const suites = mapSuites(rawSuites);
  const allTests = suites.flatMap(flattenTests);
  const raw = json.stats;

  const passed =
    raw?.expected ?? allTests.filter((t) => t.status === 'passed').length;
  const failed =
    raw?.unexpected ?? allTests.filter((t) => t.status === 'failed').length;
  const skipped =
    raw?.skipped ?? allTests.filter((t) => t.status === 'skipped').length;
  const flaky =
    raw?.flaky ?? allTests.filter((t) => t.status === 'flaky').length;
  const total = raw?.total ?? allTests.length;
  const duration =
    raw?.duration ?? json.metadata?.duration ?? json.duration ?? 0;

  // Resolve report start time: try metadata.startTime (number ms), then root startTime (ISO string)
  const startTime: number | undefined =
    json.metadata?.startTime ??
    (json.startTime ? new Date(json.startTime).getTime() : undefined);

  return {
    id: uuidv4(),
    name: fileName.replace(/\.html?$/i, ''),
    uploadedAt: new Date(),
    contentHash,
    stats: {
      total,
      passed,
      failed,
      skipped,
      flaky,
      duration,
      passRate: total > 0 ? Math.round((passed / total) * 100) : 0,
    },
    suites,
    errorGroups: buildErrorGroups(suites),
    metadata: {
      startTime,
      workers: json.metadata?.actualWorkers,
    },
  };
}
