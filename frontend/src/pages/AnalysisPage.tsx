import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  SkipForward,
  AlertTriangle,
  Clock,
  Users,
  ChevronDown,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { reportsApi } from '../api/client';
import type { ParsedReport, TestSuite, TestResult } from '../types';
import { ERROR_CATEGORY_CONFIG, formatDuration, formatDate, flattenTests } from '../utils/helpers';
import { exportAnalysisPDF } from '../utils/pdfExport';
import { StatusDonutChart } from '../components/charts/StatusDonutChart';
import { SuiteBarChart } from '../components/charts/SuiteBarChart';
import { ErrorCategoryChart } from '../components/charts/ErrorCategoryChart';
import { Card, CardHeader } from '../components/ui/Card';
import { StatusBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { FullPageSpinner, ErrorState } from '../components/ui/Spinner';
import { ExportPDFButton } from '../components/ui/ExportPDFButton';
import { ExecutiveSummary } from '../components/analysis/ExecutiveSummary';
import { SmartRecommendations } from '../components/analysis/SmartRecommendations';

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
        <p className="text-2xl font-bold text-white">{value}</p>
        <p className="text-xs text-slate-400">{label}</p>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </Card>
  );
}

// ── Collapsible suite row ─────────────────────────────────────────────────────

function SuiteRow({ suite, reportId }: { suite: TestSuite; reportId: string }) {
  const [open, setOpen] = useState(false);
  const all = flattenTests([suite]);

  return (
    <div className="border border-slate-700/60 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800/60 transition-colors text-left"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
        )}
        <span className="flex-1 text-sm font-medium text-white truncate">{suite.title}</span>
        <span className="text-xs text-slate-500 font-mono shrink-0">{suite.file}</span>
        <div className="flex items-center gap-2 ml-3 shrink-0">
          {suite.stats.passed > 0 && (
            <span className="text-xs text-emerald-400">{suite.stats.passed}✓</span>
          )}
          {suite.stats.failed > 0 && (
            <span className="text-xs text-red-400">{suite.stats.failed}✗</span>
          )}
          {suite.stats.skipped > 0 && (
            <span className="text-xs text-slate-400">{suite.stats.skipped}⊘</span>
          )}
          {suite.stats.flaky > 0 && (
            <span className="text-xs text-amber-400">{suite.stats.flaky}~</span>
          )}
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-700/40 divide-y divide-slate-700/30">
          {all.map((test) => (
            <TestRow key={test.id} test={test} reportId={reportId} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Individual test row ───────────────────────────────────────────────────────

function TestRow({ test }: { test: TestResult; reportId: string }) {
  const [expanded, setExpanded] = useState(false);
  const showStack = expanded && test.error?.stack;

  return (
    <div className="px-4 py-2.5 hover:bg-slate-800/30 transition-colors">
      <div
        className="flex items-start gap-3 cursor-pointer"
        onClick={() => test.error && setExpanded((p) => !p)}
      >
        <div className="mt-0.5 shrink-0">
          <StatusBadge status={test.status} size="sm" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-200 truncate">{test.title}</p>
          {test.error && (
            <p className="text-xs text-red-400/80 mt-0.5 truncate">{test.error.message}</p>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {test.retries > 0 && (
            <span className="text-xs text-amber-400/70">↻ {test.retries}</span>
          )}
          <span className="text-xs text-slate-500 font-mono">{formatDuration(test.duration)}</span>
          {test.error && (
            <ChevronDown
              className={`h-3.5 w-3.5 text-slate-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
            />
          )}
        </div>
      </div>

      {showStack && (
        <div className="mt-2 ml-20 rounded-lg bg-slate-900/80 border border-slate-700/50 p-3 overflow-x-auto">
          <pre className="text-xs text-slate-400 font-mono leading-relaxed whitespace-pre-wrap break-all">
            {test.error?.stack}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function AnalysisPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [report, setReport] = useState<ParsedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    reportsApi
      .getById(id)
      .then(setReport)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <FullPageSpinner label="Loading analysis…" />;
  if (error) return <ErrorState message={error} />;
  if (!report) return null;

  const { stats, suites, errorGroups } = report;

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
          <h1 className="text-2xl font-bold text-white truncate">{report.name}</h1>
          <div className="flex items-center gap-4 mt-1 text-xs text-slate-400">
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

        {/* Pass rate pill + export button */}
        <div className="flex items-center gap-3 shrink-0">
          <div
            className={`flex items-center gap-2 rounded-xl px-4 py-2 border ${
              stats.passRate >= 90
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                : stats.passRate >= 70
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                : 'border-red-500/30 bg-red-500/10 text-red-400'
            }`}
          >
            <span className="text-2xl font-bold">{stats.passRate}%</span>
            <span className="text-xs opacity-70">Pass Rate</span>
          </div>
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
          color="bg-slate-700/60"
          sub={formatDuration(stats.duration)}
        />
        <StatCard
          label="Passed"
          value={stats.passed}
          icon={<CheckCircle2 className="h-5 w-5 text-emerald-400" />}
          color="bg-emerald-500/15"
          onClick={() => navigate(`/analysis/${id}/category/passed`)}
        />
        <StatCard
          label="Failed"
          value={stats.failed}
          icon={<XCircle className="h-5 w-5 text-red-400" />}
          color="bg-red-500/15"
          onClick={stats.failed > 0 ? () => navigate(`/analysis/${id}/category/failed`) : undefined}
        />
        <StatCard
          label="Skipped"
          value={stats.skipped}
          icon={<SkipForward className="h-5 w-5 text-slate-400" />}
          color="bg-slate-700/60"
          onClick={stats.skipped > 0 ? () => navigate(`/analysis/${id}/category/skipped`) : undefined}
        />
        <StatCard
          label="Flaky"
          value={stats.flaky}
          icon={<AlertTriangle className="h-5 w-5 text-amber-400" />}
          color="bg-amber-500/15"
          onClick={stats.flaky > 0 ? () => navigate(`/analysis/${id}/category/flaky`) : undefined}
        />
        <StatCard
          label="Duration"
          value={formatDuration(stats.duration)}
          icon={<Clock className="h-5 w-5 text-indigo-400" />}
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
        </Card>

        <Card>
          <CardHeader title="Results by Suite" />
          <SuiteBarChart suites={suites} />
        </Card>
      </div>

      {/* Error breakdown */}
      {errorGroups.length > 0 && (
        <Card>
          <CardHeader
            title="Failure Breakdown by Category"
            subtitle="Click a bar to filter tests by error type"
          />
          <ErrorCategoryChart errorGroups={errorGroups} reportId={id!} />

          {/* Legend chips */}
          <div className="mt-4 flex flex-wrap gap-2">
            {errorGroups.map((g) => {
              const cfg = ERROR_CATEGORY_CONFIG[g.category];
              return (
                <Link
                  key={g.category}
                  to={`/analysis/${id}/category/failed?error=${g.category}`}
                  className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:bg-slate-700"
                  style={{ borderColor: cfg.hex + '50', color: cfg.hex }}
                >
                  {cfg.icon} {g.label}
                  <span className="ml-1 font-bold">{g.count}</span>
                </Link>
              );
            })}
          </div>
        </Card>
      )}

      {/* Smart recommendations */}
      <SmartRecommendations report={report} />

      {/* Suite list */}
      <Card>
        <CardHeader
          title="Test Suites"
          subtitle={`${suites.length} suite${suites.length !== 1 ? 's' : ''} · ${stats.total} tests total`}
          action={
            <Button
              variant="ghost"
              size="sm"
              icon={<ExternalLink className="h-3.5 w-3.5" />}
              onClick={() => navigate(`/analysis/${id}/category/failed`)}
            >
              View failures
            </Button>
          }
        />
        <div className="space-y-2">
          {suites.map((s) => (
            <SuiteRow key={s.id} suite={s} reportId={id!} />
          ))}
        </div>
      </Card>
    </div>
  );
}
