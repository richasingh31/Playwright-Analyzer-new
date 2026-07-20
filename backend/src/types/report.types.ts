export type TestStatus = 'passed' | 'failed' | 'skipped' | 'flaky';
export type ErrorCategory =
  | 'assertion'
  | 'timeout'
  | 'network'
  | 'element-not-found'
  | 'runtime'
  | 'application';

export interface TestError {
  message: string;
  stack?: string;
  category: ErrorCategory;
}

export interface TestResult {
  id: string;
  title: string;
  fullTitle: string;
  status: TestStatus;
  duration: number;
  error?: TestError;
  file: string;
  line?: number;
  retries: number;
  /** Tenant ID parsed out of the test's logged output (e.g. "[INFO] TenantId: 4"), when present. */
  tenantId?: string;
}

export interface SuiteStats {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
}

export interface TestSuite {
  id: string;
  title: string;
  file: string;
  tests: TestResult[];
  suites: TestSuite[];
  stats: SuiteStats;
}

export interface ReportStats {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
  duration: number;
  passRate: number;
}

export interface ErrorGroup {
  category: ErrorCategory;
  label: string;
  count: number;
  tests: TestResult[];
}

export interface ParsedReport {
  id: string;
  name: string;
  uploadedAt: Date;
  contentHash: string;
  stats: ReportStats;
  suites: TestSuite[];
  errorGroups: ErrorGroup[];
  metadata?: {
    startTime?: number;
    workers?: number;
    /** Distinct tenant IDs found across all tests' logged output, sorted numerically. */
    tenantIds?: string[];
  };
}

export interface ReportSummary {
  id: string;
  name: string;
  uploadedAt: Date;
  startTime?: number;
  stats: ReportStats;
}

// ── Raw JUnit XML shapes (Playwright `--reporter=junit` output) ──────────────
// fast-xml-parser represents attributes as `@_name` and singleton-vs-array
// child elements ambiguously, so callers should normalise with toArray().

export interface JUnitFailure {
  '@_message'?: string;
  '@_type'?: string;
  '#text'?: string;
}

export interface JUnitTestCase {
  '@_name': string;
  '@_classname'?: string;
  '@_time'?: string | number;
  failure?: JUnitFailure | JUnitFailure[];
  error?: JUnitFailure | JUnitFailure[];
  skipped?: unknown;
  'system-out'?: string | string[];
  'system-err'?: string | string[];
}

export interface JUnitTestSuite {
  '@_name'?: string;
  '@_timestamp'?: string;
  '@_hostname'?: string;
  '@_tests'?: string | number;
  '@_failures'?: string | number;
  '@_skipped'?: string | number;
  '@_errors'?: string | number;
  '@_time'?: string | number;
  testcase?: JUnitTestCase | JUnitTestCase[];
}

export interface JUnitTestSuites {
  '@_tests'?: string | number;
  '@_failures'?: string | number;
  '@_skipped'?: string | number;
  '@_errors'?: string | number;
  '@_time'?: string | number;
  testsuite?: JUnitTestSuite | JUnitTestSuite[];
}

export interface JUnitDocument {
  testsuites?: JUnitTestSuites;
  testsuite?: JUnitTestSuite;
}
