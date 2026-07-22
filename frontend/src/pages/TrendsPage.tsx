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
import type { ParsedReport, ReportSummary } from '../types';
import { formatDuration, formatDate } from '../utils/helpers';
import { TrendsLineChart } from '../components/charts/TrendsLineChart';
import { DurationTrendChart } from '../components/trends/DurationTrendChart';
import { FailuresByFolderCard } from '../components/trends/FailuresByFolderCard';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { FullPageSpinner, ErrorState } from '../components/ui/Spinner';
import { UploadReportModal } from '../components/upload/UploadReportModal';

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

// ── Page ──────────────────────────────────────────────────────────────────────
export function TrendsPage() {
  const navigate = useNavigate();
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [fullReports, setFullReports] = useState<ParsedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);

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

  if (loading) return <FullPageSpinner label="Loading trends…" />;
  if (error) return <ErrorState message={error} />;

  const avgPassRate =
    reports.length > 0
      ? Math.round(reports.reduce((s, r) => s + r.stats.passRate, 0) / reports.length)
      : 0;

  const avgFailRate =
    reports.length > 0
      ? Math.round(
          reports.reduce((s, r) => s + (r.stats.total > 0 ? (r.stats.failed / r.stats.total) * 100 : 0), 0) /
            reports.length,
        )
      : 0;

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
          <p className="text-slate-600 text-sm mt-0.5">
            {reports.length} report{reports.length !== 1 ? 's' : ''} tracked
          </p>
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
      {reports.length > 1 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="Test Results by Date"
              subtitle="Pass/fail distribution across all runs"
            />
            <TrendsLineChart reports={reports} />
          </Card>
          <DurationTrendChart reports={reports} />
        </div>
      )}

      {/* Failures by Folder */}
      <FailuresByFolderCard reports={fullReports} />

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
              {reports.map((r, i) => {
                const prev = reports[i + 1];
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
    </div>
  );
}
