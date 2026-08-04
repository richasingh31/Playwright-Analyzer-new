import type { TestStatus, ErrorCategory } from '../types';

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export const STATUS_CONFIG: Record<
  TestStatus,
  { label: string; color: string; bg: string; border: string; hex: string }
> = {
  passed: {
    label: 'Passed',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    hex: '#10b981',
  },
  failed: {
    label: 'Failed',
    color: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-200',
    hex: '#ef4444',
  },
  skipped: {
    label: 'Skipped',
    color: 'text-slate-600',
    bg: 'bg-slate-100',
    border: 'border-slate-200',
    hex: '#6b7280',
  },
  flaky: {
    label: 'Flaky',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    hex: '#f59e0b',
  },
};

export const ERROR_CATEGORY_CONFIG: Record<
  ErrorCategory,
  { label: string; icon: string; hex: string }
> = {
  assertion: { label: 'Assertion Failures', icon: '⚡', hex: '#f59e0b' },
  timeout: { label: 'Timeout Errors', icon: '⏱', hex: '#ef4444' },
  network: { label: 'Network Errors', icon: '🌐', hex: '#3b82f6' },
  'element-not-found': { label: 'Element Not Found', icon: '🔍', hex: '#8b5cf6' },
  runtime: { label: 'Runtime Errors', icon: '💥', hex: '#ec4899' },
  application: { label: 'Application Errors', icon: '⚙️', hex: '#6b7280' },
};

export function flattenTests(
  suites: import('../types').TestSuite[],
): import('../types').TestResult[] {
  return suites.flatMap((s) => [...s.tests, ...flattenTests(s.suites ?? [])]);
}

/**
 * Reads a suite's `hostname` (the JUnit run identifier) as a UI/API signal.
 * BrowserStack's browser grid ("bs-chrome") and Playwright's own local
 * browser engines ("chromium", "firefox", "webkit", ...) drive real UI runs.
 * BrowserStack's OS/browser device-matrix identifier used for API runs looks
 * like "16-latest:Windows 11-browserstack" — the colon is what sets it apart.
 */
function classifyHostname(hostname: string | undefined): 'ui' | 'api' | undefined {
  const h = hostname?.trim();
  if (!h) return undefined;
  if (h.includes(':') && /browserstack$/i.test(h)) return 'api';
  if (/^bs-/i.test(h) || /^(chromium|firefox|webkit|edge|safari)/i.test(h)) return 'ui';
  return undefined;
}

/** Suite hostname with the most tests behind it, for reports that mix projects. */
function dominantHostname(suites: import('../types').TestSuite[]): string | undefined {
  const counts = new Map<string, number>();
  for (const s of suites) {
    if (!s.hostname) continue;
    counts.set(s.hostname, (counts.get(s.hostname) ?? 0) + (s.tests.length || 1));
  }
  let dominant: string | undefined;
  let max = -1;
  counts.forEach((count, hostname) => {
    if (count > max) {
      max = count;
      dominant = hostname;
    }
  });
  return dominant;
}

/**
 * Classifies a report as 'ui' or 'api'. Primarily by the dominant suite
 * `hostname` (see classifyHostname above). Reports uploaded before hostname
 * tracking was added fall back to the dominant top-level test folder —
 * "EstimationAI" is a UI-test run, everything else is an API-test run.
 */
export function classifyReportKind(
  report: import('../types').ParsedReport,
): 'ui' | 'api' {
  const hostKind = classifyHostname(dominantHostname(report.suites));
  if (hostKind) return hostKind;

  const tests = flattenTests(report.suites);
  if (tests.length === 0) return 'api';

  const topFolderCounts = new Map<string, number>();
  for (const t of tests) {
    const normalized = t.file.replace(/\\/g, '/').replace(/^\.?\//, '');
    const top = normalized.split('/')[0] ?? '';
    topFolderCounts.set(top, (topFolderCounts.get(top) ?? 0) + 1);
  }

  let dominant = '';
  let max = -1;
  topFolderCounts.forEach((count, folder) => {
    if (count > max) {
      max = count;
      dominant = folder;
    }
  });

  return dominant.toLowerCase() === 'estimationai' ? 'ui' : 'api';
}
