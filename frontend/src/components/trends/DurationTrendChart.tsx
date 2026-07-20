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

interface DataPoint {
  date: string;
  name: string;
  durationMs: number;
  durationSec: number;
}

const DURATION_BANDS = {
  fast: { max: 22, color: '#10b981', label: 'Fast' },
  moderate: { max: 30, color: '#f59e0b', label: 'Moderate' },
  slow: { max: Infinity, color: '#f97316', label: 'Slow' },
} as const;

function durationBand(sec: number) {
  if (sec <= DURATION_BANDS.fast.max) return DURATION_BANDS.fast;
  if (sec <= DURATION_BANDS.moderate.max) return DURATION_BANDS.moderate;
  return DURATION_BANDS.slow;
}

function shortDate(r: ReportSummary) {
  const iso = r.startTime ? new Date(r.startTime).toISOString() : r.uploadedAt;
  return formatDate(iso).split(',')[0];
}

function DurationTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: DataPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const band = durationBand(d.durationSec);
  return (
    <div className="rounded-xl border border-slate-400 bg-slate-200/95 p-3 shadow-2xl text-xs">
      <p className="font-semibold text-slate-900 mb-2 max-w-[200px] truncate">{d.name}</p>
      <div className="flex justify-between gap-4">
        <span className="text-slate-600">Suite Duration</span>
        <span className="font-bold" style={{ color: band.color }}>
          {formatDuration(d.durationMs)}
        </span>
      </div>
      <div className="flex justify-between gap-4 mt-1">
        <span className="text-slate-600">Status</span>
        <span className="font-semibold" style={{ color: band.color }}>
          {band.label}
        </span>
      </div>
    </div>
  );
}

export function DurationTrendChart({ reports }: { reports: ReportSummary[] }) {
  const sorted = [...reports].sort(
    (a, b) =>
      (a.startTime ?? new Date(a.uploadedAt).getTime()) -
      (b.startTime ?? new Date(b.uploadedAt).getTime()),
  );

  const data: DataPoint[] = sorted.map((r) => ({
    date:        shortDate(r),
    name:        r.name,
    durationMs:  r.stats.duration,
    durationSec: Math.round(r.stats.duration / 1000),
  }));

  const avg = data.length > 0
    ? Math.round(data.reduce((s, d) => s + d.durationSec, 0) / data.length)
    : 0;

  const rotate = data.length > 6;

  return (
    <div>
      {/* Legend */}
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        {Object.values(DURATION_BANDS).map((b) => (
          <span key={b.label} className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: b.color }} />
            {b.label} {b.label === 'Fast' ? '(≤22s)' : b.label === 'Moderate' ? '(22–30s)' : '(>30s)'}
          </span>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <BarChart
          data={data}
          margin={{ top: 8, right: 24, left: -12, bottom: rotate ? 40 : 8 }}
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
            tickFormatter={(v: number) => v >= 60 ? `${Math.floor(v / 60)}m` : `${v}s`}
            allowDecimals={false}
          />
          <RechartsTooltip content={<DurationTooltip />} cursor={{ fill: 'rgba(15,23,42,0.03)' }} />
          {avg > 0 && (
            <ReferenceLine
              y={avg}
              stroke="#6366f1"
              strokeDasharray="4 3"
              label={{
                value: `avg ${avg >= 60 ? `${Math.floor(avg / 60)}m ${avg % 60}s` : `${avg}s`}`,
                position: 'right',
                fill: '#6366f1',
                fontSize: 10,
              }}
            />
          )}
          <Bar dataKey="durationSec" maxBarSize={28} radius={[4, 4, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={durationBand(d.durationSec).color} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
