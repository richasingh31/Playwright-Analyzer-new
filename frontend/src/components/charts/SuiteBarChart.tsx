import { CheckCircle2, SkipForward, X, XCircle } from 'lucide-react';
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LabelList,
} from 'recharts';
import type { TestSuite } from '../../types';
import { STATUS_CONFIG, flattenTests } from '../../utils/helpers';

interface Props {
  suites: TestSuite[];
  onSuiteSelect?: (suite: TestSuite) => void;
  selectedSuiteId?: string;
}

interface ChartRow {
  name: string;
  fullName: string;
  suiteId: string;
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

// Pass/fail breakdown for a suite — listing every test, failures first
export function SuiteDetailCard({ suite, onClose }: { suite: TestSuite; onClose: () => void }) {
  const all = flattenTests([suite]);
  const failing = all.filter((t) => t.status === 'failed' || t.status === 'flaky');
  const passing = all.filter((t) => t.status === 'passed');
  const skipped = all.filter((t) => t.status === 'skipped');

  return (
    <div className="text-xs">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate" title={suite.title}>
            {suite.title}
          </p>
          <p className="text-slate-500 mt-0.5">
            <span className="text-emerald-600 font-medium">{suite.stats.passed} passed</span>
            {suite.stats.failed > 0 && (
              <> · <span className="text-red-600 font-medium">{suite.stats.failed} failed</span></>
            )}
            {suite.stats.flaky > 0 && (
              <> · <span className="text-amber-600 font-medium">{suite.stats.flaky} flaky</span></>
            )}
            {suite.stats.skipped > 0 && (
              <> · <span className="text-slate-500">{suite.stats.skipped} skipped</span></>
            )}
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 transition-colors shrink-0"
          title="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
        {failing.map((t) => (
          <div key={t.id} className="flex items-start gap-1.5 rounded-lg px-2 py-1.5 bg-red-50 border border-red-100">
            <XCircle className="h-3 w-3 text-red-500 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-slate-800 truncate" title={t.title}>{t.title}</p>
              {t.error && (
                <p
                  className="text-red-600/80 mt-0.5 truncate"
                  style={{ fontFamily: 'ui-monospace, monospace' }}
                  title={t.error.message}
                >
                  {t.error.message.split('\n')[0]}
                </p>
              )}
            </div>
          </div>
        ))}
        {passing.map((t) => (
          <div key={t.id} className="flex items-start gap-1.5 rounded-lg px-2 py-1.5 bg-emerald-50 border border-emerald-100">
            <CheckCircle2 className="h-3 w-3 text-emerald-500 mt-0.5 shrink-0" />
            <p className="text-slate-800 truncate" title={t.title}>{t.title}</p>
          </div>
        ))}
        {skipped.map((t) => (
          <div key={t.id} className="flex items-start gap-1.5 rounded-lg px-2 py-1.5 bg-slate-50 border border-slate-200">
            <SkipForward className="h-3 w-3 text-slate-400 mt-0.5 shrink-0" />
            <p className="text-slate-600 truncate" title={t.title}>{t.title}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SuiteBarChart({ suites, onSuiteSelect, selectedSuiteId }: Props) {
  const data: ChartRow[] = suites.map((s) => ({
    name: s.title.length > 32 ? `${s.title.slice(0, 32)}…` : s.title,
    fullName: s.title,
    suiteId: s.id,
    Passed: s.stats.passed,
    Failed: s.stats.failed,
    Skipped: s.stats.skipped,
    Flaky: s.stats.flaky,
    total: s.stats.total,
  }));

  const handleBarClick = (row: ChartRow) => {
    if (!onSuiteSelect) return;
    const suite = suites.find((s) => s.id === row.suiteId);
    if (suite) onSuiteSelect(suite);
  };

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
          maxBarSize={24}
          radius={[3, 0, 0, 3]}
          onClick={handleBarClick}
          style={{ cursor: onSuiteSelect ? 'pointer' : 'default' }}
        >
          {data.map((d, i) => (
            <Cell key={i} fillOpacity={selectedSuiteId && d.suiteId !== selectedSuiteId ? 0.35 : 0.85} />
          ))}
        </Bar>
        <Bar
          dataKey="Failed"
          stackId="a"
          fill={STATUS_CONFIG.failed.hex}
          maxBarSize={24}
          onClick={handleBarClick}
          style={{ cursor: onSuiteSelect ? 'pointer' : 'default' }}
        >
          {data.map((d, i) => (
            <Cell key={i} fillOpacity={selectedSuiteId && d.suiteId !== selectedSuiteId ? 0.35 : 0.85} />
          ))}
        </Bar>
        <Bar
          dataKey="Skipped"
          stackId="a"
          fill={STATUS_CONFIG.skipped.hex}
          maxBarSize={24}
          onClick={handleBarClick}
          style={{ cursor: onSuiteSelect ? 'pointer' : 'default' }}
        >
          {data.map((d, i) => (
            <Cell key={i} fillOpacity={selectedSuiteId && d.suiteId !== selectedSuiteId ? 0.35 : 0.85} />
          ))}
        </Bar>
        <Bar
          dataKey="Flaky"
          stackId="a"
          fill={STATUS_CONFIG.flaky.hex}
          maxBarSize={24}
          radius={[0, 3, 3, 0]}
          onClick={handleBarClick}
          style={{ cursor: onSuiteSelect ? 'pointer' : 'default' }}
        >
          {data.map((d, i) => (
            <Cell key={i} fillOpacity={selectedSuiteId && d.suiteId !== selectedSuiteId ? 0.35 : 0.85} />
          ))}
          {/* Total count shown at the right end of each bar */}
          <LabelList dataKey="total" content={<TotalLabel />} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
