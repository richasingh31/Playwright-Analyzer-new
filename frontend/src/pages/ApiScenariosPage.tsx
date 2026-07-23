import { useEffect, useState, useMemo } from 'react';
import {
  Upload,
  Search,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  AlertCircle,
  SkipForward,
  Grid3X3,
  FileText,
} from 'lucide-react';
import { reportsApi } from '../api/client';
import type { ParsedReport, TestResult, TestSuite, TestStatus } from '../types';
import { formatDate } from '../utils/helpers';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { FullPageSpinner, ErrorState } from '../components/ui/Spinner';
import { UploadReportModal } from '../components/upload/UploadReportModal';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RunStatus {
  status: TestStatus;
  errorMessage?: string;
  errorCategory?: string;
  errorStack?: string;
  duration: number;
}

interface ScenarioRow {
  fullTitle: string;
  title: string;
  file: string;
  runStatuses: Map<string, RunStatus>;
  latestStatus: TestStatus;
  latestError?: { message: string; category: string; stack?: string };
  failCount: number;
}

interface ApiGroup {
  apiKey: string;
  apiName: string;
  file: string;
  scenarios: ScenarioRow[];
  passCount: number;
  failCount: number;
  flakyCount: number;
  total: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_ORDER: Record<TestStatus, number> = { failed: 0, flaky: 1, passed: 2, skipped: 3 };

const DOT_COLOR: Record<TestStatus, string> = {
  passed: '#10b981',
  failed: '#ef4444',
  flaky: '#f59e0b',
  skipped: '#475569',
};

const CATEGORY_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  assertion:           { label: 'Assertion',  color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  timeout:             { label: 'Timeout',    color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  network:             { label: 'Network',    color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  'element-not-found': { label: 'Element',    color: '#a855f7', bg: 'rgba(168,85,247,0.12)' },
  runtime:             { label: 'Runtime',    color: '#ec4899', bg: 'rgba(236,72,153,0.12)' },
  application:         { label: 'Application', color: '#64748b', bg: 'rgba(100,116,139,0.12)' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getAllTests(suite: TestSuite): TestResult[] {
  return [...suite.tests, ...suite.suites.flatMap(getAllTests)];
}

function shortSuiteName(title: string, file: string): string {
  if (title) return title;
  const base = file.split(/[\\/]/).pop() ?? file;
  return base.replace(/\.spec\.(ts|js|tsx|jsx)$/, '').replace(/\.(ts|js|tsx|jsx)$/, '');
}

function dateKeyOf(report: ParsedReport): string {
  const d = new Date(report.metadata?.startTime ?? report.uploadedAt);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function buildApiGroups(reports: ParsedReport[]): {
  apiGroups: ApiGroup[];
  sortedReports: ParsedReport[];
} {
  const sorted = [...reports].sort((a, b) => {
    const aT = a.metadata?.startTime ?? new Date(a.uploadedAt).getTime();
    const bT = b.metadata?.startTime ?? new Date(b.uploadedAt).getTime();
    return aT - bT;
  });

  const apiMap = new Map<
    string,
    {
      apiName: string;
      file: string;
      scenarios: Map<
        string,
        { title: string; file: string; runStatuses: Map<string, RunStatus> }
      >;
    }
  >();

  sorted.forEach((report) => {
    report.suites.forEach((suite) => {
      const apiKey = suite.file || suite.title;
      const apiName = shortSuiteName(suite.title, suite.file);

      if (!apiMap.has(apiKey)) {
        apiMap.set(apiKey, { apiName, file: suite.file, scenarios: new Map() });
      }

      const api = apiMap.get(apiKey)!;
      getAllTests(suite).forEach((test) => {
        if (!api.scenarios.has(test.fullTitle)) {
          api.scenarios.set(test.fullTitle, {
            title: test.title,
            file: test.file,
            runStatuses: new Map(),
          });
        }
        api.scenarios.get(test.fullTitle)!.runStatuses.set(report.id, {
          status: test.status,
          errorMessage: test.error?.message,
          errorCategory: test.error?.category,
          errorStack: test.error?.stack,
          duration: test.duration,
        });
      });
    });
  });

  const apiGroups: ApiGroup[] = Array.from(apiMap.entries()).map(([apiKey, api]) => {
    const scenarios: ScenarioRow[] = Array.from(api.scenarios.entries()).map(
      ([fullTitle, s]) => {
        let latestStatus: TestStatus = 'skipped';
        let latestError: ScenarioRow['latestError'];
        let failCount = 0;

        for (const rep of sorted) {
          const rd = s.runStatuses.get(rep.id);
          if (rd) {
            latestStatus = rd.status;
            latestError = rd.errorMessage
              ? { message: rd.errorMessage, category: rd.errorCategory ?? 'application', stack: rd.errorStack }
              : undefined;
          }
        }

        s.runStatuses.forEach((rd) => {
          if (rd.status === 'failed') failCount++;
        });

        return {
          fullTitle,
          title: s.title,
          file: s.file,
          runStatuses: s.runStatuses,
          latestStatus,
          latestError,
          failCount,
        };
      },
    );

    scenarios.sort((a, b) => STATUS_ORDER[a.latestStatus] - STATUS_ORDER[b.latestStatus]);

    const passCount  = scenarios.filter((s) => s.latestStatus === 'passed').length;
    const failCount  = scenarios.filter((s) => s.latestStatus === 'failed').length;
    const flakyCount = scenarios.filter((s) => s.latestStatus === 'flaky').length;

    return {
      apiKey,
      apiName: api.apiName,
      file: api.file,
      scenarios,
      passCount,
      failCount,
      flakyCount,
      total: scenarios.length,
    };
  });

  apiGroups.sort((a, b) => b.failCount - a.failCount || a.apiName.localeCompare(b.apiName));

  return { apiGroups, sortedReports: sorted };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: TestStatus }) {
  if (status === 'passed') return <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />;
  if (status === 'failed') return <XCircle       className="h-4 w-4 text-red-600 shrink-0" />;
  if (status === 'flaky')  return <AlertCircle   className="h-4 w-4 text-amber-600 shrink-0" />;
  return                          <SkipForward   className="h-4 w-4 text-slate-500 shrink-0" />;
}

interface ReportMeta {
  id: string;
  index: number;
  label: string;
  shortLabel: string;
}

const DOT_SIZE = 8;
const DOT_GAP = 3;

function RunDots({
  runStatuses,
  reportMeta,
  hoverIdx,
  onHover,
}: {
  runStatuses: Map<string, RunStatus>;
  reportMeta: ReportMeta[];
  hoverIdx: number | null;
  onHover: (i: number | null) => void;
}) {
  if (reportMeta.length <= 1) return null;
  return (
    <div className="flex items-center shrink-0" style={{ gap: DOT_GAP }}>
      {reportMeta.map((rm) => {
        const rs = runStatuses.get(rm.id);
        const isHovered = hoverIdx === rm.index;
        const isDimmed = hoverIdx !== null && hoverIdx !== rm.index;
        return (
          <div
            key={rm.id}
            title={`#${rm.index} · ${rm.label} — ${rs ? rs.status : 'not in this run'}`}
            onMouseEnter={() => onHover(rm.index)}
            onMouseLeave={() => onHover(null)}
            style={{
              width: DOT_SIZE,
              height: DOT_SIZE,
              borderRadius: '50%',
              backgroundColor: rs ? DOT_COLOR[rs.status] : '#1e293b',
              opacity: isDimmed ? 0.2 : rs ? 0.9 : 0.25,
              border: isHovered
                ? '2px solid #6366f1'
                : rs
                  ? 'none'
                  : '1px solid #334155',
              boxSizing: 'content-box',
              transform: isHovered ? 'scale(1.15)' : undefined,
              transition: 'opacity 120ms, transform 120ms',
              cursor: 'default',
            }}
          />
        );
      })}
    </div>
  );
}

function ScenarioItem({
  scenario,
  reportMeta,
  hoverIdx,
  onHover,
}: {
  scenario: ScenarioRow;
  reportMeta: ReportMeta[];
  hoverIdx: number | null;
  onHover: (i: number | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const cat = scenario.latestError
    ? (CATEGORY_STYLE[scenario.latestError.category] ?? CATEGORY_STYLE.application)
    : null;

  return (
    <div>
      <div
        className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-200/50 transition-colors rounded-lg group cursor-default"
        onClick={() => scenario.latestError && setExpanded((p) => !p)}
        style={{ cursor: scenario.latestError ? 'pointer' : 'default' }}
      >
        <StatusIcon status={scenario.latestStatus} />

        <span
          className="flex-1 min-w-0 text-sm text-slate-800 truncate"
          title={scenario.fullTitle}
        >
          {scenario.title}
        </span>

        {/* Run history dots */}
        <RunDots runStatuses={scenario.runStatuses} reportMeta={reportMeta} hoverIdx={hoverIdx} onHover={onHover} />

        {/* Error category badge */}
        {cat && (
          <span
            className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full"
            style={{ color: cat.color, backgroundColor: cat.bg }}
          >
            {cat.label}
          </span>
        )}

        {/* Fail count across runs */}
        {scenario.failCount > 1 && reportMeta.length > 1 && (
          <span className="shrink-0 text-xs text-red-600/70 tabular-nums">
            {scenario.failCount}× failed
          </span>
        )}

        {/* Expand chevron for error details */}
        {scenario.latestError && (
          <span className="shrink-0 text-slate-400 group-hover:text-slate-600 transition-colors">
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </span>
        )}
      </div>

      {/* Error detail expansion */}
      {expanded && scenario.latestError && (
        <div className="mx-4 mb-2 rounded-lg border border-red-500/15 bg-red-500/5 px-4 py-3">
          <p
            className="text-xs text-red-700/80 leading-relaxed mb-2"
            style={{ fontFamily: 'ui-monospace, monospace' }}
          >
            {scenario.latestError.message.split('\n')[0]}
          </p>
          {scenario.latestError.stack && (
            <pre
              className="text-xs text-slate-500 whitespace-pre-wrap break-all leading-relaxed max-h-36 overflow-y-auto"
              style={{ fontFamily: 'ui-monospace, monospace' }}
            >
              {scenario.latestError.stack}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function ApiGroupBlock({
  group,
  reportMeta,
  hoverIdx,
  onHover,
  defaultOpen,
}: {
  group: ApiGroup;
  reportMeta: ReportMeta[];
  hoverIdx: number | null;
  onHover: (i: number | null) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const passRate = group.total > 0 ? Math.round((group.passCount / group.total) * 100) : 0;

  return (
    <div className="rounded-2xl border border-slate-300/60 bg-slate-200/60 overflow-hidden backdrop-blur-sm">
      {/* Group header */}
      <button
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-300/30 transition-colors text-left"
        onClick={() => setOpen((p) => !p)}
      >
        <span className="text-slate-600 shrink-0">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>

        <FileText className="h-4 w-4 text-indigo-600 shrink-0" />

        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold text-slate-900 truncate block" title={group.apiKey}>
            {group.apiName}
          </span>
          <span className="text-xs text-slate-500 truncate block" title={group.file}>
            {group.file}
          </span>
        </div>

        {/* Stats chips */}
        <div className="flex items-center gap-2 shrink-0">
          {group.failCount > 0 && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 border border-red-500/20">
              {group.failCount} failed
            </span>
          )}
          {group.flakyCount > 0 && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20">
              {group.flakyCount} flaky
            </span>
          )}
          <span className="text-xs text-slate-500">{group.total} scenarios</span>

          {/* Pass rate mini bar */}
          <div className="flex items-center gap-1.5">
            <div className="w-16 h-1.5 rounded-full bg-slate-300 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${passRate}%`,
                  backgroundColor: passRate === 100 ? '#10b981' : passRate >= 70 ? '#f59e0b' : '#ef4444',
                }}
              />
            </div>
            <span
              className="text-xs font-medium tabular-nums"
              style={{ color: passRate === 100 ? '#10b981' : passRate >= 70 ? '#f59e0b' : '#ef4444' }}
            >
              {passRate}%
            </span>
          </div>
        </div>
      </button>

      {/* Scenario list */}
      {open && (
        <div className="border-t border-slate-300/40 py-2">
          {reportMeta.length > 1 && (
            <div className="flex items-center gap-3 px-4 pb-1.5">
              <span className="flex-1 min-w-0" />
              <div className="flex items-center shrink-0" style={{ gap: DOT_GAP }}>
                {reportMeta.map((rm) => (
                  <span
                    key={rm.id}
                    title={rm.label}
                    onMouseEnter={() => onHover(rm.index)}
                    onMouseLeave={() => onHover(null)}
                    className="text-[9px] font-semibold text-center tabular-nums transition-colors"
                    style={{
                      width: DOT_SIZE,
                      color: hoverIdx === rm.index ? '#6366f1' : '#94a3b8',
                    }}
                  >
                    {rm.index}
                  </span>
                ))}
              </div>
            </div>
          )}
          {group.scenarios.map((scenario) => (
            <ScenarioItem
              key={scenario.fullTitle}
              scenario={scenario}
              reportMeta={reportMeta}
              hoverIdx={hoverIdx}
              onHover={onHover}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type StatusFilter = 'all' | TestStatus;

export function ApiScenariosPage() {
  const [reports, setReports] = useState<ParsedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [suiteFilter, setSuiteFilter] = useState<string>('all');
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

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  // Available dates across all uploaded reports, newest first
  const availableDates = useMemo(() => {
    const map = new Map<string, Date>();
    reports.forEach((r) => {
      const key = dateKeyOf(r);
      if (!map.has(key)) map.set(key, new Date(r.metadata?.startTime ?? r.uploadedAt));
    });
    return Array.from(map.entries())
      .sort((a, b) => b[1].getTime() - a[1].getTime())
      .map(([key, date]) => ({
        key,
        label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      }));
  }, [reports]);

  // Reset the date filter if the selected date no longer has any reports
  useEffect(() => {
    if (dateFilter !== 'all' && !availableDates.some((d) => d.key === dateFilter)) {
      setDateFilter('all');
    }
  }, [availableDates, dateFilter]);

  const dateFilteredReports = useMemo(
    () => (dateFilter === 'all' ? reports : reports.filter((r) => dateKeyOf(r) === dateFilter)),
    [reports, dateFilter],
  );

  const { apiGroups, sortedReports } = useMemo(
    () =>
      dateFilteredReports.length > 0
        ? buildApiGroups(dateFilteredReports)
        : { apiGroups: [], sortedReports: [] },
    [dateFilteredReports],
  );

  // Available suites for the current date selection
  const availableSuites = useMemo(
    () =>
      apiGroups
        .map((g) => ({ key: g.apiKey, name: g.apiName }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [apiGroups],
  );

  // Reset the suite filter if it no longer applies (e.g. date changed)
  useEffect(() => {
    if (suiteFilter !== 'all' && !availableSuites.some((s) => s.key === suiteFilter)) {
      setSuiteFilter('all');
    }
  }, [availableSuites, suiteFilter]);

  const reportMeta: ReportMeta[] = useMemo(() => {
    const dateOf = (r: ParsedReport) => new Date(r.metadata?.startTime ?? r.uploadedAt);
    const dayLabels = sortedReports.map((r) =>
      dateOf(r).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    );
    const timeLabels = sortedReports.map(
      (r, i) => `${dayLabels[i]}, ${dateOf(r).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
    );
    return sortedReports.map((r, i) => {
      const dayDup = dayLabels.filter((l) => l === dayLabels[i]).length > 1;
      const timeDup = timeLabels.filter((l) => l === timeLabels[i]).length > 1;
      const iso = r.metadata?.startTime ? new Date(r.metadata.startTime).toISOString() : r.uploadedAt;
      return {
        id: r.id,
        index: i + 1,
        label: `${r.name} — ${formatDate(iso)}`,
        shortLabel: !dayDup ? dayLabels[i] : timeDup ? `${timeLabels[i]} (#${i + 1})` : timeLabels[i],
      };
    });
  }, [sortedReports]);

  // Apply filters
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return apiGroups
      .filter((group) => suiteFilter === 'all' || group.apiKey === suiteFilter)
      .map((group) => {
        const scenarios = group.scenarios.filter((s) => {
          const matchStatus = statusFilter === 'all' || s.latestStatus === statusFilter;
          const matchSearch = !q || s.title.toLowerCase().includes(q) || s.fullTitle.toLowerCase().includes(q);
          return matchStatus && matchSearch;
        });
        return { ...group, scenarios };
      })
      .filter((g) => g.scenarios.length > 0);
  }, [apiGroups, search, statusFilter, suiteFilter]);

  // Summary stats
  const totals = useMemo(() => {
    const all = apiGroups.flatMap((g) => g.scenarios);
    return {
      apis: apiGroups.length,
      scenarios: all.length,
      passed: all.filter((s) => s.latestStatus === 'passed').length,
      failed: all.filter((s) => s.latestStatus === 'failed').length,
      flaky: all.filter((s) => s.latestStatus === 'flaky').length,
      skipped: all.filter((s) => s.latestStatus === 'skipped').length,
    };
  }, [apiGroups]);

  if (loading) return <FullPageSpinner label="Loading API scenarios…" />;
  if (error) return <ErrorState message={error} />;

  if (reports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-24 animate-fade-in">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-200 text-slate-500">
          <Grid3X3 className="h-10 w-10" />
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">No reports yet</h2>
          <p className="text-slate-600 max-w-sm">
            Upload Playwright JUnit XML reports to explore API and scenario combinations.
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

  const STATUS_TABS: { key: StatusFilter; label: string; count: number; color: string }[] = [
    { key: 'all',     label: 'All',     count: totals.scenarios, color: 'text-slate-700' },
    { key: 'failed',  label: 'Failed',  count: totals.failed,    color: 'text-red-600' },
    { key: 'flaky',   label: 'Flaky',   count: totals.flaky,     color: 'text-amber-600' },
    { key: 'passed',  label: 'Passed',  count: totals.passed,    color: 'text-emerald-600' },
    { key: 'skipped', label: 'Skipped', count: totals.skipped,   color: 'text-slate-500' },
  ];

  return (
    <div className="animate-slide-up space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">API &amp; Scenarios</h1>
          <p className="text-slate-600 text-sm mt-0.5">
            {totals.apis} API{totals.apis !== 1 ? 's' : ''} · {totals.scenarios} scenario{totals.scenarios !== 1 ? 's' : ''} across {dateFilteredReports.length} report{dateFilteredReports.length !== 1 ? 's' : ''}
            {dateFilter !== 'all' && (
              <> on {availableDates.find((d) => d.key === dateFilter)?.label}</>
            )}
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

      {/* Summary stat chips */}
      <div className="flex items-center gap-3 flex-wrap">
        {totals.failed > 0 && (
          <span className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full bg-red-500/10 text-red-600 border border-red-500/20">
            <XCircle className="h-3.5 w-3.5" />
            {totals.failed} failing
          </span>
        )}
        {totals.flaky > 0 && (
          <span className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20">
            <AlertCircle className="h-3.5 w-3.5" />
            {totals.flaky} flaky
          </span>
        )}
        <span className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {totals.passed} passing
        </span>
      </div>

      {/* Per-report legend — each chip is dot #N below; hover to trace that report's column down every scenario list */}
      {reportMeta.length > 1 && (
        <Card className="py-3 px-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-slate-500 shrink-0 mr-1">
              Uploads (oldest → newest, hover to trace a run):
            </span>
            {reportMeta.map((rm, i) => {
              const rep = sortedReports[i];
              const tone =
                rep.stats.passRate === 100 ? '#10b981' : rep.stats.passRate >= 70 ? '#f59e0b' : '#ef4444';
              return (
                <button
                  key={rm.id}
                  onMouseEnter={() => setHoverIdx(rm.index)}
                  onMouseLeave={() => setHoverIdx(null)}
                  title={rm.label}
                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                    hoverIdx === rm.index
                      ? 'border-indigo-500/50 bg-indigo-500/10'
                      : 'border-slate-300 bg-white hover:bg-slate-100'
                  }`}
                >
                  <span className="font-mono text-slate-400">#{rm.index}</span>
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: tone }}
                  />
                  <span className="font-medium text-slate-700">{rm.shortLabel}</span>
                  <span className="tabular-nums" style={{ color: tone }}>
                    {rep.stats.passRate}%
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {/* Filters */}
      <Card className="py-3 px-4">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search scenarios…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-100/60 border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-900 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          {/* Date dropdown */}
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="bg-slate-100/60 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 transition-colors shrink-0"
          >
            <option value="all">All dates</option>
            {availableDates.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label}
              </option>
            ))}
          </select>

          {/* Suite dropdown */}
          <select
            value={suiteFilter}
            onChange={(e) => setSuiteFilter(e.target.value)}
            className="bg-slate-100/60 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-indigo-500 transition-colors shrink-0 max-w-56"
          >
            <option value="all">All suites</option>
            {availableSuites.map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}
              </option>
            ))}
          </select>

          {/* Status tabs */}
          <div className="flex items-center gap-1">
            {STATUS_TABS.map(({ key, label, count, color }) => (
              count > 0 || key === 'all' ? (
                <button
                  key={key}
                  onClick={() => setStatusFilter(key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    statusFilter === key
                      ? 'bg-slate-300 text-slate-900'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <span className={statusFilter === key ? 'text-slate-900' : color}>{label}</span>
                  <span className={`tabular-nums ${statusFilter === key ? 'text-slate-700' : 'text-slate-400'}`}>
                    {count}
                  </span>
                </button>
              ) : null
            ))}
          </div>
        </div>
      </Card>

      {/* API groups */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Search className="h-8 w-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No scenarios match your filter.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((group, i) => (
            <ApiGroupBlock
              key={group.apiKey}
              group={group}
              reportMeta={reportMeta}
              hoverIdx={hoverIdx}
              onHover={setHoverIdx}
              defaultOpen={i === 0 || group.failCount > 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}
