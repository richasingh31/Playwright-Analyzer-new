import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  Label,
  ResponsiveContainer,
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import type { ReportStats, TestStatus } from '../../types';
import { STATUS_CONFIG, formatDuration } from '../../utils/helpers';

interface Props {
  stats: ReportStats;
  reportId: string;
  /** 'sm' fits narrower columns (e.g. side-by-side with a KPI card list) without clipping. */
  size?: 'md' | 'sm';
}

interface TooltipPayload {
  name: string;
  value: number;
  payload: { status: TestStatus };
}

function CenterLabel({
  viewBox,
  passRate,
  duration,
  compact,
}: {
  viewBox?: { cx: number; cy: number };
  passRate: number;
  duration: number;
  compact?: boolean;
}) {
  const cx = viewBox?.cx ?? 0;
  const cy = viewBox?.cy ?? 0;
  return (
    <g>
      <text x={cx} y={cy - (compact ? 9 : 12)} textAnchor="middle" fill="#0f172a" fontSize={compact ? 22 : 30} fontWeight={700}>
        {passRate}%
      </text>
      <text x={cx} y={cy + (compact ? 8 : 10)} textAnchor="middle" fill="#475569" fontSize={compact ? 11 : 12}>
        Pass Rate
      </text>
      <text x={cx} y={cy + (compact ? 22 : 28)} textAnchor="middle" fill="#64748b" fontSize={compact ? 10 : 11}>
        {formatDuration(duration)}
      </text>
    </g>
  );
}

function CustomTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  total: number;
}) {
  if (!active || !payload?.length) return null;
  const { name, value, payload: p } = payload[0];
  const cfg = STATUS_CONFIG[p.status];
  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 p-3 shadow-2xl backdrop-blur-sm text-sm">
      <p className={`font-semibold ${cfg.color} mb-1`}>{name}</p>
      <p className="text-slate-900 text-lg font-bold">{value} tests</p>
      <p className="text-slate-500">{pct}% of total</p>
      <p className="mt-2 text-xs text-indigo-600">Click to drill down →</p>
    </div>
  );
}

export function StatusDonutChart({ stats, reportId, size = 'md' }: Props) {
  const navigate = useNavigate();
  const compact = size === 'sm';

  const data = (
    [
      { name: 'Passed', value: stats.passed, status: 'passed' as TestStatus },
      { name: 'Failed', value: stats.failed, status: 'failed' as TestStatus },
      { name: 'Skipped', value: stats.skipped, status: 'skipped' as TestStatus },
      { name: 'Flaky', value: stats.flaky, status: 'flaky' as TestStatus },
    ] as const
  ).filter((d) => d.value > 0);

  return (
    <ResponsiveContainer width="100%" height={compact ? 230 : 300}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={compact ? 58 : 85}
          outerRadius={compact ? 85 : 125}
          paddingAngle={3}
          dataKey="value"
          strokeWidth={0}
          onClick={(entry: { status: TestStatus }) =>
            navigate(`/analysis/${reportId}/category/${entry.status}`)
          }
          style={{ cursor: 'pointer' }}
        >
          {data.map((entry) => (
            <Cell
              key={entry.status}
              fill={STATUS_CONFIG[entry.status].hex}
              className="transition-opacity hover:opacity-80"
            />
          ))}
          <Label
            content={
              <CenterLabel passRate={stats.passRate} duration={stats.duration} viewBox={undefined} compact={compact} />
            }
            position="center"
          />
        </Pie>
        <Tooltip
          content={<CustomTooltip total={stats.total} />}
        />
        <Legend
          formatter={(v) => <span className="text-slate-700 text-sm">{v}</span>}
          iconType="circle"
          iconSize={8}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
