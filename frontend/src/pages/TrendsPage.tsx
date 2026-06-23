import { useEffect, useState } from 'react';
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
} from 'lucide-react';
import { reportsApi } from '../api/client';
import type { ReportSummary } from '../types';
import { STATUS_CONFIG, formatDuration, formatDate } from '../utils/helpers';
import { TrendsLineChart } from '../components/charts/TrendsLineChart';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { FullPageSpinner, ErrorState } from '../components/ui/Spinner';
import { clsx } from 'clsx';

// ── Mini pass-rate sparkle badge ──────────────────────────────────────────────
function PassRateBadge({ rate }: { rate: number }) {
  const color =
    rate >= 90
      ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
      : rate >= 70
      ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
      : 'text-red-400 bg-red-500/10 border-red-500/30';

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
    <span className="flex items-center gap-0.5 text-xs text-emerald-400">
      <TrendingUp className="h-3.5 w-3.5" />+{delta.toFixed(0)}%
    </span>
  ) : (
    <span className="flex items-center gap-0.5 text-xs text-red-400">
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
      <p className="text-3xl font-bold text-white">{value}</p>
      <p className="text-sm text-slate-400 mt-1">{label}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export function TrendsPage() {
  const navigate = useNavigate();
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    reportsApi
      .getAll()
      .then(setReports)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this report? This action cannot be undone.')) return;
    setDeleting(id);
    try {
      await reportsApi.delete(id);
      setReports((prev) => prev.filter((r) => r.id !== id));
    } finally {
      setDeleting(null);
    }
  };

  if (loading) return <FullPageSpinner label="Loading trends…" />;
  if (error) return <ErrorState message={error} />;

  const avgPassRate =
    reports.length > 0
      ? Math.round(reports.reduce((s, r) => s + r.stats.passRate, 0) / reports.length)
      : 0;

  const totalTests = reports.reduce((s, r) => s + r.stats.total, 0);
  const latestReport = reports[0];

  if (reports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-24 animate-fade-in">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-800 text-slate-500">
          <BarChart2 className="h-10 w-10" />
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-2">No reports yet</h2>
          <p className="text-slate-400 max-w-sm">
            Upload your first Playwright HTML report to start tracking trends.
          </p>
        </div>
        <Button
          size="lg"
          icon={<Upload className="h-5 w-5" />}
          onClick={() => navigate('/')}
        >
          Upload First Report
        </Button>
      </div>
    );
  }

  return (
    <div className="animate-slide-up space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Trends</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {reports.length} report{reports.length !== 1 ? 's' : ''} tracked
          </p>
        </div>
        <Button
          size="sm"
          icon={<Upload className="h-4 w-4" />}
          onClick={() => navigate('/')}
        >
          Upload New
        </Button>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricCard label="Reports Analyzed" value={reports.length} />
        <MetricCard
          label="Avg Pass Rate"
          value={`${avgPassRate}%`}
          sub="across all runs"
        />
        <MetricCard
          label="Total Test Runs"
          value={totalTests.toLocaleString()}
        />
        <MetricCard
          label="Latest Pass Rate"
          value={latestReport ? `${latestReport.stats.passRate}%` : '—'}
          sub={latestReport ? formatDate(latestReport.startTime ? new Date(latestReport.startTime).toISOString() : latestReport.uploadedAt) : ''}
        />
      </div>

      {/* Trend chart */}
      {reports.length > 1 && (
        <Card>
          <CardHeader
            title="Pass Rate Over Time"
            subtitle="Each bar shows pass % (green) and fail % (red) · Dashed line at 80% pass rate"
          />
          <TrendsLineChart reports={reports} />
        </Card>
      )}

      {/* Report table */}
      <Card>
        <CardHeader
          title="All Reports"
          subtitle="Click a row to open the full analysis"
        />

        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-700/60">
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
            <tbody className="divide-y divide-slate-700/40">
              {reports.map((r, i) => {
                const prev = reports[i + 1];
                return (
                  <tr
                    key={r.id}
                    onClick={() => navigate(`/analysis/${r.id}`)}
                    className="hover:bg-slate-800/40 cursor-pointer transition-colors group"
                  >
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-lg bg-indigo-500/15 flex items-center justify-center shrink-0">
                          <BarChart2 className="h-4 w-4 text-indigo-400" />
                        </div>
                        <span className="font-medium text-white group-hover:text-indigo-300 transition-colors truncate max-w-[160px]">
                          {r.name}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-2 text-slate-400 whitespace-nowrap">
                      {formatDate(r.startTime ? new Date(r.startTime).toISOString() : r.uploadedAt)}
                    </td>
                    <td className="py-3 px-2 text-center">
                      <PassRateBadge rate={r.stats.passRate} />
                    </td>
                    <td className="py-3 px-2 text-center text-slate-300">{r.stats.total}</td>
                    <td className="py-3 px-2 text-center text-emerald-400 font-medium">
                      {r.stats.passed}
                    </td>
                    <td className="py-3 px-2 text-center text-red-400 font-medium">
                      {r.stats.failed}
                    </td>
                    <td className="py-3 px-2 text-center text-slate-400">
                      {r.stats.skipped}
                    </td>
                    <td className="py-3 px-2 text-center text-amber-400">
                      {r.stats.flaky}
                    </td>
                    <td className="py-3 px-2 text-center text-slate-400 font-mono text-xs">
                      <span className="flex items-center justify-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDuration(r.stats.duration)}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-center">
                      {prev ? (
                        <TrendArrow current={r.stats.passRate} prev={prev.stats.passRate} />
                      ) : (
                        <span className="text-xs text-slate-600">—</span>
                      )}
                    </td>
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link
                          to={`/analysis/${r.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-indigo-400 transition-colors"
                          title="View analysis"
                        >
                          <ArrowUpRight className="h-4 w-4" />
                        </Link>
                        <button
                          onClick={(e) => handleDelete(r.id, e)}
                          disabled={deleting === r.id}
                          className="p-1 rounded hover:bg-red-500/15 text-slate-500 hover:text-red-400 transition-colors disabled:opacity-40"
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
    </div>
  );
}
