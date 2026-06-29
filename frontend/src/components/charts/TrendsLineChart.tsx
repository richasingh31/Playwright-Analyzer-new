import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from 'recharts';
import type { ReportSummary } from '../../types';
import { formatDate } from '../../utils/helpers';

interface Props {
  reports: ReportSummary[];
}

interface ChartEntry {
  date: string;
  name: string;
  passRate: number;
  failRate: number;
  passed: number;
  failed: number;
  skipped: number;
  flaky: number;
  total: number;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ChartEntry }>;
}

// Only render a segment label when there is enough vertical space to fit it
function SegmentLabel(props: {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  value?: number | string;
  labelFill?: string;
}) {
  const x = Number(props.x ?? 0);
  const y = Number(props.y ?? 0);
  const width = Number(props.width ?? 0);
  const height = Number(props.height ?? 0);
  const value = Number(props.value ?? 0);
  const { labelFill = '#fff' } = props;
  if (height < 24 || value === 0) return null;
  return (
    <text
      x={x + width / 2}
      y={y + height / 2}
      textAnchor="middle"
      dominantBaseline="middle"
      fill={labelFill}
      fontSize={11}
      fontWeight={700}
    >
      {value}%
    </text>
  );
}

function CustomTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-xl border border-slate-600 bg-slate-800/95 p-3 shadow-2xl backdrop-blur-sm text-sm min-w-[210px]">
      <p className="text-white font-semibold mb-0.5 truncate max-w-[190px]">{d.name}</p>
      <p className="text-slate-400 text-xs mb-3">{d.date}</p>

      <div className="flex gap-3 mb-3">
        <div className="flex-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-center">
          <p className="text-emerald-400 text-lg font-bold">{d.passRate}%</p>
          <p className="text-emerald-500/70 text-xs">Pass</p>
        </div>
        <div className="flex-1 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-center">
          <p className="text-red-400 text-lg font-bold">{d.failRate}%</p>
          <p className="text-red-500/70 text-xs">Fail</p>
        </div>
      </div>

      <div className="border-t border-slate-700 pt-2 space-y-1.5">
        <div className="flex justify-between gap-6">
          <span className="text-slate-400">Total</span>
          <span className="text-slate-200 font-medium">{d.total}</span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-emerald-400">Passed</span>
          <span className="text-emerald-400 font-medium">{d.passed}</span>
        </div>
        {d.failed > 0 && (
          <div className="flex justify-between gap-6">
            <span className="text-red-400">Failed</span>
            <span className="text-red-400 font-medium">{d.failed}</span>
          </div>
        )}
        {d.skipped > 0 && (
          <div className="flex justify-between gap-6">
            <span className="text-slate-400">Skipped</span>
            <span className="text-slate-400 font-medium">{d.skipped}</span>
          </div>
        )}
        {d.flaky > 0 && (
          <div className="flex justify-between gap-6">
            <span className="text-amber-400">Flaky</span>
            <span className="text-amber-400 font-medium">{d.flaky}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function getReportDate(r: ReportSummary): string {
  const dateStr = r.startTime ? new Date(r.startTime).toISOString() : r.uploadedAt;
  return formatDate(dateStr).split(',')[0];
}

export function TrendsLineChart({ reports }: Props) {
  const sorted = [...reports].sort((a, b) => {
    const aTime = a.startTime ?? new Date(a.uploadedAt).getTime();
    const bTime = b.startTime ?? new Date(b.uploadedAt).getTime();
    return aTime - bTime;
  });

  const data: ChartEntry[] = sorted.map((r) => ({
    date: getReportDate(r),
    name: r.name,
    passRate: r.stats.passRate,
    failRate: 100 - r.stats.passRate,
    passed: r.stats.passed,
    failed: r.stats.failed,
    skipped: r.stats.skipped,
    flaky: r.stats.flaky,
    total: r.stats.total,
  }));

  const angleLabels = data.length > 6;

  return (
    <div className="space-y-3">
      {/* Legend */}
      <div className="flex items-center gap-5 px-1 text-xs text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
          Pass Rate
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-red-500" />
          Fail Rate
        </span>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={data}
          margin={{ top: 8, right: 16, left: -12, bottom: angleLabels ? 52 : 8 }}
          barCategoryGap="30%"
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            axisLine={{ stroke: '#334155' }}
            tickLine={false}
            angle={angleLabels ? -35 : 0}
            textAnchor={angleLabels ? 'end' : 'middle'}
            interval={0}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${v}%`}
            ticks={[0, 20, 40, 60, 80, 100]}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: 'rgba(255,255,255,0.04)', radius: 4 }}
          />
          {/* Pass rate — bottom green segment */}
          <Bar dataKey="passRate" stackId="a" fill="#10b981" fillOpacity={0.85} maxBarSize={60}>
            <LabelList
              dataKey="passRate"
              content={(props) => (
                <SegmentLabel {...props} labelFill="rgba(255,255,255,0.9)" />
              )}
            />
          </Bar>

          {/* Fail rate — top red segment */}
          <Bar dataKey="failRate" stackId="a" fill="#ef4444" fillOpacity={0.85} maxBarSize={60} radius={[4, 4, 0, 0]}>
            <LabelList
              dataKey="failRate"
              content={(props) => (
                <SegmentLabel {...props} labelFill="rgba(255,255,255,0.9)" />
              )}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
