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
  LayoutGrid,
} from 'lucide-react';
import { reportsApi } from '../api/client';
import type { ParsedReport, TestStatus, TestSuite, TestResult } from '../types';
import { Card } from '../components/ui/Card';
import { TenantStatusPieChart } from '../components/charts/TenantStatusPieChart';
import { Button } from '../components/ui/Button';
import { FullPageSpinner, ErrorState } from '../components/ui/Spinner';
import { formatDuration } from '../utils/helpers';

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
  tenantStatuses: Map<string, TenantStatus>; // tenantKey → status
  isDivergent: boolean; // some tenants pass, some fail
  passCount: number;
  failCount: number;
}

interface TenantStats {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
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

// Fallback for reports that don't log a tenant per-test: infer from the report's
// own file name (e.g. "TenantID:1", "Tenant 4", "TID:7").
function extractReportTenantId(reportName: string): string | null {
  const match = reportName.match(
    /(?:tenant[\s_-]?(?:id)?[\s:_-]*|TID[\s:]*|T[\s:]*#?)(\d+)/i,
  );
  return match ? match[1] : null;
}

function tenantSortValue(key: string): number {
  return parseInt(key.slice('tenant:'.length), 10);
}

// Some suites bake the tenant right into the test title itself (e.g.
// "[TenantID: 1]: Verify API returns 400 for empty body"), which would
// otherwise make the "same" scenario look like a different one per tenant
// and prevent any cross-tenant matching. Strip it so scenarios line up.
function stripTenantPrefix(title: string): string {
  return title.replace(/^\s*\[\s*tenant[\s_-]?id\s*:\s*\d+\s*\]\s*:?\s*/i, '').trim();
}

function buildTenantData(reports: ParsedReport[]): {
  rows: ScenarioTenantRow[];
  tenants: string[];
  tenantLabels: Map<string, string>;
  stats: SummaryStats;
  statsByTenant: Map<string, TenantStats>;
} {
  // Tenant identity comes from two sources, preferring the more granular one:
  //  1. Per-test tenant IDs logged in the test's own output (a single report can
  //     legitimately contain multiple tenants mixed together — e.g. Tenant 1, 3,
  //     and 4 tests interleaved in one JUnit file).
  //  2. Falling back to a tenant ID embedded in the report's file name, for
  //     reports/tools that don't log a tenant per test.
  // Tests matching neither are excluded from the comparison (see below).
  // Reports are processed oldest → newest so that when the same tenant appears
  // in more than one upload, the newest upload's result wins per scenario.
  const sortedReports = [...reports].sort(
    (a, b) => new Date(a.uploadedAt).getTime() - new Date(b.uploadedAt).getTime(),
  );

  const tenantLabels = new Map<string, string>();
  const scenarioMap = new Map<
    string,
    {
      title: string;
      file: string;
      apiName: string;
      tenantStatuses: Map<string, TenantStatus>;
    }
  >();

  sortedReports.forEach((report) => {
    const reportTenantId = extractReportTenantId(report.name);

    report.suites.forEach((suite) => {
      const apiName = suite.title || suite.file.split(/[\\/]/).pop()?.replace(/\.spec\.(ts|js|tsx|jsx)$/, '') || suite.file;
      getAllTests(suite).forEach((test) => {
        const tenantId = test.tenantId ?? reportTenantId ?? undefined;
        // Tests with no detectable tenant (neither logged nor in the file name) —
        // e.g. skipped tests that never ran long enough to log one — can't be
        // placed in any tenant's column, so they're left out of this comparison
        // rather than getting a meaningless date-labeled tab.
        if (!tenantId) return;
        const tenantKey = `tenant:${tenantId}`;
        tenantLabels.set(tenantKey, `Tenant ${tenantId}`);

        const normalizedTitle = stripTenantPrefix(test.title);
        const scenarioKey = `${apiName}::${normalizedTitle}`;
        if (!scenarioMap.has(scenarioKey)) {
          scenarioMap.set(scenarioKey, {
            title: normalizedTitle,
            file: test.file,
            apiName,
            tenantStatuses: new Map(),
          });
        }
        scenarioMap.get(scenarioKey)!.tenantStatuses.set(tenantKey, {
          status: test.status,
          errorMessage: test.error?.message,
          errorCategory: test.error?.category,
          errorStack: test.error?.stack,
          duration: test.duration,
        });
      });
    });
  });

  const tenants = Array.from(tenantLabels.keys()).sort(
    (a, b) => tenantSortValue(a) - tenantSortValue(b),
  );

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

  const statsByTenant = new Map<string, TenantStats>();
  tenants.forEach((t) => statsByTenant.set(t, { total: 0, passed: 0, failed: 0, skipped: 0 }));
  rows.forEach((row) => {
    row.tenantStatuses.forEach((ts, t) => {
      const s = statsByTenant.get(t);
      if (!s) return;
      s.total++;
      if (ts.status === 'passed') s.passed++;
      else if (ts.status === 'failed' || ts.status === 'flaky') s.failed++;
      else s.skipped++;
    });
  });

  return { rows, tenants, tenantLabels, stats, statsByTenant };
}

// ── Sub-components ────────────────────────────────────────────────────────────

const CATEGORY_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  assertion:           { label: 'Assertion',  color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  timeout:             { label: 'Timeout',    color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  network:             { label: 'Network',    color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  'element-not-found': { label: 'Element',    color: '#a855f7', bg: 'rgba(168,85,247,0.12)' },
  runtime:             { label: 'Runtime',    color: '#ec4899', bg: 'rgba(236,72,153,0.12)' },
  application:         { label: 'Application', color: '#64748b', bg: 'rgba(100,116,139,0.12)' },
};

function StatusIcon({ status, className }: { status: TestStatus | undefined; className?: string }) {
  const cls = className ?? 'h-4 w-4 mx-auto';
  if (!status) return <span className="text-xs text-slate-400 italic">—</span>;
  if (status === 'passed') return <CheckCircle2 className={`${cls} text-emerald-600`} />;
  if (status === 'failed') return <XCircle className={`${cls} text-red-600`} />;
  if (status === 'flaky') return <AlertCircle className={`${cls} text-amber-600`} />;
  return <SkipForward className={`${cls} text-slate-500`} />;
}

function ErrorDetail({ ts }: { ts: TenantStatus }) {
  if (!ts.errorMessage) return null;
  const cat = CATEGORY_STYLE[ts.errorCategory ?? 'application'] ?? CATEGORY_STYLE.application;
  return (
    <div>
      <span
        className="text-xs font-medium px-1.5 py-0.5 rounded-full inline-block mb-1"
        style={{ color: cat.color, backgroundColor: cat.bg }}
      >
        {cat.label}
      </span>
      <p
        className="text-xs text-red-700/80 leading-relaxed"
        style={{ fontFamily: 'ui-monospace, monospace' }}
      >
        {ts.errorMessage.split('\n')[0]}
      </p>
    </div>
  );
}

// ── Compare-all matrix (all tenants side by side) ────────────────────────────

function CompareScenarioRow({
  row,
  tenants,
  tenantLabels,
}: {
  row: ScenarioTenantRow;
  tenants: string[];
  tenantLabels: Map<string, string>;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasErrors = Array.from(row.tenantStatuses.values()).some((ts) => ts.errorMessage);

  return (
    <div>
      <div
        className={`grid gap-0 items-center hover:bg-slate-200/50 transition-colors rounded-lg group ${hasErrors ? 'cursor-pointer' : ''}`}
        style={{ gridTemplateColumns: `1fr repeat(${tenants.length}, 72px) 80px` }}
        onClick={() => hasErrors && setExpanded((p) => !p)}
      >
        <div className="flex items-center gap-2 px-4 py-2.5 min-w-0">
          {row.isDivergent && (
            <span className="shrink-0 inline-flex items-center justify-center w-2 h-2 rounded-full bg-amber-400" title="Divergent: different results across tenants" />
          )}
          <span className="text-sm text-slate-800 truncate" title={row.fullTitle}>
            {row.title}
          </span>
          {hasErrors && (
            <span className="shrink-0 text-slate-400 group-hover:text-slate-600 transition-colors ml-auto">
              {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            </span>
          )}
        </div>

        {tenants.map((t) => (
          <div key={t} className="py-2.5 text-center">
            <StatusIcon status={row.tenantStatuses.get(t)?.status} />
          </div>
        ))}

        <div className="py-2.5 pr-4 text-right">
          {row.isDivergent ? (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20 whitespace-nowrap">
              Divergent
            </span>
          ) : row.failCount > 0 ? (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 border border-red-500/20 whitespace-nowrap">
              All fail
            </span>
          ) : (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 whitespace-nowrap">
              All pass
            </span>
          )}
        </div>
      </div>

      {expanded && (
        <div className="mx-4 mb-3 rounded-lg border border-amber-500/15 bg-amber-500/5 px-4 py-3 space-y-3">
          {tenants.map((t) => {
            const ts = row.tenantStatuses.get(t);
            if (!ts?.errorMessage) return null;
            return (
              <div key={t}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-slate-700">{tenantLabels.get(t) ?? t}</span>
                </div>
                <ErrorDetail ts={ts} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CompareApiGroupBlock({
  apiName,
  rows,
  tenants,
  tenantLabels,
}: {
  apiName: string;
  rows: ScenarioTenantRow[];
  tenants: string[];
  tenantLabels: Map<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const divergentCount = rows.filter((r) => r.isDivergent).length;
  const failCount = rows.filter((r) => r.failCount > 0).length;

  return (
    <div className="rounded-2xl border border-slate-300/60 bg-slate-200/60 overflow-hidden backdrop-blur-sm">
      <button
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-300/30 transition-colors text-left"
        onClick={() => setOpen((p) => !p)}
      >
        <span className="text-slate-600 shrink-0">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
        <span className="text-sm font-semibold text-slate-900 flex-1 truncate">{apiName}</span>
        <div className="flex items-center gap-2 shrink-0">
          {divergentCount > 0 && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20">
              {divergentCount} divergent
            </span>
          )}
          {failCount > 0 && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 border border-red-500/20">
              {failCount} failing
            </span>
          )}
          <span className="text-xs text-slate-500">{rows.length} scenarios</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-300/40">
          <div
            className="grid gap-0 items-center border-b border-slate-300/30 px-0"
            style={{ gridTemplateColumns: `1fr repeat(${tenants.length}, 72px) 80px` }}
          >
            <div className="px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Scenario
            </div>
            {tenants.map((t) => (
              <div key={t} className="py-2 text-center text-xs font-semibold text-slate-600 truncate px-1" title={tenantLabels.get(t) ?? t}>
                {tenantLabels.get(t) ?? t}
              </div>
            ))}
            <div className="py-2 pr-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Result
            </div>
          </div>

          <div className="py-1">
            {rows.map((row) => (
              <CompareScenarioRow key={row.fullTitle} row={row} tenants={tenants} tenantLabels={tenantLabels} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Single-tenant tab (pass/fail per API + test case, with inline compare strip) ─

function SingleTenantScenarioRow({
  row,
  tenantKey,
  otherTenants,
  tenantLabels,
}: {
  row: ScenarioTenantRow;
  tenantKey: string;
  otherTenants: string[];
  tenantLabels: Map<string, string>;
}) {
  const [expanded, setExpanded] = useState(false);
  const own = row.tenantStatuses.get(tenantKey);
  if (!own) return null;

  const hasOwnError = !!own.errorMessage;
  const otherErrors = otherTenants.filter((t) => row.tenantStatuses.get(t)?.errorMessage);
  const canExpand = hasOwnError || otherErrors.length > 0;

  return (
    <div>
      <div
        className={`flex items-center gap-3 px-4 py-2.5 hover:bg-slate-200/50 transition-colors rounded-lg group ${canExpand ? 'cursor-pointer' : ''}`}
        onClick={() => canExpand && setExpanded((p) => !p)}
      >
        {row.isDivergent && (
          <span className="shrink-0 inline-flex items-center justify-center w-2 h-2 rounded-full bg-amber-400" title="Divergent: different results across tenants" />
        )}
        <span className="text-sm text-slate-800 truncate flex-1 min-w-0" title={row.fullTitle}>
          {row.title}
        </span>

        <span
          className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
            own.status === 'passed'
              ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
              : own.status === 'failed'
                ? 'bg-red-500/10 text-red-600 border border-red-500/20'
                : own.status === 'flaky'
                  ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                  : 'bg-slate-500/10 text-slate-500 border border-slate-500/20'
          }`}
        >
          {own.status === 'passed' ? 'Pass' : own.status === 'failed' ? 'Fail' : own.status === 'flaky' ? 'Flaky' : 'Skip'}
        </span>

        <span className="shrink-0 text-xs text-slate-500 w-14 text-right tabular-nums">
          {formatDuration(own.duration)}
        </span>

        {otherTenants.length > 0 && (
          <div className="shrink-0 flex items-center gap-1 pl-3 ml-1 border-l border-slate-300/60">
            {otherTenants.map((t) => (
              <span key={t} title={`${tenantLabels.get(t) ?? t}: ${row.tenantStatuses.get(t)?.status ?? 'not run'}`}>
                <StatusIcon status={row.tenantStatuses.get(t)?.status} className="h-3.5 w-3.5" />
              </span>
            ))}
          </div>
        )}

        <span className="shrink-0 text-slate-400 group-hover:text-slate-600 transition-colors w-4">
          {canExpand ? (expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />) : null}
        </span>
      </div>

      {expanded && (
        <div className="mx-4 mb-3 rounded-lg border border-amber-500/15 bg-amber-500/5 px-4 py-3 space-y-3">
          {hasOwnError && (
            <div>
              <span className="text-xs font-semibold text-slate-700 mb-1 block">{tenantLabels.get(tenantKey) ?? tenantKey} (this tab)</span>
              <ErrorDetail ts={own} />
            </div>
          )}
          {otherErrors.map((t) => (
            <div key={t}>
              <span className="text-xs font-semibold text-slate-700 mb-1 block">{tenantLabels.get(t) ?? t}</span>
              <ErrorDetail ts={row.tenantStatuses.get(t)!} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SingleTenantApiGroupBlock({
  apiName,
  rows,
  tenantKey,
  otherTenants,
  tenantLabels,
}: {
  apiName: string;
  rows: ScenarioTenantRow[];
  tenantKey: string;
  otherTenants: string[];
  tenantLabels: Map<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const passCount = rows.filter((r) => r.tenantStatuses.get(tenantKey)?.status === 'passed').length;
  const failCount = rows.filter((r) => {
    const s = r.tenantStatuses.get(tenantKey)?.status;
    return s === 'failed' || s === 'flaky';
  }).length;
  const divergentCount = rows.filter((r) => r.isDivergent).length;

  return (
    <div className="rounded-2xl border border-slate-300/60 bg-slate-200/60 overflow-hidden backdrop-blur-sm">
      <button
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-300/30 transition-colors text-left"
        onClick={() => setOpen((p) => !p)}
      >
        <span className="text-slate-600 shrink-0">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
        <span className="text-sm font-semibold text-slate-900 flex-1 truncate">{apiName}</span>
        <div className="flex items-center gap-2 shrink-0">
          {divergentCount > 0 && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20">
              {divergentCount} divergent
            </span>
          )}
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
            {passCount} pass
          </span>
          {failCount > 0 && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 border border-red-500/20">
              {failCount} fail
            </span>
          )}
          <span className="text-xs text-slate-500">{rows.length} scenarios</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-slate-300/40 py-1">
          {rows.map((row) => (
            <SingleTenantScenarioRow
              key={row.fullTitle}
              row={row}
              tenantKey={tenantKey}
              otherTenants={otherTenants}
              tenantLabels={tenantLabels}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type FilterMode = 'divergent' | 'all' | 'failing';
const COMPARE_TAB = '__compare__';

export function TenantComparisonPage() {
  const navigate = useNavigate();
  const [reports, setReports] = useState<ParsedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<string>(COMPARE_TAB);

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

  const { rows, tenants, tenantLabels, stats, statsByTenant } = useMemo(() => {
    if (reports.length === 0)
      return {
        rows: [],
        tenants: [],
        tenantLabels: new Map<string, string>(),
        stats: { totalScenarios: 0, divergent: 0, allFailing: 0, allPassing: 0, tenants: [] },
        statsByTenant: new Map<string, TenantStats>(),
      };
    return buildTenantData(reports);
  }, [reports]);

  // Default to the first tenant tab once tenants are known; fall back to Compare.
  useEffect(() => {
    if (tenants.length === 0) return;
    if (activeTab !== COMPARE_TAB && !tenants.includes(activeTab)) {
      setActiveTab(tenants[0]);
    }
  }, [tenants, activeTab]);

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

  // Rows scoped to the active tenant tab: only scenarios that ran for it, plus filters.
  const tenantScopedRows = useMemo(() => {
    if (activeTab === COMPARE_TAB) return filteredRows;
    let r = filteredRows.filter((row) => row.tenantStatuses.has(activeTab));
    if (filter === 'failing') {
      r = r.filter((row) => {
        const s = row.tenantStatuses.get(activeTab)?.status;
        return s === 'failed' || s === 'flaky';
      });
    }
    return r;
  }, [filteredRows, activeTab, filter]);

  // Group by API name for display
  const grouped = useMemo(() => {
    const map = new Map<string, ScenarioTenantRow[]>();
    tenantScopedRows.forEach((row) => {
      if (!map.has(row.apiName)) map.set(row.apiName, []);
      map.get(row.apiName)!.push(row);
    });
    return Array.from(map.entries());
  }, [tenantScopedRows]);

  if (loading) return <FullPageSpinner />;
  if (error) return <ErrorState message={error} />;

  if (reports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Users className="h-12 w-12 text-slate-400" />
        <p className="text-slate-600 text-lg">No reports found</p>
        <Button onClick={() => navigate('/')}>
          <Upload className="h-4 w-4 mr-2" /> Upload Reports
        </Button>
      </div>
    );
  }

  if (tenants.length < 2) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="rounded-2xl border border-slate-300/60 bg-slate-200/60 p-10 text-center">
          <GitCompare className="h-12 w-12 text-slate-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Need at least 2 tenants</h2>
          <p className="text-slate-600 text-sm max-w-md mx-auto mb-6">
            Upload a report whose tests log a tenant ID (e.g. <code className="text-indigo-700">[INFO] TenantId: 4</code>) or
            whose file name carries one (e.g. <code className="text-indigo-700">TenantID:1</code>) to see cross-tenant divergence analysis.
          </p>
          <p className="text-slate-500 text-xs mb-6">
            Currently detected: {tenants.length === 1 ? (tenantLabels.get(tenants[0]) ?? tenants[0]) : 'no tenant patterns found'}
          </p>
          <Button onClick={() => navigate('/')}>
            <Upload className="h-4 w-4 mr-2" /> Upload More Reports
          </Button>
        </div>
      </div>
    );
  }

  const activeTenantStats = activeTab !== COMPARE_TAB ? statsByTenant.get(activeTab) : undefined;
  const otherTenants = activeTab !== COMPARE_TAB ? tenants.filter((t) => t !== activeTab) : [];

  return (
    <div className="mx-auto max-w-7xl px-6 py-10 space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
          <GitCompare className="h-6 w-6 text-indigo-600" />
          Tenant Comparison
        </h1>
        <p className="text-slate-600 text-sm mt-1">
          Per-tenant pass/fail breakdown by API and test case — switch tabs to compare
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-5">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Tenants</div>
          <div className="text-3xl font-bold text-slate-900">{tenants.length}</div>
          <div className="text-xs text-slate-500 mt-1">detected across {reports.length} report{reports.length === 1 ? '' : 's'}</div>
        </Card>
        <Card
          className="p-5 cursor-pointer hover:border-amber-500/40 transition-colors"
          onClick={() => setFilter('divergent')}
          style={{ borderColor: filter === 'divergent' ? 'rgba(245,158,11,0.4)' : undefined }}
        >
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Divergent APIs</div>
          <div className="text-3xl font-bold text-amber-600">{stats.divergent}</div>
          <div className="text-xs text-slate-500 mt-1">pass for some, fail for others</div>
        </Card>
        <Card
          className="p-5 cursor-pointer hover:border-red-500/40 transition-colors"
          onClick={() => setFilter('failing')}
          style={{ borderColor: filter === 'failing' ? 'rgba(239,68,68,0.4)' : undefined }}
        >
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Failing All</div>
          <div className="text-3xl font-bold text-red-600">{stats.allFailing}</div>
          <div className="text-xs text-slate-500 mt-1">fail across every tenant</div>
        </Card>
        <Card
          className="p-5 cursor-pointer hover:border-emerald-500/40 transition-colors"
          onClick={() => setFilter('all')}
          style={{ borderColor: filter === 'all' ? 'rgba(16,185,129,0.4)' : undefined }}
        >
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">All Passing</div>
          <div className="text-3xl font-bold text-emerald-600">{stats.allPassing}</div>
          <div className="text-xs text-slate-500 mt-1">consistent pass for all</div>
        </Card>
      </div>

      {/* Divergence insight banner */}
      {stats.divergent > 0 && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/8 px-5 py-4 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-700 mb-0.5">
              {stats.divergent} API{stats.divergent > 1 ? 's' : ''} behave differently across tenants
            </p>
            <p className="text-xs text-slate-600">
              These tests pass for some tenants but fail for others — likely tenant-specific data, configuration, or permissions issues rather than a code bug.
            </p>
          </div>
        </div>
      )}

      {stats.divergent === 0 && stats.allFailing === 0 && (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/8 px-5 py-4 flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
          <p className="text-sm text-emerald-700">
            All APIs behave consistently across tenants — no divergence detected.
          </p>
        </div>
      )}

      {/* Pass/fail breakdown per tenant */}
      <Card className="p-5">
        <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
          Pass / Fail by Tenant
        </div>
        <div className={`grid gap-4`} style={{ gridTemplateColumns: `repeat(${Math.min(tenants.length, 4)}, minmax(0, 1fr))` }}>
          {tenants.map((t) => {
            const s = statsByTenant.get(t);
            if (!s) return null;
            return <TenantStatusPieChart key={t} label={tenantLabels.get(t) ?? t} stats={s} />;
          })}
        </div>
      </Card>

      {/* Tenant tabs */}
      <div className="flex items-center gap-1 border-b border-slate-300/60 flex-wrap">
        {tenants.map((t) => {
          const isActive = activeTab === t;
          return (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors flex items-center gap-2 ${
                isActive
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
              }`}
            >
              {tenantLabels.get(t) ?? t}
            </button>
          );
        })}
        <button
          onClick={() => setActiveTab(COMPARE_TAB)}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors flex items-center gap-2 ${
            activeTab === COMPARE_TAB
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
          }`}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          Compare All
        </button>
      </div>

      {/* Active tenant summary strip */}
      {activeTenantStats && (
        <div className="flex items-center gap-4 flex-wrap text-sm">
          <span className="text-slate-600">
            <span className="font-semibold text-slate-900">{activeTenantStats.total}</span> scenarios
          </span>
          <span className="text-emerald-600 font-semibold">{activeTenantStats.passed} passed</span>
          {activeTenantStats.failed > 0 && (
            <span className="text-red-600 font-semibold">{activeTenantStats.failed} failed</span>
          )}
          {activeTenantStats.skipped > 0 && (
            <span className="text-slate-500 font-semibold">{activeTenantStats.skipped} skipped</span>
          )}
        </div>
      )}

      {/* Filters + search */}
      <div className="flex items-center gap-3 flex-wrap">
        <Filter className="h-4 w-4 text-slate-500 shrink-0" />
        {(['all', 'failing', 'divergent'] as FilterMode[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filter === f
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-200 text-slate-600 hover:bg-slate-300 hover:text-slate-900'
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
          className="ml-auto rounded-lg bg-slate-200 border border-slate-300 px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 w-56"
        />
      </div>

      {/* Content: per-tenant list or full compare matrix */}
      {grouped.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-slate-600">No scenarios match the current filter.</p>
        </Card>
      ) : activeTab === COMPARE_TAB ? (
        <div className="space-y-4">
          {grouped.map(([apiName, apiRows]) => (
            <CompareApiGroupBlock key={apiName} apiName={apiName} rows={apiRows} tenants={tenants} tenantLabels={tenantLabels} />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([apiName, apiRows]) => (
            <SingleTenantApiGroupBlock
              key={apiName}
              apiName={apiName}
              rows={apiRows}
              tenantKey={activeTab}
              otherTenants={otherTenants}
              tenantLabels={tenantLabels}
            />
          ))}
        </div>
      )}
    </div>
  );
}
