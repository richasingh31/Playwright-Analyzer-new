import {
  LineChart,
  Line,
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
  return (
    <div className="rounded-xl border border-slate-400 bg-slate-200/95 p-3 shadow-2xl text-xs">
      <p className="font-semibold text-slate-900 mb-2 max-w-[200px] truncate">{d.name}</p>
      <div className="flex justify-between gap-4">
        <span className="text-slate-600">Suite Duration</span>
        <span className="text-indigo-600 font-bold">{formatDuration(d.durationMs)}</span>
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
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 8, right: 24, left: -12, bottom: rotate ? 40 : 8 }}>
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
        <RechartsTooltip content={<DurationTooltip />} />
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
        <Line
          type="monotone"
          dataKey="durationSec"
          stroke="#6366f1"
          strokeWidth={2}
          dot={{ fill: '#6366f1', r: 3, strokeWidth: 0 }}
          activeDot={{ r: 5, fill: '#818cf8' }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
