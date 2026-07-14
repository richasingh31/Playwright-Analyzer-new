import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LabelList,
} from 'recharts';
import type { TestSuite } from '../../types';
import { STATUS_CONFIG } from '../../utils/helpers';

interface Props {
  suites: TestSuite[];
}

interface ChartRow {
  name: string;
  fullName: string;
  Passed: number;
  Failed: number;
  Skipped: number;
  Flaky: number;
  total: number;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; fill: string }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + p.value, 0);
  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 p-3 shadow-2xl backdrop-blur-sm text-sm min-w-[180px]">
      <p className="font-semibold text-slate-900 mb-2 text-xs leading-snug break-words">{label}</p>
      {payload.map((p) =>
        p.value > 0 ? (
          <div key={p.name} className="flex items-center justify-between gap-6 py-0.5">
            <span className="flex items-center gap-1.5 text-slate-700">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: p.fill }} />
              {p.name}
            </span>
            <span className="font-semibold text-slate-900 tabular-nums">{p.value}</span>
          </div>
        ) : null
      )}
      <div className="border-t border-slate-200 mt-2 pt-2 flex justify-between text-xs">
        <span className="text-slate-500">Total</span>
        <span className="text-slate-900 font-bold tabular-nums">{total}</span>
      </div>
    </div>
  );
}

// Label at the right end of each stacked bar showing the total count
function TotalLabel(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  value?: number;
}) {
  const { x = 0, y = 0, width = 0, height = 0, value = 0 } = props;
  if (!value) return null;
  return (
    <text
      x={x + width + 6}
      y={y + height / 2}
      dominantBaseline="middle"
      fill="#475569"
      fontSize={11}
      fontWeight={600}
    >
      {value}
    </text>
  );
}

export function SuiteBarChart({ suites }: Props) {
  const data: ChartRow[] = suites.map((s) => ({
    name: s.title.length > 32 ? `${s.title.slice(0, 32)}…` : s.title,
    fullName: s.title,
    Passed: s.stats.passed,
    Failed: s.stats.failed,
    Skipped: s.stats.skipped,
    Flaky: s.stats.flaky,
    total: s.stats.total,
  }));

  const chartHeight = Math.max(180, data.length * 52 + 48);
  const yAxisWidth = Math.min(220, Math.max(120, Math.max(...data.map((d) => d.name.length)) * 7));

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 48, left: 8, bottom: 4 }}
        barCategoryGap="30%"
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />

        {/* Number axis — horizontal, easy to scan */}
        <XAxis
          type="number"
          tick={{ fill: '#64748b', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />

        {/* Suite name axis — vertical, full readable name */}
        <YAxis
          type="category"
          dataKey="fullName"
          width={yAxisWidth}
          tick={{ fill: '#334155', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: string) =>
            v.length > 28 ? `${v.slice(0, 28)}…` : v
          }
        />

        <Tooltip
          content={<CustomTooltip />}
          cursor={{ fill: 'rgba(99,102,241,0.06)' }}
        />
        <Legend
          formatter={(v) => <span className="text-slate-700 text-xs">{v}</span>}
          iconType="circle"
          iconSize={8}
        />

        <Bar
          dataKey="Passed"
          stackId="a"
          fill={STATUS_CONFIG.passed.hex}
          fillOpacity={0.85}
          maxBarSize={24}
          radius={[3, 0, 0, 3]}
        />
        <Bar
          dataKey="Failed"
          stackId="a"
          fill={STATUS_CONFIG.failed.hex}
          fillOpacity={0.85}
          maxBarSize={24}
        />
        <Bar
          dataKey="Skipped"
          stackId="a"
          fill={STATUS_CONFIG.skipped.hex}
          fillOpacity={0.85}
          maxBarSize={24}
        />
        <Bar
          dataKey="Flaky"
          stackId="a"
          fill={STATUS_CONFIG.flaky.hex}
          fillOpacity={0.85}
          maxBarSize={24}
          radius={[0, 3, 3, 0]}
        >
          {/* Total count shown at the right end of each bar */}
          <LabelList dataKey="total" content={<TotalLabel />} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
