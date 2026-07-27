import { Filter } from 'lucide-react';

export type ReportKind = 'api' | 'ui';

export function ReportKindSelect({
  value,
  onChange,
}: {
  value: ReportKind;
  onChange: (v: ReportKind) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-violet-600">
        <Filter className="h-4 w-4" /> Report Type
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as ReportKind)}
        className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-all duration-150 hover:shadow-md focus:outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-500/15"
      >
        <option value="api">API Tests (Estimation)</option>
        <option value="ui">UI Tests (EstimationAI)</option>
      </select>
    </div>
  );
}
