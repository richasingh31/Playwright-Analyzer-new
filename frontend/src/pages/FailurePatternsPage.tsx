import { useEffect, useState, useMemo } from 'react';
import {
  Bug,
  Upload,
  AlertOctagon,
  RefreshCw,
  BarChart2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  X,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  Cell,
  Treemap,
} from 'recharts';
import { reportsApi } from '../api/client';
import type { ParsedReport } from '../types';
import { flattenTests, formatDate } from '../utils/helpers';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { FullPageSpinner, ErrorState } from '../components/ui/Spinner';
import { UploadReportModal } from '../components/upload/UploadReportModal';

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

interface FolderLeafTest {
  title: string;
  status: CellStatus;
  errorMessage?: string;
}

interface FolderTreeNode {
  name: string;
  fullPath: string;
  children?: FolderTreeNode[];
  size?: number;
  total: number;
  failed: number;
  passed: number;
  skipped: number;
  failRate: number;
  tests?: FolderLeafTest[];
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
  Application: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ERROR_COLORS = {
  Assertion: '#f59e0b',
  Timeout: '#f97316',
  Network: '#3b82f6',
  Element: '#a855f7',
  Runtime: '#ef4444',
  Application: '#64748b',
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

// ── Folder treemap ────────────────────────────────────────────────────────────

function computeFolderStats(tests: FolderLeafTest[]) {
  const total = tests.length;
  const failed = tests.filter((t) => t.status === 'failed' || t.status === 'flaky').length;
  const passed = tests.filter((t) => t.status === 'passed').length;
  const skipped = tests.filter((t) => t.status === 'skipped').length;
  return { total, failed, passed, skipped, failRate: total > 0 ? Math.round((failed / total) * 100) : 0 };
}

function buildFolderNode(
  tests: (FolderLeafTest & { segments: string[] })[],
  depth: number,
  path: string,
  name: string,
): FolderTreeNode {
  const stats = computeFolderStats(tests);
  const deeper = tests.filter((t) => t.segments.length > depth);

  if (deeper.length === 0) {
    return {
      name,
      fullPath: path,
      size: stats.total,
      tests: tests.map(({ title, status, errorMessage }) => ({ title, status, errorMessage })),
      ...stats,
    };
  }

  const groups = new Map<string, (FolderLeafTest & { segments: string[] })[]>();
  deeper.forEach((t) => {
    const seg = t.segments[depth];
    if (!groups.has(seg)) groups.set(seg, []);
    groups.get(seg)!.push(t);
  });

  const here = tests.filter((t) => t.segments.length === depth);

  const children = Array.from(groups.entries()).map(([seg, group]) =>
    buildFolderNode(group, depth + 1, path ? `${path}/${seg}` : seg, seg),
  );

  if (here.length > 0) {
    children.push({
      name: '(other tests)',
      fullPath: path,
      size: here.length,
      tests: here.map(({ title, status, errorMessage }) => ({ title, status, errorMessage })),
      ...computeFolderStats(here),
    });
  }

  return { name, fullPath: path, children, ...stats };
}

function buildFolderTree(report: ParsedReport | undefined): FolderTreeNode[] {
  if (!report) return [];
  const tests = flattenTests(report.suites);
  if (tests.length === 0) return [];

  const withSegments = tests.map((t) => {
    const normalized = t.file.replace(/\\/g, '/').replace(/^\.?\//, '');
    const parts = normalized.split('/').filter(Boolean);
    parts.pop(); // drop the filename, keep directory segments only
    return {
      title: t.title,
      status: t.status as CellStatus,
      errorMessage: t.error?.message,
      segments: parts,
    };
  });

  // strip directory segments shared by every test so the treemap starts at the first branch
  let commonDepth = 0;
  const maxCommon = Math.min(...withSegments.map((t) => t.segments.length));
  outer: for (let i = 0; i < maxCommon; i++) {
    const seg = withSegments[0].segments[i];
    for (const t of withSegments) {
      if (t.segments[i] !== seg) break outer;
    }
    commonDepth = i + 1;
  }
  const trimmed = withSegments.map((t) => ({ ...t, segments: t.segments.slice(commonDepth) }));

  const root = buildFolderNode(trimmed, 0, '', 'All tests');
  return root.children ?? [];
}

function folderColor(failRate: number, failed: number): string {
  if (failed === 0) return '#10b981'; // reserved status green — perfectly healthy folder
  const t = Math.min(1, Math.max(0, failRate / 100));
  const from = [0xfe, 0xca, 0xca]; // red-200
  const to = [0x7f, 0x1d, 0x1d]; // red-900
  const rgb = from.map((c, i) => Math.round(c + (to[i] - c) * t));
  return `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

function folderTextColor(bgHex: string): string {
  const r = parseInt(bgHex.slice(1, 3), 16);
  const g = parseInt(bgHex.slice(3, 5), 16);
  const b = parseInt(bgHex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#1e293b' : '#ffffff';
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

  const hasFailingTests = Array.from(failCounts.values()).some((n) => n > 0);

  // ── Failures by folder (latest run) ─────────────────────────────────────────
  const latestReport = sorted[sorted.length - 1];
  const folderTree = buildFolderTree(latestReport);

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
      Assertion: 0, Timeout: 0, Network: 0, Element: 0, Runtime: 0, Application: 0,
    };
    r.errorGroups.forEach((eg) => {
      if (eg.category === 'assertion') entry.Assertion = eg.count;
      else if (eg.category === 'timeout') entry.Timeout = eg.count;
      else if (eg.category === 'network') entry.Network = eg.count;
      else if (eg.category === 'element-not-found') entry.Element = eg.count;
      else if (eg.category === 'runtime') entry.Runtime = eg.count;
      else if (eg.category === 'application') entry.Application = eg.count;
    });
    return entry;
  });

  // ── Summary stats ───────────────────────────────────────────────────────────
  const consistentlyFailing = Array.from(testMap.entries()).filter(([, v]) => {
    const statuses = sorted.map((r) => v.byReport.get(r.id)).filter(Boolean) as CellStatus[];
    return statuses.length >= 2 && statuses.every((s) => s === 'failed' || s === 'flaky');
  }).length;

  const totalErrors = (e: ErrorEvoEntry) =>
    e.Assertion + e.Timeout + e.Network + e.Element + e.Runtime + e.Application;

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
          errorCategory: test.error?.category ?? 'application',
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
    folderTree,
    latestReport,
    hasFailingTests,
    flakyStats,
    suiteHealth,
    errorEvolution,
    consistentlyFailing,
    flakyCount: flakyStats.length,
    hasErrors: errorEvolution.some((e) => totalErrors(e) > 0),
    regressions,
    regressionLatestDate,
    regressionPrevDate,
  };
}

// ── Failures by Folder (treemap) ─────────────────────────────────────────────

function TreemapTile(props: Record<string, any>) {
  const { x, y, width, height, name, children, failRate, failed, total, depth } = props;
  if (x == null || width <= 0 || height <= 0) return null;

  const isBranch = !!(children && children.length);
  const isRoot = depth === 0;
  const fill = isRoot ? 'transparent' : folderColor(failRate ?? 0, failed ?? 0);
  const txt = folderTextColor(fill === 'transparent' ? '#ffffff' : fill);
  const pad = 10;
  const showChevron = isBranch && !isRoot && width > 34 && height > 26;
  const showName = !isRoot && width > 44 && height > 24;
  const showStats = !isRoot && width > 84 && height > 46;

  const maxChars = Math.max(3, Math.floor((width - pad * 2 - (showChevron ? 16 : 0)) / 6.3));
  const label = trunc(name ?? '', maxChars);

  return (
    <g style={{ cursor: isRoot ? 'default' : 'pointer' }}>
      {!isRoot && (
        <rect
          x={x + 1.5}
          y={y + 1.5}
          width={Math.max(0, width - 3)}
          height={Math.max(0, height - 3)}
          rx={7}
          fill={fill}
          stroke="#ffffff"
          strokeWidth={2}
        />
      )}
      {showName && (
        <text
          x={x + pad}
          y={y + (showStats ? 23 : height / 2 + 4)}
          fontSize={12.5}
          fontWeight={600}
          fill={txt}
        >
          {label}
        </text>
      )}
      {showStats && (
        <text x={x + pad} y={y + height - 12} fontSize={11} fill={txt} opacity={0.9}>
          {failed > 0 ? `${failed}/${total} failing · ${failRate}%` : `${total} passing`}
        </text>
      )}
      {showChevron && (
        <polyline
          points={`${x + width - 18},${y + height / 2 - 5} ${x + width - 11},${y + height / 2} ${x + width - 18},${y + height / 2 + 5}`}
          fill="none"
          stroke={txt}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.75}
        />
      )}
    </g>
  );
}

function FolderTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: FolderTreeNode & { children?: unknown[] } }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  if (!d || d.total == null) return null;
  const color = folderColor(d.failRate, d.failed);
  return (
    <div className="rounded-xl border border-slate-400 bg-slate-200/95 p-3 shadow-2xl text-xs max-w-[220px]">
      <p className="font-semibold text-slate-900 mb-2 break-all">{d.name}</p>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-slate-600">Fail rate</span>
          <span className="font-bold" style={{ color }}>{d.failRate}%</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-red-600">Failing</span>
          <span className="text-red-600 font-medium">{d.failed}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-600">Total tests</span>
          <span className="text-slate-700">{d.total}</span>
        </div>
      </div>
      <p className="text-slate-400 mt-2 pt-2 border-t border-slate-400/40">
        {d.children && d.children.length > 0 ? 'Click to drill in' : 'Click to see failing tests'}
      </p>
    </div>
  );
}

function FolderDetailPanel({ node, onClose }: { node: FolderTreeNode; onClose: () => void }) {
  const failing = (node.tests ?? []).filter((t) => t.status === 'failed' || t.status === 'flaky');

  return (
    <div className="mt-5 pt-5 border-t border-slate-200">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-slate-900" title={node.fullPath || node.name}>
            {node.fullPath || node.name}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">{node.failed} failing of {node.total} tests</p>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 transition-colors shrink-0"
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {failing.length === 0 ? (
        <p className="text-sm text-emerald-600 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" /> All tests passing in this folder.
        </p>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
          {failing.map((t, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg px-3 py-2 bg-red-50 border border-red-100">
              <XCircle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm text-slate-800 truncate" title={t.title}>{t.title}</p>
                {t.errorMessage && (
                  <p
                    className="text-xs text-red-600/80 mt-0.5 truncate"
                    style={{ fontFamily: 'ui-monospace, monospace' }}
                    title={t.errorMessage}
                  >
                    {t.errorMessage.split('\n')[0]}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FailuresByFoldersTreemap({
  folderTree,
  latestReport,
}: {
  folderTree: FolderTreeNode[];
  latestReport?: ParsedReport;
}) {
  const [selectedLeaf, setSelectedLeaf] = useState<FolderTreeNode | null>(null);

  if (folderTree.length === 0) {
    return (
      <p className="text-center text-sm text-slate-500 py-6">
        No test files found in the latest run.
      </p>
    );
  }

  const height = Math.min(480, Math.max(300, folderTree.length * 22 + 260));

  return (
    <div>
      {/* Legend */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <span className="text-xs text-slate-500 shrink-0">Fail rate</span>
        <div className="w-full max-w-[220px]">
          <div className="flex justify-between text-[10px] text-slate-400 mb-1 font-mono">
            <span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span>
          </div>
          <div
            className="h-2 rounded-full"
            style={{ background: 'linear-gradient(to right, #7f1d1d, #b91c1c, #ef4444, #f87171, #fecaca)' }}
          />
        </div>
        <span className="flex items-center gap-1.5 text-xs text-slate-500 ml-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#10b981' }} />
          No failures
        </span>
        {latestReport && (
          <span className="ml-auto text-xs text-slate-400 truncate max-w-[240px]" title={latestReport.name}>
            Latest run · {latestReport.name}
          </span>
        )}
      </div>

      <div className="treemap-breadcrumb">
        <style>{`
          .treemap-breadcrumb .recharts-treemap-nest-index-wrapper {
            display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
            margin-top: 10px !important; text-align: left !important;
          }
          .treemap-breadcrumb .recharts-treemap-nest-index-box {
            background: #f1f5f9 !important; color: #475569 !important;
            padding: 3px 10px !important; border-radius: 9999px !important;
            font-size: 11px !important; font-weight: 500 !important;
            margin-right: 0 !important; transition: background 0.15s;
          }
          .treemap-breadcrumb .recharts-treemap-nest-index-box:hover { background: #e2e8f0 !important; }
          .treemap-breadcrumb .recharts-treemap-nest-index-box:last-child {
            background: #1e293b !important; color: #fff !important; cursor: default;
          }
        `}</style>
        <ResponsiveContainer width="100%" height={height}>
          <Treemap
            data={folderTree}
            dataKey="size"
            nameKey="name"
            type="nest"
            aspectRatio={4 / 3}
            isAnimationActive={false}
            content={<TreemapTile />}
            nestIndexContent={(item: any) => item?.name ?? 'All folders'}
            onClick={(node: any) => {
              setSelectedLeaf(!node.children || !node.children.length ? node : null);
            }}
          >
            <RechartsTooltip content={<FolderTooltip />} />
          </Treemap>
        </ResponsiveContainer>
      </div>

      {selectedLeaf && <FolderDetailPanel node={selectedLeaf} onClose={() => setSelectedLeaf(null)} />}
    </div>
  );
}

// ── Suite Tooltip ─────────────────────────────────────────────────────────────

function SuiteTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: SuiteHealth }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-xl border border-slate-400 bg-slate-200/95 p-3 shadow-2xl text-xs max-w-xs">
      <p className="font-semibold text-slate-900 mb-2 break-all">{d.suiteName}</p>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-slate-600">Fail Rate</span>
          <span className="font-bold" style={{ color: suiteFailColor(d.failRate) }}>{d.failRate}%</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-red-600">Failed</span>
          <span className="text-red-600 font-medium">{d.failed}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-600">Total runs</span>
          <span className="text-slate-700">{d.total}</span>
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
    <div className="rounded-xl border border-slate-400 bg-slate-200/95 p-3 shadow-2xl text-xs min-w-[150px]">
      <p className="text-slate-600 mb-2">{label}</p>
      {nonZero.map((p) => (
        <div key={p.name} className="flex justify-between gap-4">
          <span style={{ color: p.color }}>{p.name}</span>
          <span className="text-slate-900 font-bold">{p.value}</span>
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
  application:        { label: 'Application',  color: '#64748b', bg: 'rgba(100,116,139,0.1)', border: 'rgba(100,116,139,0.3)' },
};

function RegressionCard({ item }: { item: RegressionItem }) {
  const [expanded, setExpanded] = useState(false);
  const cat = CATEGORY_STYLES[item.errorCategory] ?? CATEGORY_STYLES.application;
  const shortFile = item.file.split(/[\\/]/).slice(-2).join('/');

  return (
    <div
      className="rounded-xl border transition-colors"
      style={{ borderColor: 'rgba(239,68,68,0.2)', backgroundColor: 'rgba(239,68,68,0.04)' }}
    >
      {/* Header row */}
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="mt-0.5 shrink-0">
          <XCircle className="h-4 w-4 text-red-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate" title={item.testKey}>
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
            className="shrink-0 text-slate-500 hover:text-slate-700 transition-colors"
            title={expanded ? 'Hide stack trace' : 'Show stack trace'}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        )}
      </div>

      {/* Error message */}
      <div className="px-4 pb-3 -mt-1">
        <p
          className="text-xs text-red-700/80 leading-relaxed"
          style={{ fontFamily: 'ui-monospace, monospace' }}
        >
          {item.errorMessage.split('\n')[0]}
        </p>
      </div>

      {/* Run comparison pill */}
      <div className="px-4 pb-3 flex items-center gap-2 flex-wrap">
        <span className="flex items-center gap-1 text-xs text-emerald-600">
          <CheckCircle2 className="h-3 w-3" />
          Passed: {item.prevDate}
        </span>
        <span className="text-slate-400 text-xs">→</span>
        <span className="flex items-center gap-1 text-xs text-red-600">
          <XCircle className="h-3 w-3" />
          Failed: {item.latestDate}
        </span>
        <span className="ml-auto text-xs text-slate-400 truncate" title={item.latestRunName}>
          in {trunc(item.latestRunName, 30)}
        </span>
      </div>

      {/* Stack trace (collapsible) */}
      {expanded && item.errorStack && (
        <div className="px-4 pb-4 border-t border-red-500/10 pt-3">
          <pre
            className="text-xs text-slate-600 whitespace-pre-wrap break-all leading-relaxed max-h-48 overflow-y-auto rounded-lg p-3"
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
        title="Newly Broken Tests"
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
            <CheckCircle2 className="h-6 w-6 text-emerald-600" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-emerald-600">No regressions detected</p>
            <p className="text-xs text-slate-500 mt-0.5">
              All tests that passed on {prevDate} still pass on {latestDate}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <span className="text-sm text-amber-700 font-medium">
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
  accent = 'text-slate-900',
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
  const [reports, setReports] = useState<ParsedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);

  const loadReports = () => {
    return reportsApi
      .getAll()
      .then((summaries) => Promise.all(summaries.map((s) => reportsApi.getById(s.id))))
      .then(setReports)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadReports();
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
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-200 text-slate-500">
          <Bug className="h-10 w-10" />
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">No reports yet</h2>
          <p className="text-slate-600 max-w-sm">
            Upload Playwright JUnit XML reports to start analyzing failure patterns.
          </p>
        </div>
        <Button size="lg" icon={<Upload className="h-5 w-5" />} onClick={() => setShowUploadModal(true)}>
          Upload First Report
        </Button>
        {showUploadModal && (
          <UploadReportModal
            onClose={() => setShowUploadModal(false)}
            onUploaded={() => {
              setShowUploadModal(false);
              loadReports();
            }}
          />
        )}
      </div>
    );
  }

  if (!data) return null;

  const {
    folderTree,
    latestReport,
    hasFailingTests,
    suiteHealth,
    errorEvolution,
    consistentlyFailing,
    flakyCount,
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
          <h1 className="text-2xl font-bold text-slate-900">Failure Patterns</h1>
          <p className="text-slate-600 text-sm mt-0.5">
            Cross-run analysis across {reports.length} report{reports.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button size="sm" icon={<Upload className="h-4 w-4" />} onClick={() => setShowUploadModal(true)}>
          Upload New
        </Button>
      </div>

      {showUploadModal && (
        <UploadReportModal
          onClose={() => setShowUploadModal(false)}
          onUploaded={() => {
            setShowUploadModal(false);
            loadReports();
          }}
        />
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          label="Newly Broken Tests"
          value={regressions.length}
          sub={regressionPrevDate ? `since ${regressionPrevDate}` : 'need 2+ date groups'}
          accent={regressions.length > 0 ? 'text-amber-600' : 'text-emerald-600'}
          icon={<AlertTriangle className="h-5 w-5" />}
        />
        <MetricCard
          label="Always Failing"
          value={consistentlyFailing}
          sub="fail in every run"
          accent="text-red-600"
          icon={<AlertOctagon className="h-5 w-5" />}
        />
        <MetricCard
          label="Flaky Tests"
          value={flakyCount}
          sub="oscillate pass ↔ fail"
          accent="text-amber-600"
          icon={<RefreshCw className="h-5 w-5" />}
        />
      </div>

      {/* Regression Detector */}
      <RegressionSection
        regressions={regressions}
        prevDate={regressionPrevDate}
        latestDate={regressionLatestDate}
      />

      {/* Failures by Folder */}
      <Card>
        <CardHeader
          title="Failures by Folder"
          subtitle="Latest run broken down by test folder — size is test volume, color is fail rate. Click a tile to drill in."
        />
        <FailuresByFoldersTreemap folderTree={folderTree} latestReport={latestReport} />
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
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  tick={{ fill: '#475569', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${v}%`}
                />
                <YAxis
                  type="category"
                  dataKey="suiteName"
                  width={140}
                  tick={{ fill: '#334155', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: string) => trunc(v, 20)}
                />
                <RechartsTooltip
                  content={<SuiteTooltip />}
                  cursor={{ fill: 'rgba(15,23,42,0.03)' }}
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
            title="Failure Types by Run"
            subtitle="How many failures of each type occurred in every report"
          />
          {!hasErrors || errorEvolution.length < 2 ? (
            <p className="text-center text-sm text-slate-500 py-6">
              {errorEvolution.length < 2
                ? 'Upload at least 2 reports to compare failure types.'
                : 'No categorised errors found.'}
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={suiteChartH}>
              <BarChart
                data={errorEvolution}
                margin={{ top: 8, right: 16, left: -12, bottom: 8 }}
                barCategoryGap="30%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#475569', fontSize: 11 }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#475569', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <RechartsTooltip content={<ErrorEvoTooltip />} cursor={{ fill: 'rgba(15,23,42,0.03)' }} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(v) => (
                    <span className="text-slate-700 text-xs">{v}</span>
                  )}
                />
                {(Object.keys(ERROR_COLORS) as (keyof typeof ERROR_COLORS)[]).map((key, i, arr) => (
                  <Bar
                    key={key}
                    dataKey={key}
                    stackId="errors"
                    fill={ERROR_COLORS[key]}
                    fillOpacity={0.85}
                    maxBarSize={48}
                    radius={i === arr.length - 1 ? [4, 4, 0, 0] : undefined}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Empty state when everything passes */}
      {!hasFailingTests && suiteHealth.length === 0 && flakyCount === 0 && (
        <Card className="text-center py-12">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 mx-auto mb-4">
            <BarChart2 className="h-8 w-8 text-emerald-600" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-1">All tests passing</h3>
          <p className="text-slate-600 text-sm">No failure patterns to display. Keep it up!</p>
        </Card>
      )}
    </div>
  );
}
