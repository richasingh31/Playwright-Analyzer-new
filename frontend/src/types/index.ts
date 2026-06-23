export type TestStatus = 'passed' | 'failed' | 'skipped' | 'flaky';
export type ErrorCategory =
  | 'assertion'
  | 'timeout'
  | 'network'
  | 'element-not-found'
  | 'runtime'
  | 'unknown';

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
  uploadedAt: string;
  stats: ReportStats;
  suites: TestSuite[];
  errorGroups: ErrorGroup[];
  metadata?: {
    startTime?: number;
    workers?: number;
  };
}

export interface ReportSummary {
  id: string;
  name: string;
  uploadedAt: string;
  startTime?: number;
  stats: ReportStats;
}

export interface UploadResponse {
  id: string;
  name: string;
  stats: ReportStats;
}
