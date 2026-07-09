import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bug,
  Upload,
  AlertOctagon,
  RefreshCw,
  FolderOpen,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  Cell,
} from 'recharts';
import { reportsApi } from '../api/client';
import type { ParsedReport } from '../types';
import { flattenTests, formatDate } from '../utils/helpers';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { FullPageSpinner, ErrorState } from '../components/ui/Spinner';

// ── Types ─────────────────────────────────────────────────────────────────────

type CellStatus = 'passed' | 'failed' | 'flaky' | 'skipped' | 'missing';

interface RegressionItem {
  testKey: string;
  testLabel: string;
  file: string;
  errorMessage: string;
  errorCategory: string;
  errorStack?: string;
  latestRunName: string;
  prevRunName: string;
  latestDate: string;
  prevDate: string;
}

interface HeatmapRow {
  testKey: string;
  testLabel: string;
  statuses: CellStatus[];
  totalFailures: number;
}

interface FlakyStat {
  testKey: string;
  testLabel: string;
  flips: number;
  totalRuns: number;
  flakinessScore: number;
  passed: number;
  failed: number;
}

interface SuiteHealth {
  suiteName: string;
  passed: number;
  failed: number;
  total: number;
  failRate: number;
}

interface ErrorEvoEntry {
  date: string;
  Assertion: number;
  Timeout: number;
  Network: number;
  Element: number;
  Runtime: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CELL_STATUS_COLORS: Record<CellStatus, string> = {
  passed: '#10b981',
  failed: '#ef4444',
  flaky: '#f59e0b',
  skipped: '#334155',
  missing: '#1e293b',
};

const CELL_STATUS_LABELS: Record<CellStatus, string> = {
  passed: 'Passed',
  failed: 'Failed',
  flaky: 'Flaky',
  skipped: 'Skipped',
  missing: 'Not in run',
};

const ERROR_COLORS = {
  Assertion: '#f59e0b',
  Timeout: '#f97316',
  Network: '#3b82f6',
  Element: '#a855f7',
  Runtime: '#ef4444',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function trunc(s: string, max: number) {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function reportShortDate(r: ParsedReport): string {
  const iso = r.metadata?.startTime
    ? new Date(r.metadata.startTime).toISOString()
    : r.uploadedAt;
  return formatDate(iso).split(',')[0];
}

function suiteFailColor(rate: number) {
  if (rate >= 70) return '#ef4444';
  if (rate >= 40) return '#f97316';
  return '#f59e0b';
}

// ── Data processing ───────────────────────────────────────────────────────────

function buildPatterns(reports: ParsedReport[]) {
  const sorted = [...reports].sort((a, b) => {
    const aT = a.metadata?.startTime ?? new Date(a.uploadedAt).getTime();
    const bT = b.metadata?.startTime ?? new Date(b.uploadedAt).getTime();
    return aT - bT;
  });

  // Per-test tracking across all runs
  const testMap = new Map<string, {
    label: string;
    byReport: Map<string, CellStatus>;
  }>();

  sorted.forEach((report) => {
    const seen = new Set<string>();
    flattenTests(report.suites).forEach((test) => {
      if (seen.has(test.fullTitle)) return;
      seen.add(test.fullTitle);
      if (!testMap.has(test.fullTitle)) {
        testMap.set(test.fullTitle, { label: test.title, byReport: new Map() });
      }
      testMap.get(test.fullTitle)!.byReport.set(
        report.id,
        test.status as CellStatus,
      );
    });
  });

  // Failure counts per test
  const failCounts = new Map<string, number>();
  testMap.forEach((v, key) => {
    let n = 0;
    v.byReport.forEach((s) => { if (s === 'failed' || s === 'flaky') n++; });
    failCounts.set(key, n);
  });

  // ── Heatmap (top 15 failing, last 10 runs) ──────────────────────────────────
  const heatReports = sorted.slice(-10);
  const heatmapRows: HeatmapRow[] = Array.from(testMap.entries())
    .map(([key, v]) => ({
      testKey: key,
      testLabel: trunc(v.label, 48),
      statuses: heatReports.map((r) => v.byReport.get(r.id) ?? 'missing'),
      totalFailures: failCounts.get(key) ?? 0,
    }))
    .filter((r) => r.totalFailures > 0)
    .sort((a, b) => b.totalFailures - a.totalFailures)
    .slice(0, 15);

  // ── Flakiness (tests that change status across runs) ────────────────────────
  const flakyStats: FlakyStat[] = Array.from(testMap.entries())
    .map(([key, v]) => {
      const statusList = sorted
        .map((r) => v.byReport.get(r.id))
        .filter(Boolean) as CellStatus[];
      let flips = 0;
      for (let i = 1; i < statusList.length; i++) {
        const bad = (s: CellStatus) => s === 'failed' || s === 'flaky';
        if (bad(statusList[i - 1]) !== bad(statusList[i])) flips++;
      }
      const passed = statusList.filter((s) => s === 'passed').length;
      const failed = statusList.filter((s) => s === 'failed' || s === 'flaky').length;
      return {
        testKey: key,
        testLabel: trunc(v.label, 52),
        flips,
        totalRuns: statusList.length,
        flakinessScore: statusList.length > 1
          ? Math.round((flips / (statusList.length - 1)) * 100)
          : 0,
        passed,
        failed,
      };
    })
    .filter((t) => t.flips > 0)
    .sort((a, b) => b.flakinessScore - a.flakinessScore)
    .slice(0, 10);

  // ── Suite health ────────────────────────────────────────────────────────────
  const suiteMap = new Map<string, { passed: number; failed: number; total: number }>();
  reports.forEach((r) => {
    r.suites.forEach((s) => {
      const name = trunc(s.title || s.file, 40);
      const prev = suiteMap.get(name) ?? { passed: 0, failed: 0, total: 0 };
      suiteMap.set(name, {
        passed: prev.passed + s.stats.passed,
        failed: prev.failed + s.stats.failed,
        total: prev.total + s.stats.total,
      });
    });
  });

  const suiteHealth: SuiteHealth[] = Array.from(suiteMap.entries())
    .map(([suiteName, s]) => ({
      suiteName,
      ...s,
      failRate: s.total > 0 ? Math.round((s.failed / s.total) * 100) : 0,
    }))
    .filter((s) => s.total > 0 && s.failed > 0)
    .sort((a, b) => b.failRate - a.failRate)
    .slice(0, 10);

  // ── Error evolution ─────────────────────────────────────────────────────────
  const errorEvolution: ErrorEvoEntry[] = sorted.map((r) => {
    const entry: ErrorEvoEntry = {
      date: reportShortDate(r),
      Assertion: 0, Timeout: 0, Network: 0, Element: 0, Runtime: 0,
    };
    r.errorGroups.forEach((eg) => {
      if (eg.category === 'assertion') entry.Assertion = eg.count;
      else if (eg.category === 'timeout') entry.Timeout = eg.count;
      else if (eg.category === 'network') entry.Network = eg.count;
      else if (eg.category === 'element-not-found') entry.Element = eg.count;
      else if (eg.category === 'runtime') entry.Runtime = eg.count;
    });
    return entry;
  });

  // ── Summary stats ───────────────────────────────────────────────────────────
  const consistentlyFailing = Array.from(testMap.entries()).filter(([, v]) => {
    const statuses = sorted.map((r) => v.byReport.get(r.id)).filter(Boolean) as CellStatus[];
    return statuses.length >= 2 && statuses.every((s) => s === 'failed' || s === 'flaky');
  }).length;

  const totalErrors = (e: ErrorEvoEntry) =>
    e.Assertion + e.Timeout + e.Network + e.Element + e.Runtime;
  const errorTrend =
    sorted.length >= 2
      ? totalErrors(errorEvolution[errorEvolution.length - 1]) - totalErrors(errorEvolution[0])
      : 0;

  // ── Regression detection (passed in previous run → failed in latest run) ────
  const dateMap = new Map<string, ParsedReport[]>();
  sorted.forEach((r) => {
    const ts = r.metadata?.startTime
      ? new Date(r.metadata.startTime)
      : new Date(r.uploadedAt);
    const key = ts.toISOString().slice(0, 10);
    if (!dateMap.has(key)) dateMap.set(key, []);
    dateMap.get(key)!.push(r);
  });

  const sortedDates = Array.from(dateMap.keys()).sort();
  let regressions: RegressionItem[] = [];
  let regressionLatestDate = '';
  let regressionPrevDate = '';

  if (sortedDates.length >= 2) {
    regressionLatestDate = sortedDates[sortedDates.length - 1];
    regressionPrevDate = sortedDates[sortedDates.length - 2];
    const latestReports = dateMap.get(regressionLatestDate)!;
    const prevReports = dateMap.get(regressionPrevDate)!;

    // Build prev status map — if a test passed in any prev-date run, it counts as "was passing"
    const prevStatusMap = new Map<string, { status: 'passed' | 'failed'; runName: string }>();
    prevReports.forEach((r) => {
      flattenTests(r.suites).forEach((test) => {
        const ex = prevStatusMap.get(test.fullTitle);
        if (!ex || test.status === 'passed') {
          prevStatusMap.set(test.fullTitle, {
            status: test.status === 'passed' ? 'passed' : 'failed',
            runName: r.name,
          });
        }
      });
    });

    const seen = new Set<string>();
    latestReports.forEach((r) => {
      flattenTests(r.suites).forEach((test) => {
        if (seen.has(test.fullTitle) || test.status !== 'failed') return;
        const prev = prevStatusMap.get(test.fullTitle);
        if (!prev || prev.status !== 'passed') return;
        seen.add(test.fullTitle);
        regressions.push({
          testKey: test.fullTitle,
          testLabel: trunc(test.title, 60),
          file: test.file,
          errorMessage: test.error?.message ?? 'Unknown error',
          errorCategory: test.error?.category ?? 'unknown',
          errorStack: test.error?.stack,
          latestRunName: r.name,
          prevRunName: prev.runName,
          latestDate: regressionLatestDate,
          prevDate: regressionPrevDate,
        });
      });
    });
  }

  return {
    heatReports,
    heatmapRows,
    flakyStats,
    suiteHealth,
    errorEvolution,
    consistentlyFailing,
    flakyCount: flakyStats.length,
    worstSuite: suiteHealth[0]?.suiteName,
    worstSuiteRate: suiteHealth[0]?.failRate,
    errorTrend,
    hasErrors: errorEvolution.some((e) => totalErrors(e) > 0),
    regressions,
    regressionLatestDate,
    regressionPrevDate,
  };
}

// ── Failure Heatmap ───────────────────────────────────────────────────────────

const CELL_STATUS_BG: Record<CellStatus, string> = {
  passed: 'rgba(16,185,129,0.15)',
  failed: 'rgba(239,68,68,0.15)',
  flaky: 'rgba(245,158,11,0.15)',
  skipped: 'rgba(51,65,85,0.15)',
  missing: 'transparent',
};

function HeatCell({
  status,
  label,
  runName,
}: {
  status: CellStatus;
  label: string;
  runName: string;
}) {
  const [hovered, setHovered] = useState(false);

  const isMissing = status === 'missing';
  const color = CELL_STATUS_COLORS[status];

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 36,
        height: 36,
        borderRadius: 6,
        flexShrink: 0,
        cursor: 'default',
        position: 'relative',
        backgroundColor: hovered && !isMissing ? CELL_STATUS_BG[status] : 'transparent',
        border: isMissing
          ? '1.5px dashed rgba(100,116,139,0.18)'
          : `2px solid ${hovered ? color : color + '55'}`,
        transition: 'border-color 0.15s, background 0.15s, transform 0.1s',
        transform: hovered && !isMissing ? 'scale(1.12)' : 'scale(1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      title={isMissing ? `Not in this run — ${runName}` : `${label}\n${CELL_STATUS_LABELS[status]} — ${runName}`}
    >
      {!isMissing && (
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: '50%',
            backgroundColor: color,
            opacity: 0.9,
          }}
        />
      )}
    </div>
  );
}

function FailureHeatmap({
  rows,
  reports,
}: {
  rows: HeatmapRow[];
  reports: ParsedReport[];
}) {
  const LABEL_W = 240;
  const CELL_W = 36;
  const GAP = 6;

  if (rows.length === 0) {
    return (
      <p className="text-center text-sm text-slate-500 py-6">
        No failures detected across these runs.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: LABEL_W + reports.length * (CELL_W + GAP) + 160 }}>

        {/* Column headers */}
        <div className="flex items-end mb-4" style={{ paddingLeft: LABEL_W + 12 }}>
          {reports.map((r, idx) => (
            <div
              key={r.id}
              style={{ width: CELL_W + GAP, flexShrink: 0 }}
              className="flex flex-col items-center gap-1"
              title={r.name}
            >
              <span
                className="text-slate-500 font-mono tabular-nums"
                style={{ fontSize: 9, writingMode: 'vertical-rl', transform: 'rotate(180deg)', lineHeight: 1, whiteSpace: 'nowrap' }}
              >
                {reportShortDate(r)}
              </span>
              <div
                className="rounded-sm"
                style={{ width: 2, height: 8, backgroundColor: idx === reports.length - 1 ? '#64748b' : '#1e293b' }}
              />
            </div>
          ))}
          <div className="ml-3 text-xs text-slate-600 whitespace-nowrap self-end mb-1">failures</div>
        </div>

        {/* Rows */}
        <div className="space-y-2">
          {rows.map((row, rowIdx) => {
            const failRate = Math.round((row.totalFailures / reports.length) * 100);
            const isCritical = failRate >= 80;
            const isHigh = failRate >= 50;

            return (
              <div
                key={row.testKey}
                className="flex items-center rounded-lg px-3 py-1.5 group transition-colors"
                style={{
                  backgroundColor: rowIdx % 2 === 0 ? 'rgba(15,23,42,0.5)' : 'rgba(30,41,59,0.3)',
                }}
              >
                {/* Row index */}
                <span
                  className="text-slate-600 font-mono tabular-nums text-xs shrink-0 select-none"
                  style={{ width: 24 }}
                >
                  {rowIdx + 1}
                </span>

                {/* Test label */}
                <div
                  className="shrink-0 pr-3"
                  style={{ width: LABEL_W - 24 }}
                >
                  <div
                    className="text-sm font-medium truncate group-hover:text-white transition-colors"
                    style={{ color: isCritical ? '#fca5a5' : isHigh ? '#fdba74' : '#cbd5e1' }}
                    title={row.testKey}
                  >
                    {row.testLabel}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className="h-1 rounded-full overflow-hidden" style={{ width: 60, backgroundColor: '#1e293b' }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${failRate}%`,
                          backgroundColor: isCritical ? '#ef4444' : isHigh ? '#f97316' : '#f59e0b',
                        }}
                      />
                    </div>
                    <span
                      className="text-xs font-semibold tabular-nums"
                      style={{ color: isCritical ? '#ef4444' : isHigh ? '#f97316' : '#f59e0b', fontSize: 10 }}
                    >
                      {failRate}%
                    </span>
                  </div>
                </div>

                {/* Status cells */}
                <div className="flex items-center" style={{ gap: GAP }}>
                  {row.statuses.map((status, i) => (
                    <HeatCell
                      key={i}
                      status={status}
                      label={row.testKey}
                      runName={reports[i]?.name ?? ''}
                    />
                  ))}
                </div>

                {/* Failure count badge */}
                <div className="ml-4 shrink-0 flex items-center gap-1.5">
                  <div
                    className="flex items-center justify-center rounded-md text-xs font-bold tabular-nums px-2 py-0.5"
                    style={{
                      minWidth: 36,
                      backgroundColor: isCritical
                        ? 'rgba(239,68,68,0.15)'
                        : isHigh
                        ? 'rgba(249,115,22,0.15)'
                        : 'rgba(245,158,11,0.12)',
                      color: isCritical ? '#f87171' : isHigh ? '#fb923c' : '#fbbf24',
                      border: `1px solid ${isCritical ? 'rgba(239,68,68,0.3)' : isHigh ? 'rgba(249,115,22,0.3)' : 'rgba(245,158,11,0.25)'}`,
                    }}
                  >
                    {row.totalFailures}
                  </div>
                  <span className="text-slate-600 text-xs">fails</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-6 pt-4 border-t border-slate-700/40 flex-wrap">
          <span className="text-xs text-slate-600 uppercase tracking-wider font-medium">Legend</span>
          {(['passed', 'failed', 'flaky', 'skipped', 'missing'] as CellStatus[]).map((s) => (
            <span key={s} className="flex items-center gap-2 text-xs text-slate-400">
              {s === 'missing' ? (
                <span
                  style={{
                    display: 'inline-block',
                    width: 16,
                    height: 16,
                    borderRadius: 4,
                    border: '1.5px dashed rgba(100,116,139,0.35)',
                  }}
                />
              ) : (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 16,
                    height: 16,
                    borderRadius: 4,
                    border: `2px solid ${CELL_STATUS_COLORS[s]}55`,
                  }}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      backgroundColor: CELL_STATUS_COLORS[s],
                    }}
                  />
                </span>
              )}
              <span className="text-slate-300">{CELL_STATUS_LABELS[s]}</span>
            </span>
          ))}
          <span className="ml-auto text-xs text-slate-600">Hover a cell for details · Showing top {rows.length} failing tests across last {reports.length} runs</span>
        </div>
      </div>
    </div>
  );
}

// ── Suite Tooltip ─────────────────────────────────────────────────────────────

function SuiteTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: SuiteHealth }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-xl border border-slate-600 bg-slate-800/95 p-3 shadow-2xl text-xs max-w-xs">
      <p className="font-semibold text-white mb-2 break-all">{d.suiteName}</p>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-slate-400">Fail Rate</span>
          <span className="font-bold" style={{ color: suiteFailColor(d.failRate) }}>{d.failRate}%</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-red-400">Failed</span>
          <span className="text-red-400 font-medium">{d.failed}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-400">Total runs</span>
          <span className="text-slate-300">{d.total}</span>
        </div>
      </div>
    </div>
  );
}

// ── Error Evo Tooltip ─────────────────────────────────────────────────────────

function ErrorEvoTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const nonZero = payload.filter((p) => p.value > 0);
  if (!nonZero.length) return null;
  return (
    <div className="rounded-xl border border-slate-600 bg-slate-800/95 p-3 shadow-2xl text-xs min-w-[150px]">
      <p className="text-slate-400 mb-2">{label}</p>
      {nonZero.map((p) => (
        <div key={p.name} className="flex justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="text-white font-bold">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Regression Section ────────────────────────────────────────────────────────

const CATEGORY_STYLES: Record<string, { label: string; color: string; bg: string; border: string }> = {
  assertion:          { label: 'Assertion',    color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.3)' },
  timeout:            { label: 'Timeout',      color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.3)' },
  network:            { label: 'Network',      color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',  border: 'rgba(59,130,246,0.3)' },
  'element-not-found':{ label: 'Element',      color: '#a855f7', bg: 'rgba(168,85,247,0.1)', border: 'rgba(168,85,247,0.3)' },
  runtime:            { label: 'Runtime',      color: '#ec4899', bg: 'rgba(236,72,153,0.1)',  border: 'rgba(236,72,153,0.3)' },
  unknown:            { label: 'Unknown',      color: '#64748b', bg: 'rgba(100,116,139,0.1)', border: 'rgba(100,116,139,0.3)' },
};

function RegressionCard({ item }: { item: RegressionItem }) {
  const [expanded, setExpanded] = useState(false);
  const cat = CATEGORY_STYLES[item.errorCategory] ?? CATEGORY_STYLES.unknown;
  const shortFile = item.file.split(/[\\/]/).slice(-2).join('/');

  return (
    <div
      className="rounded-xl border transition-colors"
      style={{ borderColor: 'rgba(239,68,68,0.2)', backgroundColor: 'rgba(239,68,68,0.04)' }}
    >
      {/* Header row */}
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="mt-0.5 shrink-0">
          <XCircle className="h-4 w-4 text-red-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate" title={item.testKey}>
            {item.testLabel}
          </p>
          <p className="text-xs text-slate-500 mt-0.5 truncate" title={item.file}>
            {shortFile}
          </p>
        </div>

        {/* Category badge */}
        <span
          className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full border"
          style={{ color: cat.color, backgroundColor: cat.bg, borderColor: cat.border }}
        >
          {cat.label}
        </span>

        {/* Expand toggle */}
        {item.errorStack && (
          <button
            onClick={() => setExpanded((p) => !p)}
            className="shrink-0 text-slate-500 hover:text-slate-300 transition-colors"
            title={expanded ? 'Hide stack trace' : 'Show stack trace'}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        )}
      </div>

      {/* Error message */}
      <div className="px-4 pb-3 -mt-1">
        <p
          className="text-xs text-red-300/80 leading-relaxed"
          style={{ fontFamily: 'ui-monospace, monospace' }}
        >
          {item.errorMessage.split('\n')[0]}
        </p>
      </div>

      {/* Run comparison pill */}
      <div className="px-4 pb-3 flex items-center gap-2 flex-wrap">
        <span className="flex items-center gap-1 text-xs text-emerald-400">
          <CheckCircle2 className="h-3 w-3" />
          Passed: {item.prevDate}
        </span>
        <span className="text-slate-600 text-xs">→</span>
        <span className="flex items-center gap-1 text-xs text-red-400">
          <XCircle className="h-3 w-3" />
          Failed: {item.latestDate}
        </span>
        <span className="ml-auto text-xs text-slate-600 truncate" title={item.latestRunName}>
          in {trunc(item.latestRunName, 30)}
        </span>
      </div>

      {/* Stack trace (collapsible) */}
      {expanded && item.errorStack && (
        <div className="px-4 pb-4 border-t border-red-500/10 pt-3">
          <pre
            className="text-xs text-slate-400 whitespace-pre-wrap break-all leading-relaxed max-h-48 overflow-y-auto rounded-lg p-3"
            style={{ backgroundColor: 'rgba(0,0,0,0.25)', fontFamily: 'ui-monospace, monospace' }}
          >
            {item.errorStack}
          </pre>
        </div>
      )}
    </div>
  );
}

function RegressionSection({
  regressions,
  prevDate,
  latestDate,
}: {
  regressions: RegressionItem[];
  prevDate: string;
  latestDate: string;
}) {
  const hasRegressions = regressions.length > 0;

  return (
    <Card>
      <CardHeader
        title="New Regressions"
        subtitle={
          prevDate && latestDate
            ? `Tests that passed on ${prevDate} but failed on ${latestDate}`
            : 'Tests that passed in the previous run but failed in the latest run'
        }
      />

      {!prevDate ? (
        <p className="text-center text-sm text-slate-500 py-6">
          Upload at least 2 reports from different dates to detect regressions.
        </p>
      ) : !hasRegressions ? (
        <div className="flex flex-col items-center gap-3 py-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10">
            <CheckCircle2 className="h-6 w-6 text-emerald-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-emerald-400">No regressions detected</p>
            <p className="text-xs text-slate-500 mt-0.5">
              All tests that passed on {prevDate} still pass on {latestDate}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
            <span className="text-sm text-amber-300 font-medium">
              {regressions.length} test{regressions.length !== 1 ? 's' : ''} regressed since {prevDate}
            </span>
          </div>
          {regressions.map((item) => (
            <RegressionCard key={item.testKey} item={item} />
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Metric card ───────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  sub,
  accent = 'text-white',
  icon,
  valueClassName,
  valueTitle,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  accent?: string;
  icon: React.ReactNode;
  valueClassName?: string;
  valueTitle?: string;
}) {
  return (
    <Card className="py-4 px-4">
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</span>
        <span className={accent}>{icon}</span>
      </div>
      <div
        className={`font-bold mb-0.5 ${accent} ${valueClassName ?? 'text-2xl'}`}
        title={valueTitle}
      >
        {value}
      </div>
      {sub && (
        <div className="text-xs text-slate-500 mt-0.5 truncate" title={sub}>{sub}</div>
      )}
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function FailurePatternsPage() {
  const navigate = useNavigate();
  const [reports, setReports] = useState<ParsedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    reportsApi
      .getAll()
      .then((summaries) => Promise.all(summaries.map((s) => reportsApi.getById(s.id))))
      .then(setReports)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const data = useMemo(
    () => (reports.length > 0 ? buildPatterns(reports) : null),
    [reports],
  );

  if (loading) return <FullPageSpinner label="Analyzing failure patterns…" />;
  if (error) return <ErrorState message={error} />;

  if (reports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-24 animate-fade-in">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-800 text-slate-500">
          <Bug className="h-10 w-10" />
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-2">No reports yet</h2>
          <p className="text-slate-400 max-w-sm">
            Upload Playwright HTML reports to start analyzing failure patterns.
          </p>
        </div>
        <Button size="lg" icon={<Upload className="h-5 w-5" />} onClick={() => navigate('/')}>
          Upload First Report
        </Button>
      </div>
    );
  }

  if (!data) return null;

  const {
    heatReports,
    heatmapRows,
    suiteHealth,
    errorEvolution,
    consistentlyFailing,
    flakyCount,
    worstSuite,
    worstSuiteRate,
    errorTrend,
    hasErrors,
    regressions,
    regressionLatestDate,
    regressionPrevDate,
  } = data;

  const suiteChartH = Math.min(360, Math.max(160, suiteHealth.length * 38 + 40));

  return (
    <div className="animate-slide-up space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Failure Patterns</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Cross-run analysis across {reports.length} report{reports.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button size="sm" icon={<Upload className="h-4 w-4" />} onClick={() => navigate('/')}>
          Upload New
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <MetricCard
          label="New Regressions"
          value={regressions.length}
          sub={regressionPrevDate ? `since ${regressionPrevDate}` : 'need 2+ date groups'}
          accent={regressions.length > 0 ? 'text-amber-400' : 'text-emerald-400'}
          icon={<AlertTriangle className="h-5 w-5" />}
        />
        <MetricCard
          label="Always Failing"
          value={consistentlyFailing}
          sub="fail in every run"
          accent="text-red-400"
          icon={<AlertOctagon className="h-5 w-5" />}
        />
        <MetricCard
          label="Flaky Tests"
          value={flakyCount}
          sub="oscillate pass ↔ fail"
          accent="text-amber-400"
          icon={<RefreshCw className="h-5 w-5" />}
        />
        <MetricCard
          label="Worst Suite"
          value={worstSuite ?? '—'}
          valueTitle={worstSuite}
          valueClassName="text-sm font-semibold break-all leading-snug"
          sub={worstSuiteRate != null ? `${worstSuiteRate}% fail rate` : undefined}
          accent="text-orange-400"
          icon={<FolderOpen className="h-5 w-5" />}
        />
        <MetricCard
          label="Error Trend"
          value={errorTrend > 1 ? 'Worsening' : errorTrend < -1 ? 'Improving' : 'Stable'}
          sub="first vs latest run"
          accent={
            errorTrend > 1 ? 'text-red-400' : errorTrend < -1 ? 'text-emerald-400' : 'text-slate-400'
          }
          icon={
            errorTrend > 1 ? (
              <TrendingDown className="h-5 w-5" />
            ) : errorTrend < -1 ? (
              <TrendingUp className="h-5 w-5" />
            ) : (
              <Minus className="h-5 w-5" />
            )
          }
        />
      </div>

      {/* Regression Detector */}
      <RegressionSection
        regressions={regressions}
        prevDate={regressionPrevDate}
        latestDate={regressionLatestDate}
      />

      {/* Failure Heatmap */}
      <Card>
        <CardHeader
          title="Test Failure Heatmap"
          subtitle="Top failing tests across runs — each column is one report, hover a cell to see details"
        />
        <FailureHeatmap rows={heatmapRows} reports={heatReports} />
      </Card>

      {/* Suite Health + Error Evolution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader
            title="Suite Health"
            subtitle="Failure rate per test file across all runs"
          />
          {suiteHealth.length === 0 ? (
            <p className="text-center text-sm text-slate-500 py-6">
              No suite failures detected.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={suiteChartH}>
              <BarChart
                data={suiteHealth}
                layout="vertical"
                margin={{ top: 4, right: 52, left: 8, bottom: 4 }}
                barCategoryGap="30%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${v}%`}
                />
                <YAxis
                  type="category"
                  dataKey="suiteName"
                  width={140}
                  tick={{ fill: '#cbd5e1', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: string) => trunc(v, 20)}
                />
                <RechartsTooltip
                  content={<SuiteTooltip />}
                  cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                />
                <Bar dataKey="failRate" maxBarSize={20} radius={[0, 3, 3, 0]}>
                  {suiteHealth.map((s, i) => (
                    <Cell key={i} fill={suiteFailColor(s.failRate)} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Error Category Evolution"
            subtitle="How failure types changed across runs"
          />
          {!hasErrors || errorEvolution.length < 2 ? (
            <p className="text-center text-sm text-slate-500 py-6">
              {errorEvolution.length < 2
                ? 'Upload at least 2 reports to show evolution.'
                : 'No categorised errors found.'}
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={suiteChartH}>
              <AreaChart
                data={errorEvolution}
                margin={{ top: 8, right: 16, left: -12, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  axisLine={{ stroke: '#334155' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <RechartsTooltip content={<ErrorEvoTooltip />} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(v) => (
                    <span className="text-slate-300 text-xs">{v}</span>
                  )}
                />
                {(Object.keys(ERROR_COLORS) as (keyof typeof ERROR_COLORS)[]).map((key) => (
                  <Area
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stackId="1"
                    stroke={ERROR_COLORS[key]}
                    fill={ERROR_COLORS[key]}
                    fillOpacity={0.28}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Empty state when everything passes */}
      {heatmapRows.length === 0 && suiteHealth.length === 0 && flakyCount === 0 && (
        <Card className="text-center py-12">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 mx-auto mb-4">
            <BarChart2 className="h-8 w-8 text-emerald-400" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-1">All tests passing</h3>
          <p className="text-slate-400 text-sm">No failure patterns to display. Keep it up!</p>
        </Card>
      )}
    </div>
  );
}
