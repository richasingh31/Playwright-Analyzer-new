import { XMLParser } from 'fast-xml-parser';
import { v4 as uuidv4 } from 'uuid';
import type {
  ParsedReport,
  TestSuite,
  TestResult,
  TestStatus,
  ErrorCategory,
  ErrorGroup,
  JUnitDocument,
  JUnitTestSuite,
  JUnitTestCase,
  JUnitFailure,
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

// ── Tenant extraction ──────────────────────────────────────────────────────────
// Multi-tenant API suites log the tenant a test ran against in its console
// output, e.g. "[INFO] TenantId:  4" or "[INFO] [createSession] Tenant ID: 4".
const TENANT_ID_PATTERN = /tenant\s*id\s*:\s*(\d+)/i;

function extractTenantId(systemOut: string | string[] | undefined): string | undefined {
  if (!systemOut) return undefined;
  const text = toArray(systemOut).join('\n');
  return text.match(TENANT_ID_PATTERN)?.[1];
}

// ── XML parsing ────────────────────────────────────────────────────────────────

const ARRAY_ELEMENTS = new Set(['testsuites.testsuite', 'testsuite.testcase', 'testcase.failure', 'testcase.error']);

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseAttributeValue: true,
  trimValues: true,
  processEntities: true,
  htmlEntities: true,
  isArray: (_name, jpath) => ARRAY_ELEMENTS.has(jpath),
});

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function num(value: string | number | undefined, fallback = 0): number {
  if (value === undefined) return fallback;
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Playwright JUnit `classname` is sometimes prefixed with a project name, e.g. "chromium › tests/example.spec.ts". */
function extractFile(testcase: JUnitTestCase, suiteName?: string): string {
  const classname = testcase['@_classname'];
  if (classname) {
    const parts = classname.split(/\s*[›>]\s*/).filter(Boolean);
    return parts[parts.length - 1] ?? classname;
  }
  return suiteName ?? 'unknown';
}

function firstFailure(testcase: JUnitTestCase): JUnitFailure | undefined {
  return toArray(testcase.failure)[0] ?? toArray(testcase.error)[0];
}

function mapStatus(testcase: JUnitTestCase): TestStatus {
  if (firstFailure(testcase)) return 'failed';
  if (testcase.skipped !== undefined) return 'skipped';
  return 'passed';
}

function mapTestCase(testcase: JUnitTestCase, suiteName?: string): TestResult {
  const status = mapStatus(testcase);
  const failure = firstFailure(testcase);
  const errorMessage = failure?.['@_message'] ?? failure?.['#text'] ?? '';
  const errorStack = failure?.['#text'];
  const file = extractFile(testcase, suiteName);
  const tenantId = extractTenantId(testcase['system-out']);

  return {
    id: uuidv4(),
    title: testcase['@_name'],
    fullTitle: [suiteName, testcase['@_name']].filter(Boolean).join(' › '),
    status,
    duration: Math.round(num(testcase['@_time']) * 1000),
    tenantId,
    error: failure
      ? {
          message: errorMessage,
          stack: errorStack,
          // `message` (the failure's `message=` attribute) is sometimes just a
          // "file:line:col test name" location stub with no error detail — the
          // real error text (assertion/timeout/network keywords) often only
          // appears in the element's text content (`stack`), so categorize
          // against both rather than `message` alone.
          category: categorizeError(`${errorMessage}\n${errorStack ?? ''}`),
        }
      : undefined,
    file,
    retries: 0,
  };
}

function mapTestSuite(suite: JUnitTestSuite): TestSuite {
  const suiteName = suite['@_name'] ?? 'Suite';
  const tests = toArray(suite.testcase).map((tc) => mapTestCase(tc, suiteName));
  const file = tests[0]?.file ?? suiteName;

  return {
    id: uuidv4(),
    title: suiteName,
    file,
    tests,
    suites: [],
    stats: {
      total: tests.length,
      passed: tests.filter((t) => t.status === 'passed').length,
      failed: tests.filter((t) => t.status === 'failed').length,
      skipped: tests.filter((t) => t.status === 'skipped').length,
      flaky: 0,
    },
  };
}

function flattenTests(suite: TestSuite): TestResult[] {
  return [...suite.tests, ...suite.suites.flatMap(flattenTests)];
}

function buildErrorGroups(suites: TestSuite[]): ErrorGroup[] {
  const allFailed = suites.flatMap(flattenTests).filter((t) => t.status === 'failed' && t.error);

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
  const xml = fileBuffer.toString('utf-8');

  let doc: JUnitDocument;
  try {
    doc = xmlParser.parse(xml) as JUnitDocument;
  } catch {
    throw Object.assign(new Error('Uploaded file is not valid XML.'), { status: 422 });
  }

  const root = doc.testsuites ?? (doc.testsuite ? { testsuite: doc.testsuite } : undefined);
  if (!root) {
    throw Object.assign(
      new Error(
        'Unable to parse report. Please ensure you are uploading a Playwright JUnit XML report ' +
          '(generated via `playwright test --reporter=junit`).',
      ),
      { status: 422 },
    );
  }

  const suites = toArray(root.testsuite).map(mapTestSuite);
  const allTests = suites.flatMap(flattenTests);

  const total = num(root['@_tests'], allTests.length);
  const failed = allTests.filter((t) => t.status === 'failed').length;
  const skipped = allTests.filter((t) => t.status === 'skipped').length;
  const passed = allTests.filter((t) => t.status === 'passed').length;
  const flaky = 0;
  const duration =
    root['@_time'] !== undefined
      ? Math.round(num(root['@_time']) * 1000)
      : allTests.reduce((sum, t) => sum + t.duration, 0);

  const earliestTimestamp = toArray(root.testsuite)
    .map((s) => s['@_timestamp'])
    .filter((t): t is string => !!t)
    .sort()[0];

  const tenantIds = Array.from(
    new Set(allTests.map((t) => t.tenantId).filter((t): t is string => !!t)),
  ).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

  return {
    id: uuidv4(),
    name: fileName.replace(/\.xml$/i, ''),
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
      startTime: earliestTimestamp ? new Date(earliestTimestamp).getTime() : undefined,
      workers: undefined,
      tenantIds: tenantIds.length > 0 ? tenantIds : undefined,
    },
  };
}
