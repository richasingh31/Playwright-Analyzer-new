export type Environment = 'QA' | 'SIT' | 'PPE';
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
  /** JUnit `hostname` attribute — the browser/run identifier (e.g. "bs-chrome", "16-latest:Windows 11-browserstack") used to tell UI runs from API runs. */
  hostname?: string;
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
  uploadedAt: string;
  environment: Environment;
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
  uploadedAt: string;
  startTime?: number;
  environment: Environment;
  stats: ReportStats;
}

export interface UploadResponse {
  id: string;
  name: string;
  stats: ReportStats;
}
