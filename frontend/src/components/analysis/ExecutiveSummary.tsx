import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import type { ParsedReport } from '../../types';

export function ExecutiveSummary({ report }: { report: ParsedReport }) {
  const { stats } = report;

  const StatusIcon =
    stats.passRate >= 85 ? CheckCircle2 :
    stats.passRate >= 70 ? AlertTriangle :
    XCircle;

  const iconColor =
    stats.passRate >= 85 ? 'text-emerald-600' :
    stats.passRate >= 70 ? 'text-amber-600' :
    'text-red-600';

  return (
    <div className="rounded-xl border border-slate-300/50 bg-slate-200/30 p-5">
      <div className="flex items-center gap-2.5">
        <StatusIcon className={`h-6 w-6 shrink-0 ${iconColor}`} />
        <h3 className="text-xl font-bold text-slate-900">Executive Summary</h3>
      </div>
    </div>
  );
}
