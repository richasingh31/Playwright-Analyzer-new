import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Clock,
  RefreshCw,
  FileCode,
  AlertTriangle,
} from 'lucide-react';
import { reportsApi } from '../api/client';
import type { ParsedReport, TestResult, TestStatus, ErrorCategory } from '../types';
import {
  STATUS_CONFIG,
  ERROR_CATEGORY_CONFIG,
  formatDuration,
  flattenTests,
} from '../utils/helpers';
import { StatusBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { FullPageSpinner, ErrorState } from '../components/ui/Spinner';
import { clsx } from 'clsx';

// ── Error category filter pills ───────────────────────────────────────────────

function CategoryPills({
  tests,
  active,
  onChange,
}: {
  tests: TestResult[];
  active: string;
  onChange: (cat: string) => void;
}) {
  const counts = new Map<string, number>();
  for (const t of tests) {
    if (t.error) {
      counts.set(t.error.category, (counts.get(t.error.category) ?? 0) + 1);
    }
  }
  if (counts.size === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => onChange('')}
        className={clsx(
          'rounded-full px-3 py-1 text-xs font-medium border transition-all',
          active === ''
            ? 'bg-indigo-600 border-indigo-500 text-white'
            : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white',
        )}
      >
        All ({tests.length})
      </button>
      {Array.from(counts.entries()).map(([cat, n]) => {
        const cfg = ERROR_CATEGORY_CONFIG[cat as ErrorCategory];
        return (
          <button
            key={cat}
            onClick={() => onChange(cat)}
            className={clsx(
              'rounded-full px-3 py-1 text-xs font-medium border transition-all',
              active === cat
                ? 'text-white'
                : 'border-slate-700 text-slate-400 hover:text-white hover:border-slate-500',
            )}
            style={
              active === cat
                ? { background: cfg.hex + '30', borderColor: cfg.hex + '60', color: cfg.hex }
                : {}
            }
          >
            {cfg.icon} {cfg.label} ({n})
          </button>
        );
      })}
    </div>
  );
}

// ── Expandable test card ──────────────────────────────────────────────────────

function TestCard({ test }: { test: TestResult }) {
  const [open, setOpen] = useState(false);
  const hasDetails = !!(test.error?.stack || test.error?.message);

  return (
    <div className="border border-slate-700/60 rounded-xl overflow-hidden">
      <button
        onClick={() => hasDetails && setOpen((p) => !p)}
        className={clsx(
          'w-full flex items-start gap-3 p-4 text-left transition-colors',
          hasDetails ? 'hover:bg-slate-800/40 cursor-pointer' : 'cursor-default',
        )}
      >
        <StatusBadge status={test.status} size="sm" />

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white">{test.title}</p>
          <p className="text-xs text-slate-500 mt-0.5 truncate">{test.fullTitle}</p>

          {test.error && (
            <div className="mt-2 flex items-start gap-1.5">
              <span
                className="text-sm"
                title={ERROR_CATEGORY_CONFIG[test.error.category].label}
              >
                {ERROR_CATEGORY_CONFIG[test.error.category].icon}
              </span>
              <p className="text-xs text-red-400/90 line-clamp-2">{test.error.message}</p>
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Clock className="h-3 w-3" />
            {formatDuration(test.duration)}
          </div>
          {test.retries > 0 && (
            <div className="flex items-center gap-1 text-xs text-amber-400">
              <RefreshCw className="h-3 w-3" />
              {test.retries} retr{test.retries === 1 ? 'y' : 'ies'}
            </div>
          )}
          {hasDetails && (
            <ChevronDown
              className={`h-4 w-4 text-slate-500 transition-transform mt-auto ${open ? 'rotate-180' : ''}`}
            />
          )}
        </div>
      </button>

      {/* File location */}
      <div className="px-4 pb-2 flex items-center gap-1.5 text-xs text-slate-600">
        <FileCode className="h-3 w-3" />
        <span className="font-mono">{test.file}{test.line ? `:${test.line}` : ''}</span>
      </div>

      {/* Expanded error detail */}
      {open && test.error && (
        <div className="border-t border-slate-700/40 p-4 bg-slate-900/60">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-sm">{ERROR_CATEGORY_CONFIG[test.error.category].icon}</span>
            <span
              className="text-xs font-semibold"
              style={{ color: ERROR_CATEGORY_CONFIG[test.error.category].hex }}
            >
              {ERROR_CATEGORY_CONFIG[test.error.category].label}
            </span>
          </div>

          <div className="rounded-lg bg-red-950/40 border border-red-500/20 p-3 mb-3">
            <p className="text-xs text-red-300 font-mono leading-relaxed">
              {test.error.message}
            </p>
          </div>

          {test.error.stack && (
            <details>
              <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-300 mb-2 select-none">
                Stack trace
              </summary>
              <div className="rounded-lg bg-slate-900 border border-slate-700/40 p-3 overflow-x-auto">
                <pre className="text-xs text-slate-400 font-mono leading-relaxed whitespace-pre-wrap break-all">
                  {test.error.stack}
                </pre>
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function DrillDownPage() {
  const { id, status } = useParams<{ id: string; status: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [report, setReport] = useState<ParsedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [errorFilter, setErrorFilter] = useState(searchParams.get('error') ?? '');

  useEffect(() => {
    if (!id) return;
    reportsApi
      .getById(id)
      .then(setReport)
      .catch((e) => setFetchError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <FullPageSpinner label="Loading tests…" />;
  if (fetchError) return <ErrorState message={fetchError} />;
  if (!report) return null;

  const allTests = flattenTests(report.suites);
  const statusFilter = (status ?? 'failed') as TestStatus;
  const cfg = STATUS_CONFIG[statusFilter];

  let filtered = allTests.filter((t) => t.status === statusFilter);
  if (errorFilter) {
    filtered = filtered.filter((t) => t.error?.category === errorFilter);
  }

  const errorTests = allTests.filter(
    (t) => t.status === statusFilter && (t.status === 'failed' || t.status === 'flaky'),
  );

  return (
    <div className="animate-slide-up space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link to="/" className="text-slate-500 hover:text-slate-300 transition-colors">
          Home
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-slate-600" />
        <Link
          to={`/analysis/${id}`}
          className="text-slate-500 hover:text-slate-300 transition-colors"
        >
          {report.name}
        </Link>
        <ChevronRight className="h-3.5 w-3.5 text-slate-600" />
        <span className={cfg.color}>{cfg.label} Tests</span>
      </div>

      {/* Header */}
      <div className="flex flex-wrap items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          icon={<ArrowLeft className="h-4 w-4" />}
          onClick={() => navigate(`/analysis/${id}`)}
        >
          Back to Analysis
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">
            {cfg.label} Tests
            <span className="ml-2 text-lg text-slate-400 font-normal">
              ({filtered.length}{errorFilter ? ` filtered from ${allTests.filter((t) => t.status === statusFilter).length}` : ''})
            </span>
          </h1>
        </div>
      </div>

      {/* Error category filter (only for failed/flaky) */}
      {(statusFilter === 'failed' || statusFilter === 'flaky') && errorTests.length > 0 && (
        <Card>
          <CardHeader title="Filter by Error Category" />
          <CategoryPills
            tests={allTests.filter((t) => t.status === statusFilter)}
            active={errorFilter}
            onChange={setErrorFilter}
          />
        </Card>
      )}

      {/* Test list */}
      {filtered.length === 0 ? (
        <Card className="text-center py-16">
          <div className="text-4xl mb-3">🎉</div>
          <p className="text-white font-semibold">No tests match this filter</p>
          <p className="text-slate-400 text-sm mt-1">Try clearing the category filter.</p>
          <Button
            variant="secondary"
            size="sm"
            className="mt-4"
            onClick={() => setErrorFilter('')}
          >
            Clear filter
          </Button>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((test) => (
            <TestCard key={test.id} test={test} />
          ))}
        </div>
      )}

      {/* Summary footer */}
      {filtered.length > 0 && (statusFilter === 'failed' || statusFilter === 'flaky') && (
        <Card className="flex items-center gap-3 py-3">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
          <p className="text-sm text-slate-300">
            <span className="text-white font-semibold">{filtered.length}</span> failing tests found.
            Total suite duration:{' '}
            <span className="text-white font-semibold">
              {formatDuration(filtered.reduce((s, t) => s + t.duration, 0))}
            </span>
          </p>
        </Card>
      )}
    </div>
  );
}
