import type { RegressionItem } from '../pages/FailurePatternsPage';

function escapeCSVField(value: string): string {
  const escaped = value.replace(/"/g, '""');
  return /[",\n]/.test(value) ? `"${escaped}"` : escaped;
}

function downloadCSV(filename: string, headers: string[], rows: string[][]): void {
  const lines = [headers, ...rows].map((row) => row.map(escapeCSVField).join(','));
  const csv = lines.join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportRegressionsCSV(
  regressions: RegressionItem[],
  prevDate: string,
  latestDate: string,
): void {
  const headers = [
    'Test',
    'File',
    'Category',
    'Error Message',
    'Stack Trace',
    'Previously Passed On',
    'Previous Run',
    'Newly Failed On',
    'Latest Run',
  ];

  const rows = regressions.map((r) => [
    r.testKey,
    r.file,
    r.errorCategory,
    r.errorMessage,
    r.errorStack ?? '',
    r.prevDate,
    r.prevRunName,
    r.latestDate,
    r.latestRunName,
  ]);

  const dateRange = prevDate && latestDate ? `${prevDate}_to_${latestDate}` : new Date().toISOString().slice(0, 10);
  downloadCSV(`newly_broken_tests_${dateRange}.csv`, headers, rows);
}

// Minimal Excel-friendly export: just the API/test name and its pass/fail status
// on the two compared dates — no error details or stack traces.
export function exportRegressionsSummaryCSV(
  regressions: RegressionItem[],
  prevDate: string,
  latestDate: string,
): void {
  const headers = ['API / Test', prevDate || 'Day 1', latestDate || 'Day 2'];
  const rows = regressions.map((r) => [r.testKey, 'Passed', 'Failed']);

  const dateRange = prevDate && latestDate ? `${prevDate}_to_${latestDate}` : new Date().toISOString().slice(0, 10);
  downloadCSV(`newly_broken_tests_summary_${dateRange}.csv`, headers, rows);
}
