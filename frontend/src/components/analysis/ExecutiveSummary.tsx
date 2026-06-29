import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import type { ParsedReport } from '../../types';
import { formatDuration } from '../../utils/helpers';
import { getQualityGrade } from '../../utils/pdfExport';

export function ExecutiveSummary({ report }: { report: ParsedReport }) {
  const { stats, suites, errorGroups } = report;
  const { grade, label, tailwind } = getQualityGrade(stats.passRate, stats.flaky, stats.total);

  const topError  = errorGroups[0];
  const failPct   = Math.round((stats.failed  / stats.total) * 100);
  const flakyPct  = Math.round((stats.flaky   / stats.total) * 100);

  const StatusIcon =
    stats.passRate >= 85 ? CheckCircle2 :
    stats.passRate >= 70 ? AlertTriangle :
    XCircle;

  const iconColor =
    stats.passRate >= 85 ? 'text-emerald-400' :
    stats.passRate >= 70 ? 'text-amber-400' :
    'text-red-400';

  const assessment =
    stats.passRate >= 95  ? 'Quality is excellent. No critical action required.' :
    stats.passRate >= 85  ? `Good quality. Fix ${stats.failed + stats.flaky} test(s) to reach the 95% target.` :
    stats.passRate >= 70  ? 'Quality below target — immediate review of failing tests recommended.' :
    'Critical: Pass rate is severely below threshold. Halt deployments and escalate.';

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-5">
      <div className="flex items-start gap-4">
        {/* Grade badge */}
        <div className={`flex-shrink-0 flex flex-col items-center justify-center w-16 h-16 rounded-xl border-2 ${tailwind.bg}`}>
          <span className={`text-3xl font-black leading-none ${tailwind.text}`}>{grade}</span>
          <span className={`text-[9px] font-semibold mt-0.5 ${tailwind.text} opacity-70`}>{label}</span>
        </div>

        {/* Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <StatusIcon className={`h-4 w-4 shrink-0 ${iconColor}`} />
            <h3 className="text-sm font-semibold text-white">Executive Summary</h3>
          </div>

          <div className="space-y-1.5 text-sm">
            <p className="text-slate-300">
              <span className="text-white font-medium">{stats.total}</span> tests ran across{' '}
              <span className="text-white font-medium">{suites.length} suite{suites.length !== 1 ? 's' : ''}</span>{' '}
              in <span className="text-indigo-300 font-medium">{formatDuration(stats.duration)}</span>.
            </p>

            <p className="text-slate-400">
              <span className="text-emerald-400 font-semibold">{stats.passed}</span> passed ({stats.passRate}%)
              {stats.failed > 0 && (
                <> · <span className="text-red-400 font-semibold">{stats.failed}</span> failed ({failPct}%)</>
              )}
              {stats.flaky > 0 && (
                <> · <span className="text-amber-400 font-semibold">{stats.flaky}</span> flaky ({flakyPct}%)</>
              )}
              {stats.skipped > 0 && (
                <> · <span className="text-slate-500">{stats.skipped}</span> skipped</>
              )}
            </p>

            {topError && (
              <p className="text-slate-400 text-xs">
                Primary failure type:{' '}
                <span className="text-amber-300 font-medium">{topError.label}</span>{' '}
                ({topError.count} occurrence{topError.count !== 1 ? 's' : ''})
              </p>
            )}

            <p className={`text-sm font-medium ${tailwind.text}`}>{assessment}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
