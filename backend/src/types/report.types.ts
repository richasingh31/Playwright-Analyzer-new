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
  uploadedAt: Date;
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
  uploadedAt: Date;
  startTime?: number;
  stats: ReportStats;
}

// ── Raw Playwright JSON shapes (varies by PW version) ────────────────────────
export interface PlaywrightJsonReport {
  metadata?: {
    actualWorkers?: number;
    startTime?: number;
    duration?: number;
    status?: string;
  };
  stats?: {
    total?: number;
    expected?: number;
    unexpected?: number;
    flaky?: number;
    skipped?: number;
    duration?: number;
  };
  startTime?: string;
  duration?: number;
  files?: PlaywrightJsonSuite[];
  suites?: PlaywrightJsonSuite[];
  errors?: unknown[];
}

export interface PlaywrightJsonSuite {
  title: string;
  fileId?: string;
  file?: string;
  fileName?: string;
  projectName?: string;
  location?: { file: string; line: number; column: number };
  suites?: PlaywrightJsonSuite[];
  tests?: PlaywrightJsonTest[];
  stats?: {
    total?: number;
    expected?: number;
    unexpected?: number;
    flaky?: number;
    skipped?: number;
  };
}

export interface PlaywrightJsonTest {
  testId?: string;
  title: string;
  projectName?: string;
  location?: { file: string; line: number; column: number };
  results: PlaywrightJsonResult[];
  ok?: boolean;
  outcome?: 'skipped' | 'expected' | 'unexpected' | 'flaky';
  path?: string[];
}

export interface PlaywrightJsonResult {
  retry?: number;
  duration: number;
  status: 'passed' | 'failed' | 'timedout' | 'interrupted' | 'skipped';
  error?: {
    message?: string;
    stack?: string;
    value?: string;
  };
}
