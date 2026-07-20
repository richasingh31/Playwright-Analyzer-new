import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import type { ParsedReport } from '../../types';
import { formatDuration } from '../../utils/helpers';

export function ExecutiveSummary({ report }: { report: ParsedReport }) {
  const { stats, suites } = report;

  const failPct  = Math.round((stats.failed / stats.total) * 100);
  const flakyPct = Math.round((stats.flaky  / stats.total) * 100);

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
      <div className="flex items-start gap-4">
        {/* Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <StatusIcon className={`h-4 w-4 shrink-0 ${iconColor}`} />
            <h3 className="text-sm font-semibold text-slate-900">Executive Summary</h3>
          </div>

          <div className="space-y-1.5 text-sm">
            <p className="text-slate-700">
              <span className="text-slate-900 font-medium">{stats.total}</span> tests ran across{' '}
              <span className="text-slate-900 font-medium">{suites.length} suite{suites.length !== 1 ? 's' : ''}</span>{' '}
              in <span className="text-indigo-700 font-medium">{formatDuration(stats.duration)}</span>.
            </p>

            <p className="text-slate-600">
              <span className="text-emerald-600 font-semibold">{stats.passed}</span> passed ({stats.passRate}%)
              {stats.failed > 0 && (
                <> · <span className="text-red-600 font-semibold">{stats.failed}</span> failed ({failPct}%)</>
              )}
              {stats.flaky > 0 && (
                <> · <span className="text-amber-600 font-semibold">{stats.flaky}</span> flaky ({flakyPct}%)</>
              )}
              {stats.skipped > 0 && (
                <> · <span className="text-slate-500">{stats.skipped}</span> skipped</>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
