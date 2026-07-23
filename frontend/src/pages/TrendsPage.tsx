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
  X,
} from 'lucide-react';
import { reportsApi } from '../api/client';
import type { ParsedReport, ReportSummary } from '../types';
import { formatDuration, formatDate } from '../utils/helpers';
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

function reportTime(r: ReportSummary): number {
  return r.startTime ?? new Date(r.uploadedAt).getTime();
}

function fullReportTime(r: ParsedReport): number {
  return r.metadata?.startTime ?? new Date(r.uploadedAt).getTime();
}

function toDateInputValue(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
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
function MetricCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <Card className="text-center py-5">
      <p className="text-3xl font-bold text-slate-900">{value}</p>
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
    return <span className="text-xs text-slate-400">no previous run</span>;
  }
  const delta = current - previous;
  if (delta === 0) {
    return (
      <span className="flex items-center gap-1 text-xs text-slate-500">
        <Minus className="h-3 w-3" /> same as last run
      </span>
    );
  }
  const improved = invert ? delta < 0 : delta > 0;
  const Icon = delta > 0 ? TrendingUp : TrendingDown;
  return (
    <span className={`flex items-center gap-1 text-xs font-medium ${improved ? 'text-emerald-600' : 'text-red-600'}`}>
      <Icon className="h-3 w-3" />
      {delta > 0 ? '+' : ''}
      {delta} vs last run
    </span>
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
    <Card className="py-4 px-4">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl shrink-0 ${tone}`}>{icon}</div>
        <div className="min-w-0">
          <p className="text-2xl font-bold text-slate-900 leading-tight tabular-nums">{value}</p>
          <p className="text-xs text-slate-500">{label}</p>
        </div>
      </div>
      <div className="mt-2.5 pl-[52px]">
        <KpiDelta current={value} previous={previous} invert={invert} />
      </div>
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
  return (
    <div className="flex items-center gap-2 text-xs flex-wrap">
      <span className="flex items-center gap-1.5 text-slate-500 font-medium shrink-0">
        <CalendarRange className="h-3.5 w-3.5" /> Date range
      </span>
      <input
        type="date"
        value={from}
        min={minDate}
        max={to || maxDate}
        onChange={(e) => onChange(e.target.value, to)}
        className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-slate-700 focus:outline-none focus:border-indigo-500 transition-colors"
      />
      <span className="text-slate-400">to</span>
      <input
        type="date"
        value={to}
        min={from || minDate}
        max={maxDate}
        onChange={(e) => onChange(from, e.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-slate-700 focus:outline-none focus:border-indigo-500 transition-colors"
      />
      {(from || to) && (
        <button
          onClick={() => onChange('', '')}
          className="flex items-center gap-1 text-slate-400 hover:text-slate-600 transition-colors"
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
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [fullReports, setFullReports] = useState<ParsedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

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

  // Date-range filter applied across every section of the page. Computed with useMemo
  // (rather than after the loading/error guards below) so hook order stays stable.
  const filteredReports = useMemo(() => {
    if (!dateFrom && !dateTo) return reports;
    const fromTs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : -Infinity;
    const toTs = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : Infinity;
    return reports.filter((r) => {
      const t = reportTime(r);
      return t >= fromTs && t <= toTs;
    });
  }, [reports, dateFrom, dateTo]);

  const filteredFullReports = useMemo(() => {
    if (!dateFrom && !dateTo) return fullReports;
    const fromTs = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : -Infinity;
    const toTs = dateTo ? new Date(`${dateTo}T23:59:59.999`).getTime() : Infinity;
    return fullReports.filter((r) => {
      const t = fullReportTime(r);
      return t >= fromTs && t <= toTs;
    });
  }, [fullReports, dateFrom, dateTo]);

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

  const minDateVal = reports.length ? toDateInputValue(reportTime(reports[reports.length - 1])) : '';
  const maxDateVal = reports.length ? toDateInputValue(reportTime(reports[0])) : '';

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
          <h1 className="text-2xl font-bold text-slate-900">Trends</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            icon={<Upload className="h-4 w-4" />}
            onClick={() => setShowUploadModal(true)}
          >
            Upload New
          </Button>
        </div>
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

      {/* Date range filter — applies to every section below */}
      <Card className="py-3 px-4">
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
      </Card>

      {filteredReports.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <CalendarRange className="h-8 w-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No reports in the selected date range.</p>
        </div>
      ) : (
        <>
      {/* Latest run snapshot */}
      <div className="space-y-3">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <h2 className="text-sm font-semibold text-slate-700">
            Latest Run <span className="text-slate-400 font-normal">— {filteredReports[0].name}</span>
          </h2>
          <span className="text-xs text-slate-400">
            {formatDate(filteredReports[0].startTime ? new Date(filteredReports[0].startTime).toISOString() : filteredReports[0].uploadedAt)}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr]">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <KpiStatCard
              icon={<Layers className="h-5 w-5 text-indigo-600" />}
              tone="bg-indigo-500/10"
              label="Total Tests"
              value={filteredReports[0].stats.total}
              previous={filteredReports[1]?.stats.total}
            />
            <KpiStatCard
              icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}
              tone="bg-emerald-500/10"
              label="Passed"
              value={filteredReports[0].stats.passed}
              previous={filteredReports[1]?.stats.passed}
            />
            <KpiStatCard
              icon={<XCircle className="h-5 w-5 text-red-600" />}
              tone="bg-red-500/10"
              label="Failed"
              value={filteredReports[0].stats.failed}
              previous={filteredReports[1]?.stats.failed}
              invert
            />
            <KpiStatCard
              icon={<AlertCircle className="h-5 w-5 text-amber-600" />}
              tone="bg-amber-500/10"
              label="Flaky"
              value={filteredReports[0].stats.flaky}
              previous={filteredReports[1]?.stats.flaky}
              invert
            />
            <KpiStatCard
              icon={<SkipForward className="h-5 w-5 text-slate-500" />}
              tone="bg-slate-500/10"
              label="Skipped"
              value={filteredReports[0].stats.skipped}
              previous={filteredReports[1]?.stats.skipped}
            />
          </div>

          <Card>
            <CardHeader title="Latest Run Status" subtitle="Pass/fail breakdown of the most recent upload" />
            <StatusDonutChart stats={filteredReports[0].stats} reportId={filteredReports[0].id} />
          </Card>
        </div>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <MetricCard
          label="Avg Pass Rate"
          value={`${avgPassRate}%`}
          sub="across all runs"
        />
        <MetricCard
          label="Avg Fail Rate"
          value={`${avgFailRate}%`}
          sub="across all runs"
        />
      </div>

      {/* Charts row */}
      {filteredReports.length > 1 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <Card>
              <CardHeader
                title="Test Results by Date"
                subtitle="Pass/fail distribution across all runs"
              />
              <TrendsLineChart reports={filteredReports} />
            </Card>
            <Card>
              <CardHeader
                title="API Automation — Pass Trend"
                subtitle="Pass rate (%), last 5 runs"
              />
              <PassRateLineTrendChart reports={filteredReports} days={5} metric="pass" />
            </Card>
          </div>
          <div className="space-y-6">
            <DurationTrendChart reports={filteredReports} />
            <Card>
              <CardHeader
                title="API Automation — Fail Trend"
                subtitle="Fail rate (%), last 5 runs"
              />
              <PassRateLineTrendChart reports={filteredReports} days={5} metric="fail" />
            </Card>
          </div>
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
              {filteredReports.map((r, i) => {
                const prev = filteredReports[i + 1];
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
      </Card>
        </>
      )}
    </div>
  );
}
