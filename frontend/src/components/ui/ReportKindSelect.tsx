import { Filter } from 'lucide-react';
import { clsx } from 'clsx';

export type ReportKind = 'api' | 'ui';

export function ReportKindSelect({
  value,
  onChange,
  size = 'md',
}: {
  value: ReportKind;
  onChange: (v: ReportKind) => void;
  size?: 'md' | 'sm';
}) {
  const compact = size === 'sm';
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={clsx(
          'flex shrink-0 items-center gap-1 rounded-full bg-violet-50 font-bold uppercase tracking-wide text-violet-600',
          compact ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-xs gap-1.5',
        )}
      >
        <Filter className={compact ? 'h-3 w-3' : 'h-4 w-4'} />
        {compact ? 'Type' : 'Report Type'}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as ReportKind)}
        className={clsx(
          'rounded-2xl border border-slate-200 bg-white font-semibold text-slate-700 shadow-sm transition-all duration-150 hover:shadow-md focus:outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-500/15',
          compact ? 'px-2.5 py-1.5 text-xs' : 'px-4 py-2.5 text-sm',
        )}
      >
        <option value="api">{compact ? 'API Tests' : 'API Tests (Estimation)'}</option>
        <option value="ui">{compact ? 'UI Tests' : 'UI Tests (EstimationAI)'}</option>
      </select>
    </div>
  );
}
