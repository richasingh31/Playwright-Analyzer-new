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
