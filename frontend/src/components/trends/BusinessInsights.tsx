import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
  PieChart,
  Pie,
  Legend,
} from 'recharts';
import { ShieldAlert, AlertTriangle, TrendingUp, TrendingDown, Minus, Zap } from 'lucide-react';
import type { ParsedReport, TestResult, TestSuite, ErrorCategory } from '../../types';
import { Card, CardHeader } from '../ui/Card';

// ── Helpers ───────────────────────────────────────────────────────────────────

function flattenTests(suites: TestSuite[]): TestResult[] {
  return suites.flatMap((s) => [...s.tests, ...flattenTests(s.suites)]);
}

function trunc(str: string, max: number) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

const CAT_META: Record<ErrorCategory, { label: string; color: string }> = {
  assertion:           { label: 'Assertion',     color: '#f59e0b' },
  timeout:             { label: 'Timeout',       color: '#f97316' },
  network:             { label: 'Network',       color: '#3b82f6' },
  'element-not-found': { label: 'Element',       color: '#a855f7' },
  runtime:             { label: 'Runtime',       color: '#ef4444' },
  unknown:             { label: 'Unknown',       color: '#64748b' },
};

function barFill(failRate: number) {
  if (failRate >= 70) return '#ef4444';
  if (failRate >= 40) return '#f97316';
  return '#f59e0b';
}

// ── Data types ────────────────────────────────────────────────────────────────

interface TestStat {
  key: string;
  label: string;
  fullLabel: string;
  failures: number;
  totalRuns: number;
  failRate: number;
  category?: ErrorCategory;
  impact: number;
}

interface CategoryEntry {
  label: string;
  count: number;
  color: string;
}

// ── Data processing ───────────────────────────────────────────────────────────

function processInsights(reports: ParsedReport[]) {
  const totalTestExecutions = reports.reduce((s, r) => s + r.stats.total, 0);

  const testMap = new Map<string, {
    label: string;
    fullLabel: string;
    failures: number;
    totalRuns: number;
    category?: ErrorCategory;
  }>();

  reports.forEach((report) => {
    const allTests = flattenTests(report.suites);
    const seenInRun = new Set<string>();

    allTests.forEach((test) => {
      if (seenInRun.has(test.fullTitle)) return;
      seenInRun.add(test.fullTitle);

      const isFailing = test.status === 'failed' || test.status === 'flaky';
      const prev = testMap.get(test.fullTitle);

      testMap.set(test.fullTitle, {
        label: trunc(test.title, 40),
        fullLabel: test.fullTitle,
        failures: (prev?.failures ?? 0) + (isFailing ? 1 : 0),
        totalRuns: (prev?.totalRuns ?? 0) + 1,
        category: isFailing && test.error?.category ? test.error.category : prev?.category,
      });
    });
  });

  const testStats: TestStat[] = Array.from(testMap.entries())
    .map(([key, v]) => ({
      key,
      ...v,
      failRate: Math.round((v.failures / v.totalRuns) * 100),
      impact: totalTestExecutions > 0
        ? +((v.failures / totalTestExecutions) * 100).toFixed(1)
        : 0,
    }))
    .filter((t) => t.failures > 0)
    .sort((a, b) => b.failures - a.failures || b.failRate - a.failRate);

  // Error categories from pre-computed errorGroups
  const catMap = new Map<ErrorCategory, CategoryEntry>();
  reports.forEach((r) => {
    r.errorGroups.forEach((eg) => {
      const meta = CAT_META[eg.category];
      const prev = catMap.get(eg.category);
      catMap.set(eg.category, {
        label: meta?.label ?? eg.label,
        count: (prev?.count ?? 0) + eg.count,
        color: meta?.color ?? '#64748b',
      });
    });
  });
  const categories: CategoryEntry[] = Array.from(catMap.values()).sort((a, b) => b.count - a.count);

  // Trend: oldest report vs latest (chronological)
  const chrono = [...reports].sort((a, b) => {
    const aT = a.metadata?.startTime ?? new Date(a.uploadedAt).getTime();
    const bT = b.metadata?.startTime ?? new Date(b.uploadedAt).getTime();
    return aT - bT;
  });
  const trendDelta =
    chrono.length >= 2
      ? chrono[chrono.length - 1].stats.passRate - chrono[0].stats.passRate
      : 0;

  const testsAtRisk = testStats.filter((t) => t.failures >= 2).length;
  const topCategory = categories[0];
  const topTest = testStats[0];

  return { testStats, categories, topCategory, topTest, testsAtRisk, trendDelta };
}

// ── Insight card ──────────────────────────────────────────────────────────────

function InsightCard({
  label,
  value,
  sub,
  accent = 'text-white',
  icon,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  accent?: string;
  icon: React.ReactNode;
}) {
  return (
    <Card className="py-4 px-4">
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</span>
        <span className={accent}>{icon}</span>
      </div>
      <div className={`text-2xl font-bold mb-0.5 ${accent}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5 truncate" title={sub}>{sub}</div>}
    </Card>
  );
}

// ── Failing tests tooltip ─────────────────────────────────────────────────────

function FailingTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: TestStat }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const catMeta = d.category ? CAT_META[d.category] : null;
  return (
    <div className="rounded-xl border border-slate-600 bg-slate-800/95 p-3 shadow-2xl text-xs max-w-[260px]">
      <p className="text-white font-semibold mb-1 break-words leading-snug">{d.fullLabel}</p>
      <div className="space-y-1.5 mt-2">
        <div className="flex justify-between gap-4">
          <span className="text-slate-400">Failed</span>
          <span className="text-red-400 font-bold">{d.failures} run{d.failures !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-400">Fail Rate</span>
          <span className="font-bold" style={{ color: barFill(d.failRate) }}>{d.failRate}%</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-400">Pass-rate impact</span>
          <span className="text-white font-bold">-{d.impact}%</span>
        </div>
        {catMeta && (
          <div className="flex justify-between gap-4">
            <span className="text-slate-400">Root cause</span>
            <span style={{ color: catMeta.color }}>{catMeta.label}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Category donut tooltip ────────────────────────────────────────────────────

function CategoryTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; percent: number; payload: CategoryEntry }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="rounded-xl border border-slate-600 bg-slate-800/95 p-3 shadow-2xl text-xs">
      <p className="font-semibold text-white mb-1">{d.name}</p>
      <p style={{ color: d.payload.color }} className="font-bold">
        {d.value} failures · {(d.percent * 100).toFixed(0)}%
      </p>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function BusinessInsights({ reports }: { reports: ParsedReport[] }) {
  const { testStats, categories, topCategory, topTest, testsAtRisk, trendDelta } =
    useMemo(() => processInsights(reports), [reports]);

  const top10 = testStats.slice(0, 10);

  // Nothing to show if every run is green
  if (testStats.length === 0 && categories.length === 0) return null;

  const chartHeight = Math.min(400, Math.max(220, top10.length * 40));

  return (
    <div className="space-y-6">
      {/* Section header */}
      <div className="border-b border-slate-700/60 pb-4">
        <h2 className="text-lg font-bold text-white">Quality Intelligence</h2>
        <p className="text-slate-400 text-sm mt-0.5">
          Business-focused failure analysis across {reports.length} test run{reports.length !== 1 ? 's' : ''} — what is failing, why, and where to focus first
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <InsightCard
          label="Tests at Risk"
          value={testsAtRisk}
          sub="failing in 2+ reports"
          accent="text-red-400"
          icon={<ShieldAlert className="h-5 w-5" />}
        />
        <InsightCard
          label="Top Root Cause"
          value={topCategory?.label ?? '—'}
          sub={topCategory ? `${topCategory.count} total failure${topCategory.count !== 1 ? 's' : ''}` : undefined}
          accent="text-amber-400"
          icon={<AlertTriangle className="h-5 w-5" />}
        />
        <InsightCard
          label="Pass Rate Trend"
          value={
            Math.abs(trendDelta) < 1
              ? 'Stable'
              : trendDelta > 0
              ? `+${trendDelta.toFixed(0)}%`
              : `${trendDelta.toFixed(0)}%`
          }
          sub="first run vs latest run"
          accent={
            Math.abs(trendDelta) < 1
              ? 'text-slate-400'
              : trendDelta > 0
              ? 'text-emerald-400'
              : 'text-red-400'
          }
          icon={
            Math.abs(trendDelta) < 1 ? (
              <Minus className="h-5 w-5" />
            ) : trendDelta > 0 ? (
              <TrendingUp className="h-5 w-5" />
            ) : (
              <TrendingDown className="h-5 w-5" />
            )
          }
        />
        <InsightCard
          label="Biggest Offender"
          value={topTest ? `${topTest.failures}×` : '—'}
          sub={topTest?.label}
          accent="text-orange-400"
          icon={<Zap className="h-5 w-5" />}
        />
      </div>

      {/* Charts: failing tests + error categories */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {top10.length > 0 && (
          <div className="lg:col-span-3">
            <Card>
              <CardHeader
                title="Most Failing Tests"
                subtitle="Ranked by failure count — hover a bar for full test name and impact"
              />
              <ResponsiveContainer width="100%" height={chartHeight}>
                <BarChart
                  data={top10}
                  layout="vertical"
                  margin={{ top: 4, right: 56, left: 8, bottom: 24 }}
                  barCategoryGap="28%"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                    label={{
                      value: 'Failed runs',
                      position: 'insideBottomRight',
                      offset: -4,
                      fill: '#64748b',
                      fontSize: 10,
                    }}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={152}
                    tick={{ fill: '#cbd5e1', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: string) => trunc(v, 24)}
                  />
                  <RechartsTooltip
                    content={<FailingTooltip />}
                    cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                  />
                  <Bar dataKey="failures" maxBarSize={22} radius={[0, 3, 3, 0]}>
                    {top10.map((entry, i) => (
                      <Cell key={i} fill={barFill(entry.failRate)} fillOpacity={0.85} />
                    ))}
                    <LabelList
                      dataKey="failures"
                      position="right"
                      style={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }}
                      formatter={(v: number) => `${v}×`}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>
        )}

        {categories.length > 0 && (
          <div className="lg:col-span-2">
            <Card>
              <CardHeader
                title="Why Tests Fail"
                subtitle="Failure root-cause distribution across all runs"
              />
              <ResponsiveContainer width="100%" height={chartHeight}>
                <PieChart>
                  <Pie
                    data={categories}
                    dataKey="count"
                    nameKey="label"
                    cx="50%"
                    cy="42%"
                    innerRadius={58}
                    outerRadius={90}
                    paddingAngle={3}
                  >
                    {categories.map((cat, i) => (
                      <Cell key={i} fill={cat.color} fillOpacity={0.85} />
                    ))}
                  </Pie>
                  <RechartsTooltip content={<CategoryTooltip />} />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    formatter={(v) => (
                      <span className="text-slate-300 text-xs">{v}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          </div>
        )}
      </div>

      {/* Priority fix table */}
      {testStats.length > 0 && (
        <Card>
          <CardHeader
            title="Priority Fix List"
            subtitle="Fix these tests to improve overall quality — ordered by pass-rate impact"
          />
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-700/60">
                  <th className="pb-3 px-2 font-medium w-7">#</th>
                  <th className="pb-3 px-2 font-medium">Test</th>
                  <th className="pb-3 px-2 font-medium text-center">Fail Rate</th>
                  <th className="pb-3 px-2 font-medium text-center">Failed / Runs</th>
                  <th className="pb-3 px-2 font-medium text-center">Root Cause</th>
                  <th className="pb-3 px-2 font-medium text-center">Pass Rate Impact</th>
                  <th className="pb-3 px-2 font-medium text-center">Priority</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/40">
                {testStats.slice(0, 10).map((t, i) => {
                  const severity =
                    t.failRate >= 70
                      ? { label: 'Critical', cls: 'text-red-400 bg-red-500/10 border-red-500/30' }
                      : t.failRate >= 40
                      ? { label: 'High',     cls: 'text-orange-400 bg-orange-500/10 border-orange-500/30' }
                      : { label: 'Medium',   cls: 'text-amber-400 bg-amber-500/10 border-amber-500/30' };
                  const catMeta = t.category ? CAT_META[t.category] : null;
                  return (
                    <tr key={t.key} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-2 text-slate-500 font-mono text-xs">{i + 1}</td>
                      <td className="py-3 px-2 max-w-[260px]">
                        <p className="font-medium text-white truncate" title={t.fullLabel}>
                          {t.label}
                        </p>
                        <p className="text-xs text-slate-500 truncate" title={t.fullLabel}>
                          {t.fullLabel}
                        </p>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <div className="inline-flex items-center gap-2">
                          <div className="h-1.5 w-14 rounded-full bg-slate-700 overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${t.failRate}%`,
                                background: barFill(t.failRate),
                              }}
                            />
                          </div>
                          <span
                            className="text-xs font-semibold tabular-nums"
                            style={{ color: barFill(t.failRate) }}
                          >
                            {t.failRate}%
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-2 text-center text-xs tabular-nums">
                        <span className="text-red-400 font-bold">{t.failures}</span>
                        <span className="text-slate-500"> / {t.totalRuns}</span>
                      </td>
                      <td className="py-3 px-2 text-center">
                        {catMeta ? (
                          <span
                            className="text-xs font-medium px-2 py-0.5 rounded-full border"
                            style={{
                              color: catMeta.color,
                              background: `${catMeta.color}18`,
                              borderColor: `${catMeta.color}40`,
                            }}
                          >
                            {catMeta.label}
                          </span>
                        ) : (
                          <span className="text-slate-600 text-xs">—</span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-center">
                        <span className="text-white font-semibold text-xs tabular-nums">
                          -{t.impact}%
                        </span>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <span
                          className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${severity.cls}`}
                        >
                          {severity.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
