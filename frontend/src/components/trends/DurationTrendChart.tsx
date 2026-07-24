import { useState } from 'react';
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import type { ReportSummary } from '../../types';
import { formatDate, formatDuration } from '../../utils/helpers';
import { Card, CardHeader } from '../ui/Card';

type Mode = 'total' | 'perTest';

interface DataPoint {
  date: string;
  name: string;
  totalMs: number;
  perTestMs: number;
  testCount: number;
}

interface Band {
  maxMs: number;
  color: string;
  label: string;
  hint: string;
}

const TOTAL_BANDS: Record<'fast' | 'moderate' | 'slow', Band> = {
  fast: { maxMs: 22_000, color: '#10b981', label: 'Fast', hint: '≤22s' },
  moderate: { maxMs: 30_000, color: '#f59e0b', label: 'Moderate', hint: '22–30s' },
  slow: { maxMs: Infinity, color: '#f97316', label: 'Slow', hint: '>30s' },
};

const PER_TEST_BANDS: Record<'fast' | 'moderate' | 'slow', Band> = {
  fast: { maxMs: 1_500, color: '#10b981', label: 'Fast', hint: '≤1.5s' },
  moderate: { maxMs: 3_500, color: '#f59e0b', label: 'Moderate', hint: '1.5–3.5s' },
  slow: { maxMs: Infinity, color: '#f97316', label: 'Slow', hint: '>3.5s' },
};

function bandsFor(mode: Mode) {
  return mode === 'total' ? TOTAL_BANDS : PER_TEST_BANDS;
}

function bandFor(ms: number, mode: Mode): Band {
  const bands = bandsFor(mode);
  if (ms <= bands.fast.maxMs) return bands.fast;
  if (ms <= bands.moderate.maxMs) return bands.moderate;
  return bands.slow;
}

function axisDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${Math.round(ms / 100) / 10}s`;
  const m = ms / 60_000;
  return `${Math.round(m * 10) / 10}m`;
}

function shortDate(r: ReportSummary) {
  const iso = r.startTime ? new Date(r.startTime).toISOString() : r.uploadedAt;
  return formatDate(iso).split(',')[0];
}

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-slate-100 p-0.5 text-xs font-medium shrink-0">
      {(['total', 'perTest'] as const).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={`px-2.5 py-1 rounded-md transition-colors ${
            mode === m
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {m === 'total' ? 'Total' : 'Per Test'}
        </button>
      ))}
    </div>
  );
}

function DurationTooltip({
  active,
  payload,
  mode,
}: {
  active?: boolean;
  payload?: Array<{ payload: DataPoint }>;
  mode: Mode;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const activeMs = mode === 'total' ? d.totalMs : d.perTestMs;
  const band = bandFor(activeMs, mode);
  return (
    <div className="rounded-xl border border-slate-400 bg-slate-200/95 p-3 shadow-2xl text-xs min-w-[170px]">
      <p className="font-semibold text-slate-900 mb-2 max-w-[200px] truncate">{d.name}</p>
      <div className="flex justify-between gap-4">
        <span className="text-slate-600">Total Duration</span>
        <span className="font-medium text-slate-800">{formatDuration(d.totalMs)}</span>
      </div>
      <div className="flex justify-between gap-4 mt-1">
        <span className="text-slate-600">Tests</span>
        <span className="font-medium text-slate-800">{d.testCount}</span>
      </div>
      <div className="flex justify-between gap-4 mt-1">
        <span className="text-slate-600">Avg / Test</span>
        <span className="font-medium text-slate-800">{formatDuration(d.perTestMs)}</span>
      </div>
      <div className="flex justify-between gap-4 mt-1.5 pt-1.5 border-t border-slate-400/40">
        <span className="text-slate-600">Status</span>
        <span className="font-semibold" style={{ color: band.color }}>{band.label}</span>
      </div>
    </div>
  );
}

export function DurationTrendChart({ reports }: { reports: ReportSummary[] }) {
  const [mode, setMode] = useState<Mode>('perTest');

  const sorted = [...reports].sort(
    (a, b) =>
      (a.startTime ?? new Date(a.uploadedAt).getTime()) -
      (b.startTime ?? new Date(b.uploadedAt).getTime()),
  );

  const data: DataPoint[] = sorted.map((r) => ({
    date: shortDate(r),
    name: r.name,
    totalMs: r.stats.duration,
    perTestMs: r.stats.total > 0 ? r.stats.duration / r.stats.total : 0,
    testCount: r.stats.total,
  }));

  const chartData = data.map((d) => ({ ...d, value: mode === 'total' ? d.totalMs : d.perTestMs }));

  const avg = chartData.length > 0
    ? chartData.reduce((s, d) => s + d.value, 0) / chartData.length
    : 0;

  const rotate = data.length > 6;
  const bands = bandsFor(mode);

  return (
    <Card>
      <CardHeader
        title="Suite Duration Trend"
        subtitle={
          mode === 'total'
            ? 'Total run time per report — rising trend means slower CI'
            : 'Average time per test per report — normalizes for test-count changes across runs'
        }
        action={<ModeToggle mode={mode} onChange={setMode} />}
      />

      {/* Legend */}
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        {Object.values(bands).map((b) => (
          <span key={b.label} className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: b.color }} />
            {b.label} ({b.hint})
          </span>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <BarChart
          data={chartData}
          margin={{ top: 8, right: 24, left: 4, bottom: rotate ? 40 : 8 }}
          barCategoryGap="30%"
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: '#475569', fontSize: 11 }}
            axisLine={{ stroke: '#cbd5e1' }}
            tickLine={false}
            angle={rotate ? -35 : 0}
            textAnchor={rotate ? 'end' : 'middle'}
          />
          <YAxis
            tick={{ fill: '#475569', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => axisDuration(v)}
          />
          <RechartsTooltip content={<DurationTooltip mode={mode} />} cursor={{ fill: 'rgba(15,23,42,0.03)' }} />
          {avg > 0 && (
            <ReferenceLine
              y={avg}
              stroke="#6366f1"
              strokeDasharray="4 3"
              label={{
                value: `avg ${axisDuration(avg)}`,
                position: 'right',
                fill: '#6366f1',
                fontSize: 10,
              }}
            />
          )}
          <Bar dataKey="value" maxBarSize={28} radius={[4, 4, 0, 0]}>
            {chartData.map((d, i) => (
              <Cell key={i} fill={bandFor(d.value, mode).color} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
