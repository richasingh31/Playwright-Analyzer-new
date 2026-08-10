import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart2,
  Clock,
  Trash2,
  ArrowUpRight,
  Upload,
  Layers,
  CheckCircle2,
  XCircle,
  AlertCircle,
  SkipForward,
  CalendarRange,
  Calendar,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { reportsApi } from '../api/client';
import type { ParsedReport, ReportSummary } from '../types';
import { formatDuration, formatDate, classifyReportKind } from '../utils/helpers';
import { TrendsLineChart } from '../components/charts/TrendsLineChart';
import { StatusDonutChart } from '../components/charts/StatusDonutChart';
import { PassRateLineTrendChart } from '../components/charts/PassRateLineTrendChart';
import { DurationTrendChart } from '../components/trends/DurationTrendChart';
import { FailuresByFolderCard } from '../components/trends/FailuresByFolderCard';
import { TopFailuresCard } from '../components/trends/TopFailuresCard';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { FullPageSpinner, ErrorState } from '../components/ui/Spinner';
import { UploadReportModal } from '../components/upload/UploadReportModal';
import { ReportKindSelect, type ReportKind } from '../components/ui/ReportKindSelect';
import { ExportPDFButton } from '../components/ui/ExportPDFButton';
import { exportTrendsPDF } from '../utils/pdfExport';
import { useEnvironment } from '../context/EnvironmentContext';

function reportTime(r: ReportSummary): number {
  return r.startTime ?? new Date(r.uploadedAt).getTime();
}

function fullReportTime(r: ParsedReport): number {
  return r.metadata?.startTime ?? new Date(r.uploadedAt).getTime();
}

function toDateInputValue(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function formatRangeDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatRangeLabel(dateFrom: string, dateTo: string): string {
  if (dateFrom && dateTo) return `${formatRangeDate(dateFrom)} – ${formatRangeDate(dateTo)}`;
  if (dateFrom) return `Since ${formatRangeDate(dateFrom)}`;
  if (dateTo) return `Through ${formatRangeDate(dateTo)}`;
  return 'All Reports';
}

// ── Mini pass-rate sparkle badge ──────────────────────────────────────────────
function PassRateBadge({ rate }: { rate: number }) {
  const color =
    rate >= 90
      ? 'text-emerald-600 bg-emerald-500/10 border-emerald-500/30'
      : rate >= 70
      ? 'text-amber-600 bg-amber-500/10 border-amber-500/30'
      : 'text-red-600 bg-red-500/10 border-red-500/30';

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${color}`}>
      {rate}%
    </span>
  );
}

// ── Trend arrow between two reports ──────────────────────────────────────────
function TrendArrow({ current, prev }: { current: number; prev: number }) {
  const delta = current - prev;
  if (Math.abs(delta) < 1) return <Minus className="h-4 w-4 text-slate-500" />;
  return delta > 0 ? (
    <span className="flex items-center gap-0.5 text-xs text-emerald-600">
      <TrendingUp className="h-3.5 w-3.5" />+{delta.toFixed(0)}%
    </span>
  ) : (
    <span className="flex items-center gap-0.5 text-xs text-red-600">
      <TrendingDown className="h-3.5 w-3.5" />{delta.toFixed(0)}%
    </span>
  );
}

// ── Summary metric card ───────────────────────────────────────────────────────
const METRIC_TONES = {
  neutral: { text: 'text-slate-900', badge: 'bg-slate-100 text-slate-500', bg: undefined, border: undefined },
  emerald: {
    text: 'text-emerald-600',
    badge: 'bg-emerald-500/10 text-emerald-600',
    bg: 'rgba(16,185,129,0.05)',
    border: 'rgba(16,185,129,0.3)',
  },
  red: {
    text: 'text-red-600',
    badge: 'bg-red-500/10 text-red-600',
    bg: 'rgba(239,68,68,0.05)',
    border: 'rgba(239,68,68,0.3)',
  },
} as const;

function MetricCard({
  icon,
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  icon?: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  tone?: keyof typeof METRIC_TONES;
}) {
  const palette = METRIC_TONES[tone];
  return (
    <Card
      className="text-center py-5"
      style={{ backgroundColor: palette.bg, borderColor: palette.border }}
    >
      {icon && (
        <div className={`mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full ${palette.badge}`}>
          {icon}
        </div>
      )}
      <p className={`text-3xl font-bold ${palette.text}`}>{value}</p>
      <p className="text-sm text-slate-600 mt-1">{label}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </Card>
  );
}

// ── Latest-run KPI card ────────────────────────────────────────────────────────
function KpiDelta({
  current,
  previous,
  invert = false,
}: {
  current: number;
  previous?: number;
  invert?: boolean;
}) {
  if (previous === undefined) {
    return <span className="text-[11px] text-slate-400">no previous run</span>;
  }
  const delta = current - previous;
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
        <Minus className="h-3 w-3 shrink-0" /> same as last
      </span>
    );
  }
  const improved = invert ? delta < 0 : delta > 0;
  const Icon = delta > 0 ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium whitespace-nowrap ${improved ? 'text-emerald-600' : 'text-red-600'}`}>
      <Icon className="h-3 w-3 shrink-0" />
      {delta > 0 ? '+' : ''}
      {delta} vs last
    </span>
  );
}

function KpiRow({ latest, previous }: { latest: ReportSummary; previous?: ReportSummary }) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <KpiStatCard
        icon={<Layers className="h-5 w-5 text-indigo-600" />}
        tone="bg-indigo-500/10"
        label="Total Tests"
        value={latest.stats.total}
        previous={previous?.stats.total}
      />
      <KpiStatCard
        icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}
        tone="bg-emerald-500/10"
        label="Passed"
        value={latest.stats.passed}
        previous={previous?.stats.passed}
      />
      <KpiStatCard
        icon={<XCircle className="h-5 w-5 text-red-600" />}
        tone="bg-red-500/10"
        label="Failed"
        value={latest.stats.failed}
        previous={previous?.stats.failed}
        invert
      />
      <KpiStatCard
        icon={<AlertCircle className="h-5 w-5 text-amber-600" />}
        tone="bg-amber-500/10"
        label="Flaky"
        value={latest.stats.flaky}
        previous={previous?.stats.flaky}
        invert
      />
      <KpiStatCard
        icon={<SkipForward className="h-5 w-5 text-slate-500" />}
        tone="bg-slate-500/10"
        label="Skipped"
        value={latest.stats.skipped}
        previous={previous?.stats.skipped}
      />
    </div>
  );
}

function KpiStatCard({
  icon,
  tone,
  label,
  value,
  previous,
  invert,
}: {
  icon: React.ReactNode;
  tone: string;
  label: string;
  value: number;
  previous?: number;
  invert?: boolean;
}) {
  return (
    <Card className="flex flex-col items-center gap-1.5 px-2 py-4 text-center">
      <div className={`flex h-9 w-9 items-center justify-center rounded-xl shrink-0 ${tone}`}>{icon}</div>
      <p className="text-xl font-bold text-slate-900 leading-tight tabular-nums">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
      <KpiDelta current={value} previous={previous} invert={invert} />
    </Card>
  );
}

// ── Date range filter control ─────────────────────────────────────────────────
function DateRangeFilter({
  from,
  to,
  minDate,
  maxDate,
  onChange,
}: {
  from: string;
  to: string;
  minDate: string;
  maxDate: string;
  onChange: (from: string, to: string) => void;
}) {
  // Staged locally until "Search" is pressed, so edits to one field don't
  // re-filter the whole page before the range is actually complete.
  const [pendingFrom, setPendingFrom] = useState(from);
  const [pendingTo, setPendingTo] = useState(to);

  useEffect(() => {
    setPendingFrom(from);
    setPendingTo(to);
  }, [from, to]);

  const applyFilter = () => onChange(pendingFrom, pendingTo);

  const clearFilter = () => {
    setPendingFrom('');
    setPendingTo('');
    onChange('', '');
  };

  const submitOnEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') applyFilter();
  };

  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-indigo-600">
        <CalendarRange className="h-4 w-4" /> Date Range
      </span>

      <div className="flex items-center rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white shadow-sm overflow-hidden transition-all duration-150 hover:shadow-md focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-500/15">
        <div className="relative">
          <Calendar className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-indigo-400" />
          <input
            type="date"
            value={pendingFrom}
            min={minDate}
            max={pendingTo || maxDate}
            onChange={(e) => setPendingFrom(e.target.value)}
            onKeyDown={submitOnEnter}
            className="bg-transparent py-2.5 pl-9 pr-2 text-sm font-medium text-slate-700 focus:outline-none"
          />
        </div>
        <span className="px-1 text-sm font-bold text-indigo-300">→</span>
        <div className="relative">
          <Calendar className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-indigo-400" />
          <input
            type="date"
            value={pendingTo}
            min={pendingFrom || minDate}
            max={maxDate}
            onChange={(e) => setPendingTo(e.target.value)}
            onKeyDown={submitOnEnter}
            className="bg-transparent py-2.5 pl-9 pr-3 text-sm font-medium text-slate-700 focus:outline-none"
          />
        </div>
      </div>

      <Button size="sm" onClick={applyFilter} icon={<Search className="h-3.5 w-3.5" />}>
        Search
      </Button>

      {(from || to) && (
        <button
          onClick={clearFilter}
          className="flex items-center gap-1 rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-500 transition-colors hover:bg-red-100 hover:text-red-600"
          title="Clear date filter"
        >
          <X className="h-3.5 w-3.5" /> Clear
        </button>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export function TrendsPage() {
  const navigate = useNavigate();
  const { environment } = useEnvironment();
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [fullReports, setFullReports] = useState<ParsedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [reportKind, setReportKind] = useState<ReportKind>('api');
  const [reportsPage, setReportsPage] = useState(0);
  const REPORTS_PAGE_SIZE = 8;

  const loadReports = () => {
    return reportsApi
      .getAll()
      .then((data) => {
        const sorted = [...data].sort((a, b) => {
          const aTime = a.startTime ?? new Date(a.uploadedAt).getTime();
          const bTime = b.startTime ?? new Date(b.uploadedAt).getTime();
          return bTime - aTime;
        });
        setReports(sorted);
        return Promise.all(sorted.map((s) => reportsApi.getById(s.id)));
      })
      .then((full) => setFullReports(full))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadReports();
  }, []);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this report? This action cannot be undone.')) return;
    setDeleting(id);
    try {
      await reportsApi.delete(id);
      setReports((prev) => prev.filter((r) => r.id !== id));
      setFullReports((prev) => prev.filter((r) => r.id !== id));
    } finally {
      setDeleting(null);
    }
  };

  // Everything on this page is scoped to the globally-selected environment first.
  const envFullReports = useMemo(
    () => fullReports.filter((r) => r.environment === environment),
    [fullReports, environment],
  );

  // The Latest Run row always shows one API card and one UI card side by side,
  // regardless of the report-type toggle below — so it needs its own strictly
  // API-only subset, separate from the toggle-driven "view" used everywhere else.
  const apiFullReports = useMemo(
    () => envFullReports.filter((r) => classifyReportKind(r) !== 'ui'),
    [envFullReports],
  );
  const apiReports = useMemo(() => {
    const apiIds = new Set(apiFullReports.map((r) => r.id));
    return reports.filter((r) => apiIds.has(r.id));
  }, [reports, apiFullReports]);

  const uiFullReports = useMemo(
    () => envFullReports.filter((r) => classifyReportKind(r) === 'ui'),
    [envFullReports],
  );
  const uiReports = useMemo(() => {
    const uiIds = new Set(uiFullReports.map((r) => r.id));
    return reports.filter((r) => uiIds.has(r.id));
  }, [reports, uiFullReports]);

  // Everything below the Latest Run row (date range, avg rates, charts, heatmap,
  // top failures, all-reports table) reflects whichever kind is selected here.
  const viewFullReports = useMemo(
    () => envFullReports.filter((r) => classifyReportKind(r) === reportKind),
    [envFullReports, reportKind],
  );
  const viewReports = useMemo(() => {
    const viewIds = new Set(viewFullReports.map((r) => r.id));
    return reports.filter((r) => viewIds.has(r.id));
  }, [reports, viewFullReports]);

  // Date-range filter applied across every section of the page. Computed with useMemo
  // (rather than after the loading/error guards below) so hook order stays stable.
  const filteredReports = useMemo(() => {
    if (!dateFrom && !dateTo) return viewReports;
    const fromTs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : -Infinity;
    const toTs = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : Infinity;
    return viewReports.filter((r) => {
      const t = reportTime(r);
      return t >= fromTs && t <= toTs;
    });
  }, [viewReports, dateFrom, dateTo]);

  const filteredFullReports = useMemo(() => {
    if (!dateFrom && !dateTo) return viewFullReports;
    const fromTs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : -Infinity;
    const toTs = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : Infinity;
    return viewFullReports.filter((r) => {
      const t = fullReportTime(r);
      return t >= fromTs && t <= toTs;
    });
  }, [viewFullReports, dateFrom, dateTo]);

  // Reset to page 1 whenever the underlying report set changes shape.
  useEffect(() => {
    setReportsPage(0);
  }, [reportKind, dateFrom, dateTo, filteredReports.length]);

  const reportsPageCount = Math.max(1, Math.ceil(filteredReports.length / REPORTS_PAGE_SIZE));
  const pagedReports = filteredReports.slice(
    reportsPage * REPORTS_PAGE_SIZE,
    reportsPage * REPORTS_PAGE_SIZE + REPORTS_PAGE_SIZE,
  );

  const latestApiReport = useMemo(() => {
    return apiReports.length > 0 ? { summary: apiReports[0], full: apiFullReports[0] } : undefined;
  }, [apiReports, apiFullReports]);

  const latestUiReport = useMemo(() => {
    return uiReports.length > 0 ? { summary: uiReports[0], full: uiFullReports[0] } : undefined;
  }, [uiReports, uiFullReports]);

  if (loading) return <FullPageSpinner label="Loading trends…" />;
  if (error) return <ErrorState message={error} />;

  const avgPassRate =
    filteredReports.length > 0
      ? Math.round(filteredReports.reduce((s, r) => s + r.stats.passRate, 0) / filteredReports.length)
      : 0;

  const avgFailRate =
    filteredReports.length > 0
      ? Math.round(
          filteredReports.reduce((s, r) => s + (r.stats.total > 0 ? (r.stats.failed / r.stats.total) * 100 : 0), 0) /
            filteredReports.length,
        )
      : 0;

  const minDateVal = viewReports.length ? toDateInputValue(reportTime(viewReports[viewReports.length - 1])) : '';
  const maxDateVal = viewReports.length ? toDateInputValue(reportTime(viewReports[0])) : '';

  const rangeLabel = formatRangeLabel(dateFrom, dateTo);

  if (reports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-24 animate-fade-in">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-200 text-slate-500">
          <BarChart2 className="h-10 w-10" />
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-slate-900 mb-2">No reports yet</h2>
          <p className="text-slate-600 max-w-sm">
            Upload your first Playwright JUnit XML report to start tracking trends.
          </p>
        </div>
        <Button
          size="lg"
          icon={<Upload className="h-5 w-5" />}
          onClick={() => setShowUploadModal(true)}
        >
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

  return (
    <div className="animate-slide-up space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold uppercase tracking-wide text-slate-900">Trends</h1>
        </div>
        {filteredReports.length > 0 && (
          <ExportPDFButton onClick={() => exportTrendsPDF(filteredReports, reportKind === 'ui' ? 'UI' : 'API')} />
        )}
      </div>

      {/* Latest run snapshot — API vs UI test breakdown, independent of the date filter below */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-slate-800">Latest Runs</h2>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="API Tests"
              subtitle={latestApiReport ? latestApiReport.summary.name : 'No API test reports yet'}
              action={
                latestApiReport ? (
                  <span className="text-xs text-slate-400">
                    {formatDate(
                      latestApiReport.summary.startTime
                        ? new Date(latestApiReport.summary.startTime).toISOString()
                        : latestApiReport.summary.uploadedAt,
                    )}
                  </span>
                ) : undefined
              }
            />
            {latestApiReport ? (
              <>
                <StatusDonutChart stats={latestApiReport.summary.stats} reportId={latestApiReport.summary.id} size="sm" />
                <KpiRow latest={apiReports[0]} previous={apiReports[1]} />
              </>
            ) : (
              <p className="text-center text-sm text-slate-500 py-16">No API test reports uploaded yet.</p>
            )}
          </Card>

          <Card>
            <CardHeader
              title="UI Test (Estimation AI)"
              subtitle={latestUiReport ? latestUiReport.summary.name : 'No UI test reports yet'}
              action={
                latestUiReport ? (
                  <span className="text-xs text-slate-400">
                    {formatDate(
                      latestUiReport.summary.startTime
                        ? new Date(latestUiReport.summary.startTime).toISOString()
                        : latestUiReport.summary.uploadedAt,
                    )}
                  </span>
                ) : undefined
              }
            />
            {latestUiReport ? (
              <>
                <StatusDonutChart stats={latestUiReport.summary.stats} reportId={latestUiReport.summary.id} size="sm" />
                <KpiRow latest={uiReports[0]} previous={uiReports[1]} />
              </>
            ) : (
              <p className="text-center text-sm text-slate-500 py-16">No UI test reports uploaded yet.</p>
            )}
          </Card>
        </div>
      </div>

      {/* Report type + date range filter — applies to every section below */}
      <Card className="py-5 px-5">
        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row sm:flex-wrap">
          <ReportKindSelect value={reportKind} onChange={setReportKind} />
          <div className="hidden h-8 w-px bg-slate-200 sm:block" />
          <DateRangeFilter
            from={dateFrom}
            to={dateTo}
            minDate={minDateVal}
            maxDate={maxDateVal}
            onChange={(f, t) => {
              setDateFrom(f);
              setDateTo(t);
            }}
          />
        </div>
      </Card>

      {/* Divider marking where the date-range-filtered analysis begins */}
      <div className="flex items-center gap-3 pt-2">
        <div className="h-px flex-1 bg-slate-200" />
        <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">
          <CalendarRange className="h-3.5 w-3.5 text-indigo-500" />
          {reportKind === 'ui' ? 'UI Tests' : 'API Tests'} — Analysis for {rangeLabel}
        </span>
        <div className="h-px flex-1 bg-slate-200" />
      </div>

      {filteredReports.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <CalendarRange className="h-8 w-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm">
            No {reportKind === 'ui' ? 'UI test' : 'API test'} reports in the selected date range.
          </p>
        </div>
      ) : (
        <>
      {/* Summary metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <MetricCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Avg Pass Rate"
          value={`${avgPassRate}%`}
          sub="across selected runs"
          tone="emerald"
        />
        <MetricCard
          icon={<TrendingDown className="h-4 w-4" />}
          label="Avg Fail Rate"
          value={`${avgFailRate}%`}
          sub="across selected runs"
          tone="red"
        />
      </div>

      {/* Charts row — a true 2x2 grid (not two independently-stacked columns) so cards in
          the same row always share a height, regardless of each chart's own content height */}
      {filteredReports.length > 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader
              title="Test Results by Date"
              subtitle="Pass/fail distribution — last 8 runs"
            />
            <TrendsLineChart reports={filteredReports} maxRuns={8} />
          </Card>
          <DurationTrendChart reports={filteredReports} />
          <Card>
            <CardHeader
              title={`${reportKind === 'ui' ? 'UI' : 'API'} Automation — Pass Trend`}
              subtitle="Pass rate (%), last 8 runs"
            />
            <PassRateLineTrendChart reports={filteredReports} days={8} metric="pass" />
          </Card>
          <Card>
            <CardHeader
              title={`${reportKind === 'ui' ? 'UI' : 'API'} Automation — Fail Trend`}
              subtitle="Fail rate (%), last 8 runs"
            />
            <PassRateLineTrendChart reports={filteredReports} days={8} metric="fail" />
          </Card>
        </div>
      )}

      {/* Failures by Folder */}
      <FailuresByFolderCard reports={filteredFullReports} />

      {/* Top Failing Scenarios */}
      <TopFailuresCard reports={filteredFullReports} />

      {/* Report table */}
      <Card>
        <CardHeader
          title="All Reports"
          subtitle="Click a row to open the full analysis"
          action={
            filteredReports.length > 0 ? (
              <span className="text-xs text-slate-400">
                {reportsPage * REPORTS_PAGE_SIZE + 1}–
                {Math.min(filteredReports.length, reportsPage * REPORTS_PAGE_SIZE + REPORTS_PAGE_SIZE)} of{' '}
                {filteredReports.length}
              </span>
            ) : undefined
          }
        />

        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-300/60">
                <th className="pb-3 px-2 font-medium">Report</th>
                <th className="pb-3 px-2 font-medium">Date</th>
                <th className="pb-3 px-2 font-medium text-center">Pass Rate</th>
                <th className="pb-3 px-2 font-medium text-center">Total</th>
                <th className="pb-3 px-2 font-medium text-center">Passed</th>
                <th className="pb-3 px-2 font-medium text-center">Failed</th>
                <th className="pb-3 px-2 font-medium text-center">Skipped</th>
                <th className="pb-3 px-2 font-medium text-center">Flaky</th>
                <th className="pb-3 px-2 font-medium text-center">Duration</th>
                <th className="pb-3 px-2 font-medium text-center">Trend</th>
                <th className="pb-3 px-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-300/40">
              {pagedReports.map((r, i) => {
                const prev = filteredReports[reportsPage * REPORTS_PAGE_SIZE + i + 1];
                return (
                  <tr
                    key={r.id}
                    onClick={() => navigate(`/analysis/${r.id}`)}
                    className="hover:bg-slate-200/40 cursor-pointer transition-colors group"
                  >
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-indigo-500/15 flex items-center justify-center shrink-0">
                          <BarChart2 className="h-4 w-4 text-indigo-600" />
                        </div>
                        <span className="font-medium text-slate-900 group-hover:text-indigo-700 transition-colors truncate max-w-[160px]">
                          {r.name}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-2 text-slate-600 whitespace-nowrap">
                      {formatDate(r.startTime ? new Date(r.startTime).toISOString() : r.uploadedAt)}
                    </td>
                    <td className="py-3 px-2 text-center">
                      <PassRateBadge rate={r.stats.passRate} />
                    </td>
                    <td className="py-3 px-2 text-center text-slate-700">{r.stats.total}</td>
                    <td className="py-3 px-2 text-center text-emerald-600 font-medium">
                      {r.stats.passed}
                    </td>
                    <td className="py-3 px-2 text-center text-red-600 font-medium">
                      {r.stats.failed}
                    </td>
                    <td className="py-3 px-2 text-center text-slate-600">
                      {r.stats.skipped}
                    </td>
                    <td className="py-3 px-2 text-center text-amber-600">
                      {r.stats.flaky}
                    </td>
                    <td className="py-3 px-2 text-center text-slate-600 font-mono text-xs">
                      <span className="flex items-center justify-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDuration(r.stats.duration)}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-center">
                      {prev ? (
                        <TrendArrow current={r.stats.passRate} prev={prev.stats.passRate} />
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link
                          to={`/analysis/${r.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="p-1 rounded hover:bg-slate-300 text-slate-600 hover:text-indigo-600 transition-colors"
                          title="View analysis"
                        >
                          <ArrowUpRight className="h-4 w-4" />
                        </Link>
                        <button
                          onClick={(e) => handleDelete(r.id, e)}
                          disabled={deleting === r.id}
                          className="p-1 rounded hover:bg-red-500/15 text-slate-500 hover:text-red-600 transition-colors disabled:opacity-40"
                          title="Delete report"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {reportsPageCount > 1 && (
          <div className="flex items-center justify-center gap-3 pt-4">
            <button
              onClick={() => setReportsPage((p) => Math.max(0, p - 1))}
              disabled={reportsPage === 0}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </button>
            <span className="text-xs font-medium text-slate-500 tabular-nums">
              Page {reportsPage + 1} of {reportsPageCount}
            </span>
            <button
              onClick={() => setReportsPage((p) => Math.min(reportsPageCount - 1, p + 1))}
              disabled={reportsPage >= reportsPageCount - 1}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </Card>
        </>
      )}
    </div>
  );
}
