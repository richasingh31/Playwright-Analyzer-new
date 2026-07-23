import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from 'recharts';
import type { ReportSummary } from '../../types';
import { formatDate } from '../../utils/helpers';

type Metric = 'pass' | 'fail';

interface Props {
  reports: ReportSummary[];
  /** How many of the most recent runs to plot. */
  days?: number;
  /** Which rate to plot — pass rate (green) or fail rate (red). */
  metric?: Metric;
}

interface ChartEntry {
  date: string;
  name: string;
  rate: number;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ChartEntry }>;
  metric: Metric;
}

const METRIC_STYLE: Record<Metric, { stroke: string; labelColor: string; label: string; tooltipBg: string; tooltipBorder: string; tooltipText: string }> = {
  pass: {
    stroke: '#10b981',
    labelColor: '#059669',
    label: 'Pass Rate (%)',
    tooltipBg: 'bg-emerald-500/10',
    tooltipBorder: 'border-emerald-500/20',
    tooltipText: 'text-emerald-600',
  },
  fail: {
    stroke: '#ef4444',
    labelColor: '#dc2626',
    label: 'Fail Rate (%)',
    tooltipBg: 'bg-red-500/10',
    tooltipBorder: 'border-red-500/20',
    tooltipText: 'text-red-600',
  },
};

function reportTime(r: ReportSummary): number {
  return r.startTime ?? new Date(r.uploadedAt).getTime();
}

function getReportDate(r: ReportSummary): string {
  const dateStr = r.startTime ? new Date(r.startTime).toISOString() : r.uploadedAt;
  return formatDate(dateStr).split(',')[0];
}

function CustomTooltip({ active, payload, metric }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const style = METRIC_STYLE[metric];
  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 p-3 shadow-2xl backdrop-blur-sm text-sm min-w-[150px]">
      <p className="text-slate-900 font-semibold mb-0.5 truncate max-w-[190px]">{d.name}</p>
      <p className="text-slate-500 text-xs mb-2">{d.date}</p>
      <div className={`rounded-lg ${style.tooltipBg} border ${style.tooltipBorder} px-3 py-1.5 text-center`}>
        <p className={`${style.tooltipText} text-lg font-bold`}>{d.rate}%</p>
        <p className={`${style.tooltipText} text-[11px] opacity-70`}>{metric === 'pass' ? 'Pass' : 'Fail'}</p>
      </div>
    </div>
  );
}

function TopValueLabel(props: { x?: number; y?: number; value?: number | string; color: string }) {
  const { x, y, value, color } = props;
  if (x == null || y == null) return null;
  return (
    <text x={x} y={y - 12} textAnchor="middle" fontSize={11} fontWeight={700} fill={color}>
      {value}%
    </text>
  );
}

export function PassRateLineTrendChart({ reports, days = 5, metric = 'pass' }: Props) {
  const sorted = [...reports].sort((a, b) => reportTime(a) - reportTime(b));
  const recent = sorted.slice(-days);

  const data: ChartEntry[] = recent.map((r) => ({
    date: getReportDate(r),
    name: r.name,
    rate:
      metric === 'pass'
        ? r.stats.passRate
        : r.stats.total > 0
          ? Math.round((r.stats.failed / r.stats.total) * 100)
          : 0,
  }));

  const style = METRIC_STYLE[metric];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 px-1 text-xs text-slate-500">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: style.stroke }} />
        {style.label}
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 28, right: 24, left: -12, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: '#475569', fontSize: 11 }}
            axisLine={{ stroke: '#cbd5e1' }}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tickFormatter={(v) => `${v}%`}
            tick={{ fill: '#475569', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            content={<CustomTooltip metric={metric} />}
            cursor={{ stroke: style.stroke, strokeOpacity: 0.2, strokeWidth: 24 }}
          />
          <Line
            type="monotone"
            dataKey="rate"
            stroke={style.stroke}
            strokeWidth={2.5}
            dot={{ r: 4, fill: style.stroke, strokeWidth: 0 }}
            activeDot={{ r: 6 }}
          >
            <LabelList dataKey="rate" content={<TopValueLabel color={style.labelColor} />} />
          </Line>
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
