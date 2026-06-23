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
}: {
  viewBox?: { cx: number; cy: number };
  passRate: number;
  duration: number;
}) {
  const cx = viewBox?.cx ?? 0;
  const cy = viewBox?.cy ?? 0;
  return (
    <g>
      <text x={cx} y={cy - 12} textAnchor="middle" fill="#ffffff" fontSize={30} fontWeight={700}>
        {passRate}%
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" fill="#94a3b8" fontSize={12}>
        Pass Rate
      </text>
      <text x={cx} y={cy + 28} textAnchor="middle" fill="#64748b" fontSize={11}>
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
    <div className="rounded-xl border border-slate-600 bg-slate-800/95 p-3 shadow-2xl backdrop-blur-sm text-sm">
      <p className={`font-semibold ${cfg.color} mb-1`}>{name}</p>
      <p className="text-white text-lg font-bold">{value} tests</p>
      <p className="text-slate-400">{pct}% of total</p>
      <p className="mt-2 text-xs text-indigo-400">Click to drill down →</p>
    </div>
  );
}

export function StatusDonutChart({ stats, reportId }: Props) {
  const navigate = useNavigate();

  const data = (
    [
      { name: 'Passed', value: stats.passed, status: 'passed' as TestStatus },
      { name: 'Failed', value: stats.failed, status: 'failed' as TestStatus },
      { name: 'Skipped', value: stats.skipped, status: 'skipped' as TestStatus },
      { name: 'Flaky', value: stats.flaky, status: 'flaky' as TestStatus },
    ] as const
  ).filter((d) => d.value > 0);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={85}
          outerRadius={125}
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
              <CenterLabel passRate={stats.passRate} duration={stats.duration} viewBox={undefined} />
            }
            position="center"
          />
        </Pie>
        <Tooltip
          content={<CustomTooltip total={stats.total} />}
        />
        <Legend
          formatter={(v) => <span className="text-slate-300 text-sm">{v}</span>}
          iconType="circle"
          iconSize={8}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
