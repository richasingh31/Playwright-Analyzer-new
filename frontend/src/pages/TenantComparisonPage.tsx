import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Upload,
  Users,
  CheckCircle2,
  XCircle,
  AlertCircle,
  SkipForward,
  ChevronDown,
  ChevronRight,
  GitCompare,
  ShieldAlert,
  ShieldCheck,
  Filter,
} from 'lucide-react';
import { reportsApi } from '../api/client';
import type { ParsedReport, TestStatus, TestSuite, TestResult } from '../types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { FullPageSpinner, ErrorState } from '../components/ui/Spinner';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TenantStatus {
  status: TestStatus;
  errorMessage?: string;
  errorCategory?: string;
  errorStack?: string;
  duration: number;
}

interface ScenarioTenantRow {
  fullTitle: string;
  title: string;
  file: string;
  apiName: string;
  tenantStatuses: Map<string, TenantStatus>; // tenantLabel → status
  isDivergent: boolean; // some tenants pass, some fail
  passCount: number;
  failCount: number;
}

interface SummaryStats {
  totalScenarios: number;
  allPassing: number;
  allFailing: number;
  divergent: number;
  tenants: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getAllTests(suite: TestSuite): TestResult[] {
  return [...suite.tests, ...suite.suites.flatMap(getAllTests)];
}

function parseTenantLabel(reportName: string): string {
  // Match patterns: TenantID:1, Tenant ID: 4, tenant_5, tenant-2, Tenant 3, TID:7
  const match = reportName.match(
    /(?:tenant[\s_-]?(?:id)?[\s:_-]*|TID[\s:]*|T[\s:]*#?)(\d+)/i,
  );
  if (match) return `Tenant ${match[1]}`;
  // Fallback to truncated report name
  return reportName.length > 20 ? reportName.slice(0, 20) + '…' : reportName;
}

function buildTenantData(reports: ParsedReport[]): {
  rows: ScenarioTenantRow[];
  tenants: string[];
  stats: SummaryStats;
} {
  // Determine tenant label per report (use latest report per tenant if duplicates)
  const tenantMap = new Map<string, ParsedReport>(); // tenantLabel → latest report
  reports.forEach((rep) => {
    const label = parseTenantLabel(rep.name);
    const existing = tenantMap.get(label);
    if (!existing || new Date(rep.uploadedAt) > new Date(existing.uploadedAt)) {
      tenantMap.set(label, rep);
    }
  });

  const tenants = Array.from(tenantMap.keys()).sort((a, b) => {
    // Sort numerically if both end in a number
    const na = parseInt(a.replace(/\D/g, ''), 10);
    const nb = parseInt(b.replace(/\D/g, ''), 10);
    return isNaN(na) || isNaN(nb) ? a.localeCompare(b) : na - nb;
  });

  // Build scenario → tenant status mapping
  const scenarioMap = new Map<
    string,
    {
      title: string;
      file: string;
      apiName: string;
      tenantStatuses: Map<string, TenantStatus>;
    }
  >();

  tenantMap.forEach((report, tenantLabel) => {
    report.suites.forEach((suite) => {
      const apiName = suite.title || suite.file.split(/[\\/]/).pop()?.replace(/\.spec\.(ts|js|tsx|jsx)$/, '') || suite.file;
      getAllTests(suite).forEach((test) => {
        if (!scenarioMap.has(test.fullTitle)) {
          scenarioMap.set(test.fullTitle, {
            title: test.title,
            file: test.file,
            apiName,
            tenantStatuses: new Map(),
          });
        }
        scenarioMap.get(test.fullTitle)!.tenantStatuses.set(tenantLabel, {
          status: test.status,
          errorMessage: test.error?.message,
          errorCategory: test.error?.category,
          errorStack: test.error?.stack,
          duration: test.duration,
        });
      });
    });
  });

  const rows: ScenarioTenantRow[] = Array.from(scenarioMap.entries()).map(
    ([fullTitle, s]) => {
      let passCount = 0;
      let failCount = 0;
      s.tenantStatuses.forEach((ts) => {
        if (ts.status === 'passed') passCount++;
        else if (ts.status === 'failed' || ts.status === 'flaky') failCount++;
      });
      const isDivergent = passCount > 0 && failCount > 0;
      return { fullTitle, ...s, isDivergent, passCount, failCount };
    },
  );

  // Sort: divergent first, then all-failing, then all-passing
  rows.sort((a, b) => {
    if (a.isDivergent !== b.isDivergent) return a.isDivergent ? -1 : 1;
    if (a.failCount !== b.failCount) return b.failCount - a.failCount;
    return a.title.localeCompare(b.title);
  });

  const stats: SummaryStats = {
    totalScenarios: rows.length,
    divergent: rows.filter((r) => r.isDivergent).length,
    allFailing: rows.filter((r) => r.failCount > 0 && r.passCount === 0).length,
    allPassing: rows.filter((r) => r.failCount === 0).length,
    tenants,
  };

  return { rows, tenants, stats };
}

// ── Sub-components ────────────────────────────────────────────────────────────

const CATEGORY_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  assertion:           { label: 'Assertion',  color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  timeout:             { label: 'Timeout',    color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  network:             { label: 'Network',    color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  'element-not-found': { label: 'Element',    color: '#a855f7', bg: 'rgba(168,85,247,0.12)' },
  runtime:             { label: 'Runtime',    color: '#ec4899', bg: 'rgba(236,72,153,0.12)' },
  unknown:             { label: 'Unknown',    color: '#64748b', bg: 'rgba(100,116,139,0.12)' },
};

function TenantCell({ ts }: { ts: TenantStatus | undefined }) {
  if (!ts) {
    return (
      <div className="flex items-center justify-center">
        <span className="text-xs text-slate-600 italic">—</span>
      </div>
    );
  }
  if (ts.status === 'passed')
    return <CheckCircle2 className="h-4 w-4 text-emerald-400 mx-auto" />;
  if (ts.status === 'failed')
    return <XCircle className="h-4 w-4 text-red-400 mx-auto" />;
  if (ts.status === 'flaky')
    return <AlertCircle className="h-4 w-4 text-amber-400 mx-auto" />;
  return <SkipForward className="h-4 w-4 text-slate-500 mx-auto" />;
}

function ScenarioRow({
  row,
  tenants,
}: {
  row: ScenarioTenantRow;
  tenants: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  const hasErrors = Array.from(row.tenantStatuses.values()).some((ts) => ts.errorMessage);

  return (
    <div>
      <div
        className={`grid gap-0 items-center hover:bg-slate-800/50 transition-colors rounded-lg group ${hasErrors ? 'cursor-pointer' : ''}`}
        style={{ gridTemplateColumns: `1fr repeat(${tenants.length}, 72px) 80px` }}
        onClick={() => hasErrors && setExpanded((p) => !p)}
      >
        {/* Scenario title */}
        <div className="flex items-center gap-2 px-4 py-2.5 min-w-0">
          {row.isDivergent && (
            <span className="shrink-0 inline-flex items-center justify-center w-2 h-2 rounded-full bg-amber-400" title="Divergent: different results across tenants" />
          )}
          <span className="text-sm text-slate-200 truncate" title={row.fullTitle}>
            {row.title}
          </span>
          {hasErrors && (
            <span className="shrink-0 text-slate-600 group-hover:text-slate-400 transition-colors ml-auto">
              {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </span>
          )}
        </div>

        {/* Tenant status cells */}
        {tenants.map((t) => (
          <div key={t} className="py-2.5 text-center">
            <TenantCell ts={row.tenantStatuses.get(t)} />
          </div>
        ))}

        {/* Divergence badge */}
        <div className="py-2.5 pr-4 text-right">
          {row.isDivergent ? (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 whitespace-nowrap">
              Divergent
            </span>
          ) : row.failCount > 0 ? (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 whitespace-nowrap">
              All fail
            </span>
          ) : (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap">
              All pass
            </span>
          )}
        </div>
      </div>

      {/* Error details per tenant */}
      {expanded && (
        <div className="mx-4 mb-3 rounded-lg border border-amber-500/15 bg-amber-500/5 px-4 py-3 space-y-3">
          {tenants.map((t) => {
            const ts = row.tenantStatuses.get(t);
            if (!ts?.errorMessage) return null;
            const cat = CATEGORY_STYLE[ts.errorCategory ?? 'unknown'] ?? CATEGORY_STYLE.unknown;
            return (
              <div key={t}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-slate-300">{t}</span>
                  <span
                    className="text-xs font-medium px-1.5 py-0.5 rounded-full"
                    style={{ color: cat.color, backgroundColor: cat.bg }}
                  >
                    {cat.label}
                  </span>
                </div>
                <p
                  className="text-xs text-red-300/80 leading-relaxed"
                  style={{ fontFamily: 'ui-monospace, monospace' }}
                >
                  {ts.errorMessage.split('\n')[0]}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type FilterMode = 'divergent' | 'all' | 'failing';

export function TenantComparisonPage() {
  const navigate = useNavigate();
  const [reports, setReports] = useState<ParsedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>('divergent');
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const summaries = await reportsApi.getAll();
        const all = await Promise.all(summaries.map((s) => reportsApi.getById(s.id)));
        setReports(all);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load reports');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const { rows, tenants, stats } = useMemo(() => {
    if (reports.length === 0) return { rows: [], tenants: [], stats: { totalScenarios: 0, divergent: 0, allFailing: 0, allPassing: 0, tenants: [] } };
    return buildTenantData(reports);
  }, [reports]);

  const filteredRows = useMemo(() => {
    let r = rows;
    if (filter === 'divergent') r = r.filter((row) => row.isDivergent);
    else if (filter === 'failing') r = r.filter((row) => row.failCount > 0);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter((row) => row.title.toLowerCase().includes(q) || row.apiName.toLowerCase().includes(q));
    }
    return r;
  }, [rows, filter, search]);

  // Group by API name for display
  const grouped = useMemo(() => {
    const map = new Map<string, ScenarioTenantRow[]>();
    filteredRows.forEach((row) => {
      if (!map.has(row.apiName)) map.set(row.apiName, []);
      map.get(row.apiName)!.push(row);
    });
    return Array.from(map.entries());
  }, [filteredRows]);

  if (loading) return <FullPageSpinner />;
  if (error) return <ErrorState message={error} />;

  if (reports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Users className="h-12 w-12 text-slate-600" />
        <p className="text-slate-400 text-lg">No reports found</p>
        <Button onClick={() => navigate('/')}>
          <Upload className="h-4 w-4 mr-2" /> Upload Reports
        </Button>
      </div>
    );
  }

  if (tenants.length < 2) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="rounded-2xl border border-slate-700/60 bg-slate-800/60 p-10 text-center">
          <GitCompare className="h-12 w-12 text-slate-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-white mb-2">Need at least 2 tenant reports</h2>
          <p className="text-slate-400 text-sm max-w-md mx-auto mb-6">
            Upload reports whose names contain tenant identifiers (e.g. <code className="text-indigo-300">TenantID:1</code>, <code className="text-indigo-300">TenantID:4</code>) to see cross-tenant divergence analysis.
          </p>
          <p className="text-slate-500 text-xs mb-6">
            Currently detected: {tenants.length === 1 ? tenants[0] : 'no tenant patterns found'}
          </p>
          <Button onClick={() => navigate('/')}>
            <Upload className="h-4 w-4 mr-2" /> Upload More Reports
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-10 space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <GitCompare className="h-6 w-6 text-indigo-400" />
          Tenant Comparison
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Cross-tenant API divergence — same test, different outcomes per tenant
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-5">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Tenants</div>
          <div className="text-3xl font-bold text-white">{tenants.length}</div>
          <div className="text-xs text-slate-500 mt-1">{tenants.join(', ')}</div>
        </Card>
        <Card
          className="p-5 cursor-pointer hover:border-amber-500/40 transition-colors"
          onClick={() => setFilter('divergent')}
          style={{ borderColor: filter === 'divergent' ? 'rgba(245,158,11,0.4)' : undefined }}
        >
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Divergent APIs</div>
          <div className="text-3xl font-bold text-amber-400">{stats.divergent}</div>
          <div className="text-xs text-slate-500 mt-1">pass for some, fail for others</div>
        </Card>
        <Card
          className="p-5 cursor-pointer hover:border-red-500/40 transition-colors"
          onClick={() => setFilter('failing')}
          style={{ borderColor: filter === 'failing' ? 'rgba(239,68,68,0.4)' : undefined }}
        >
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Failing All</div>
          <div className="text-3xl font-bold text-red-400">{stats.allFailing}</div>
          <div className="text-xs text-slate-500 mt-1">fail across every tenant</div>
        </Card>
        <Card
          className="p-5 cursor-pointer hover:border-emerald-500/40 transition-colors"
          onClick={() => setFilter('all')}
          style={{ borderColor: filter === 'all' ? 'rgba(16,185,129,0.4)' : undefined }}
        >
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">All Passing</div>
          <div className="text-3xl font-bold text-emerald-400">{stats.allPassing}</div>
          <div className="text-xs text-slate-500 mt-1">consistent pass for all</div>
        </Card>
      </div>

      {/* Divergence insight banner */}
      {stats.divergent > 0 && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/8 px-5 py-4 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-300 mb-0.5">
              {stats.divergent} API{stats.divergent > 1 ? 's' : ''} behave differently across tenants
            </p>
            <p className="text-xs text-slate-400">
              These tests pass for some tenants but fail for others — likely tenant-specific data, configuration, or permissions issues rather than a code bug.
            </p>
          </div>
        </div>
      )}

      {stats.divergent === 0 && stats.allFailing === 0 && (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/8 px-5 py-4 flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
          <p className="text-sm text-emerald-300">
            All APIs behave consistently across tenants — no divergence detected.
          </p>
        </div>
      )}

      {/* Filters + search */}
      <div className="flex items-center gap-3 flex-wrap">
        <Filter className="h-4 w-4 text-slate-500 shrink-0" />
        {(['divergent', 'failing', 'all'] as FilterMode[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filter === f
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
            }`}
          >
            {f === 'divergent' ? 'Divergent only' : f === 'failing' ? 'Has failures' : 'All scenarios'}
          </button>
        ))}
        <input
          type="text"
          placeholder="Search scenario / API…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ml-auto rounded-lg bg-slate-800 border border-slate-700 px-3 py-1.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 w-56"
        />
      </div>

      {/* Comparison matrix */}
      {grouped.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-slate-400">No scenarios match the current filter.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map(([apiName, apiRows]) => (
            <ApiGroupBlock key={apiName} apiName={apiName} rows={apiRows} tenants={tenants} />
          ))}
        </div>
      )}
    </div>
  );
}

function ApiGroupBlock({
  apiName,
  rows,
  tenants,
}: {
  apiName: string;
  rows: ScenarioTenantRow[];
  tenants: string[];
}) {
  const [open, setOpen] = useState(true);
  const divergentCount = rows.filter((r) => r.isDivergent).length;
  const failCount = rows.filter((r) => r.failCount > 0).length;

  return (
    <div className="rounded-2xl border border-slate-700/60 bg-slate-800/60 overflow-hidden backdrop-blur-sm">
      {/* Header */}
      <button
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-700/30 transition-colors text-left"
        onClick={() => setOpen((p) => !p)}
      >
        <span className="text-slate-400 shrink-0">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
        <span className="text-sm font-semibold text-white flex-1 truncate">{apiName}</span>
        <div className="flex items-center gap-2 shrink-0">
          {divergentCount > 0 && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
              {divergentCount} divergent
            </span>
          )}
          {failCount > 0 && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
              {failCount} failing
            </span>
          )}
          <span className="text-xs text-slate-500">{rows.length} scenarios</span>
        </div>
      </button>

      {/* Column headers + rows */}
      {open && (
        <div className="border-t border-slate-700/40">
          {/* Column header row */}
          <div
            className="grid gap-0 items-center border-b border-slate-700/30 px-0"
            style={{ gridTemplateColumns: `1fr repeat(${tenants.length}, 72px) 80px` }}
          >
            <div className="px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Scenario
            </div>
            {tenants.map((t) => (
              <div key={t} className="py-2 text-center text-xs font-semibold text-slate-400 truncate px-1" title={t}>
                {t}
              </div>
            ))}
            <div className="py-2 pr-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Result
            </div>
          </div>

          {/* Scenario rows */}
          <div className="py-1">
            {rows.map((row) => (
              <ScenarioRow key={row.fullTitle} row={row} tenants={tenants} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
