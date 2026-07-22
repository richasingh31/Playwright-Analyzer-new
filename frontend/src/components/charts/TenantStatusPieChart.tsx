import { PieChart, Pie, Cell, Tooltip, Legend, Label } from 'recharts';
import { STATUS_CONFIG } from '../../utils/helpers';

interface TenantPieStats {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
}

interface Props {
  label: string;
  stats: TenantPieStats;
}

interface TooltipPayload {
  name: string;
  value: number;
  payload: { key: 'passed' | 'failed' | 'skipped' };
}

function CenterLabel({
  viewBox,
  passRate,
}: {
  viewBox?: { cx: number; cy: number };
  passRate: number;
}) {
  const cx = viewBox?.cx ?? 0;
  const cy = viewBox?.cy ?? 0;
  return (
    <g>
      <text x={cx} y={cy - 2} textAnchor="middle" fill="#0f172a" fontSize={22} fontWeight={700}>
        {passRate}%
      </text>
      <text x={cx} y={cy + 16} textAnchor="middle" fill="#64748b" fontSize={10}>
        Pass rate
      </text>
    </g>
  );
}

function CustomTooltip({ active, payload, total }: { active?: boolean; payload?: TooltipPayload[]; total: number }) {
  if (!active || !payload?.length) return null;
  const { name, value, payload: p } = payload[0];
  const cfg = STATUS_CONFIG[p.key];
  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 p-2.5 shadow-2xl backdrop-blur-sm text-sm">
      <p className={`font-semibold ${cfg.color} mb-0.5`}>{name}</p>
      <p className="text-slate-900 font-bold">{value} tests</p>
      <p className="text-slate-500 text-xs">{pct}% of total</p>
    </div>
  );
}

export function TenantStatusPieChart({ label, stats }: Props) {
  const passRate = stats.total > 0 ? Math.round((stats.passed / stats.total) * 100) : 0;
  const data = (
    [
      { name: 'Passed', value: stats.passed, key: 'passed' as const },
      { name: 'Failed', value: stats.failed, key: 'failed' as const },
      { name: 'Skipped', value: stats.skipped, key: 'skipped' as const },
    ] as const
  ).filter((d) => d.value > 0);

  return (
    <div className="flex flex-col items-center">
      <p className="text-sm font-semibold text-slate-800 mb-1">{label}</p>
      <PieChart width={220} height={200}>
        <Pie
          data={data}
          cx="50%"
          cy="46%"
          innerRadius={55}
          outerRadius={80}
          paddingAngle={3}
          dataKey="value"
          strokeWidth={0}
        >
          {data.map((entry) => (
            <Cell key={entry.key} fill={STATUS_CONFIG[entry.key].hex} />
          ))}
          <Label content={<CenterLabel passRate={passRate} viewBox={undefined} />} position="center" />
        </Pie>
        <Tooltip content={<CustomTooltip total={stats.total} />} />
        <Legend
          formatter={(v) => <span className="text-slate-700 text-xs">{v}</span>}
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 12 }}
        />
      </PieChart>
    </div>
  );
}
