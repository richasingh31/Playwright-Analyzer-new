import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { TestSuite } from '../../types';
import { STATUS_CONFIG } from '../../utils/helpers';

interface Props {
  suites: TestSuite[];
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; fill: string }>;
  label?: string;
  fullNames: Record<string, string>;
}

function CustomTooltip({ active, payload, label, fullNames }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-600 bg-slate-800/95 p-3 shadow-2xl backdrop-blur-sm text-sm min-w-[160px]">
      <p className="font-semibold text-white mb-2 text-xs">{fullNames[label ?? ''] ?? label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-slate-300">
            <span className="h-2 w-2 rounded-full" style={{ background: p.fill }} />
            {p.name}
          </span>
          <span className="font-semibold text-white">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

export function SuiteBarChart({ suites }: Props) {
  const fullNames: Record<string, string> = {};

  const data = suites.map((s) => {
    const short = s.title.length > 22 ? `${s.title.slice(0, 22)}…` : s.title;
    fullNames[short] = s.title;
    return {
      name: short,
      Passed: s.stats.passed,
      Failed: s.stats.failed,
      Skipped: s.stats.skipped,
      Flaky: s.stats.flaky,
    };
  });

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fill: '#94a3b8', fontSize: 11 }}
          axisLine={{ stroke: '#334155' }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: '#94a3b8', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip
          content={<CustomTooltip fullNames={fullNames} />}
          cursor={{ fill: 'rgba(99,102,241,0.07)' }}
        />
        <Legend
          formatter={(v) => <span className="text-slate-300 text-sm">{v}</span>}
          iconType="circle"
          iconSize={8}
        />
        <Bar dataKey="Passed" fill={STATUS_CONFIG.passed.hex} radius={[4, 4, 0, 0]} maxBarSize={40} />
        <Bar dataKey="Failed" fill={STATUS_CONFIG.failed.hex} radius={[4, 4, 0, 0]} maxBarSize={40} />
        <Bar dataKey="Skipped" fill={STATUS_CONFIG.skipped.hex} radius={[4, 4, 0, 0]} maxBarSize={40} />
        <Bar dataKey="Flaky" fill={STATUS_CONFIG.flaky.hex} radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
}
