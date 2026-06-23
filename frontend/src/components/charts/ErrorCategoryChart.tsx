import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import type { ErrorGroup } from '../../types';
import { ERROR_CATEGORY_CONFIG } from '../../utils/helpers';

interface Props {
  errorGroups: ErrorGroup[];
  reportId: string;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: { category: string; count: number; label: string }; value: number }>;
}

function CustomTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const cfg = ERROR_CATEGORY_CONFIG[d.category as keyof typeof ERROR_CATEGORY_CONFIG];
  return (
    <div className="rounded-xl border border-slate-600 bg-slate-800/95 p-3 shadow-2xl backdrop-blur-sm text-sm">
      <p className="font-semibold text-white mb-1">
        {cfg.icon} {d.label}
      </p>
      <p className="text-red-400 font-bold text-lg">{d.count}</p>
      <p className="text-slate-400 text-xs">failing tests</p>
      <p className="mt-2 text-xs text-indigo-400">Click to view →</p>
    </div>
  );
}

export function ErrorCategoryChart({ errorGroups, reportId }: Props) {
  const navigate = useNavigate();

  const data = errorGroups.map((g) => ({
    name:
      ERROR_CATEGORY_CONFIG[g.category].icon +
      ' ' +
      g.label.replace(' Errors', '').replace(' Failures', '').replace(' Not Found', ''),
    label: g.label,
    count: g.count,
    category: g.category,
    fill: ERROR_CATEGORY_CONFIG[g.category].hex,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart
        data={data}
        margin={{ top: 4, right: 8, left: -12, bottom: 4 }}
        onClick={(e) => {
          if (e?.activePayload?.[0]) {
            const cat = e.activePayload[0].payload.category as string;
            navigate(`/analysis/${reportId}/category/failed?error=${cat}`);
          }
        }}
        style={{ cursor: 'pointer' }}
      >
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
          content={<CustomTooltip />}
          cursor={{ fill: 'rgba(239,68,68,0.07)' }}
        />
        <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={56}>
          {data.map((entry) => (
            <Cell key={entry.category} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
