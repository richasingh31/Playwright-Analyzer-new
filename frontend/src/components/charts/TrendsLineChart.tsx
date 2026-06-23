import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts';
import type { ReportSummary } from '../../types';
import { formatDate } from '../../utils/helpers';

interface Props {
  reports: ReportSummary[];
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-600 bg-slate-800/95 p-3 shadow-2xl backdrop-blur-sm text-sm min-w-[160px]">
      <p className="text-slate-400 text-xs mb-2">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5" style={{ color: p.color }}>
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="font-semibold text-white">{p.value}%</span>
        </div>
      ))}
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

  const data = sorted.map((r) => {
    const pass = r.stats.passRate;
    const fail = 100 - pass;
    return {
      date: getReportDate(r),
      name: r.name,
      Pass: pass,
      Fail: fail,
    };
  });

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 4, right: 16, left: -12, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: '#94a3b8', fontSize: 11 }}
          axisLine={{ stroke: '#334155' }}
          tickLine={false}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fill: '#94a3b8', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          formatter={(v) => <span className="text-slate-300 text-sm">{v}</span>}
          iconType="square"
          iconSize={8}
        />
        <ReferenceLine y={80} stroke="#475569" strokeDasharray="4 4" label={{ value: '80%', fill: '#64748b', fontSize: 10, position: 'insideTopRight' }} />
        <Bar dataKey="Pass" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} maxBarSize={48} />
        <Bar dataKey="Fail" stackId="a" fill="#ef4444" radius={[3, 3, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  );
}
