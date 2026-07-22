import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  SkipForward,
  AlertTriangle,
  Clock,
  Users,
  MousePointerClick,
} from 'lucide-react';
import { reportsApi } from '../api/client';
import type { ParsedReport, TestSuite } from '../types';
import { formatDuration, formatDate } from '../utils/helpers';
import { exportAnalysisPDF } from '../utils/pdfExport';
import { StatusDonutChart } from '../components/charts/StatusDonutChart';
import { SuiteBarChart, SuiteDetailCard } from '../components/charts/SuiteBarChart';
import { Card, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { FullPageSpinner, ErrorState } from '../components/ui/Spinner';
import { ExportPDFButton } from '../components/ui/ExportPDFButton';
import { ExecutiveSummary } from '../components/analysis/ExecutiveSummary';

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon,
  color,
  onClick,
}: {
  label: string;
  value: number | string;
  sub?: string;
  icon: React.ReactNode;
  color: string;
  onClick?: () => void;
}) {
  return (
    <Card
      hoverable={!!onClick}
      onClick={onClick}
      className="flex items-center gap-4 py-4"
    >
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${color}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        <p className="text-xs text-slate-600">{label}</p>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function AnalysisPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [report, setReport] = useState<ParsedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedSuite, setSelectedSuite] = useState<TestSuite | null>(null);

  useEffect(() => {
    if (!id) return;
    setSelectedSuite(null);
    reportsApi
      .getById(id)
      .then(setReport)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <FullPageSpinner label="Loading analysis…" />;
  if (error) return <ErrorState message={error} />;
  if (!report) return null;

  const { stats, suites } = report;

  return (
    <div className="animate-slide-up space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start gap-4">
        <Button
          variant="ghost"
          size="sm"
          icon={<ArrowLeft className="h-4 w-4" />}
          onClick={() => navigate('/trends')}
        >
          All Reports
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-slate-900 truncate">Reports by Date</h1>
          <div className="flex items-center gap-4 mt-1 text-xs text-slate-600">
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {formatDate(report.metadata?.startTime ? new Date(report.metadata.startTime).toISOString() : report.uploadedAt)}
            </span>
            {report.metadata?.workers && (
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {report.metadata.workers} workers
              </span>
            )}
          </div>
        </div>

        {/* Export button */}
        <div className="flex items-center gap-3 shrink-0">
          <ExportPDFButton onClick={() => exportAnalysisPDF(report)} />
        </div>
      </div>

      {/* Executive summary */}
      <ExecutiveSummary report={report} />

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard
          label="Total"
          value={stats.total}
          icon={<span className="text-lg">🧪</span>}
          color="bg-slate-300/60"
          sub={formatDuration(stats.duration)}
        />
        <StatCard
          label="Passed"
          value={stats.passed}
          icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}
          color="bg-emerald-500/15"
          onClick={() => navigate(`/analysis/${id}/category/passed`)}
        />
        <StatCard
          label="Failed"
          value={stats.failed}
          icon={<XCircle className="h-5 w-5 text-red-600" />}
          color="bg-red-500/15"
          onClick={stats.failed > 0 ? () => navigate(`/analysis/${id}/category/failed`) : undefined}
        />
        <StatCard
          label="Skipped"
          value={stats.skipped}
          icon={<SkipForward className="h-5 w-5 text-slate-600" />}
          color="bg-slate-300/60"
          onClick={stats.skipped > 0 ? () => navigate(`/analysis/${id}/category/skipped`) : undefined}
        />
        <StatCard
          label="Flaky"
          value={stats.flaky}
          icon={<AlertTriangle className="h-5 w-5 text-amber-600" />}
          color="bg-amber-500/15"
          onClick={stats.flaky > 0 ? () => navigate(`/analysis/${id}/category/flaky`) : undefined}
        />
        <StatCard
          label="Duration"
          value={formatDuration(stats.duration)}
          icon={<Clock className="h-5 w-5 text-indigo-600" />}
          color="bg-indigo-500/15"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Test Status Overview"
            subtitle="Click a segment to drill into that category"
          />
          <StatusDonutChart stats={stats} reportId={id!} />

          <div className="mt-5 pt-5 border-t border-slate-200">
            {selectedSuite ? (
              <SuiteDetailCard suite={selectedSuite} onClose={() => setSelectedSuite(null)} />
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 py-8 text-center text-slate-400">
                <MousePointerClick className="h-5 w-5" />
                <p className="text-xs">Click a suite in "Results by Suite" to see its pass/fail breakdown here</p>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Results by Suite"
            subtitle="Click a suite to see its pass/fail breakdown"
          />
          <SuiteBarChart
            suites={suites}
            onSuiteSelect={(s) => setSelectedSuite((prev) => (prev?.id === s.id ? null : s))}
            selectedSuiteId={selectedSuite?.id}
          />
        </Card>
      </div>
    </div>
  );
}
