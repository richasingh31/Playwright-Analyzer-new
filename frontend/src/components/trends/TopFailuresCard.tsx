import { useMemo } from 'react';
import type { ErrorCategory, ParsedReport } from '../../types';
import { ERROR_CATEGORY_CONFIG, flattenTests, formatDate } from '../../utils/helpers';
import { Card, CardHeader } from '../ui/Card';

interface FailureAgg {
  fullTitle: string;
  title: string;
  file: string;
  failCount: number;
  totalRuns: number;
  lastFailedAt: number;
  lastErrorMessage?: string;
  lastErrorCategory?: ErrorCategory;
}

function reportTime(r: ParsedReport): number {
  return r.metadata?.startTime ?? new Date(r.uploadedAt).getTime();
}

/** Aggregates failure frequency per scenario across every uploaded run, most-failing first. */
function buildTopFailures(reports: ParsedReport[], limit: number): FailureAgg[] {
  const sorted = [...reports].sort((a, b) => reportTime(a) - reportTime(b));
  const map = new Map<string, FailureAgg>();

  sorted.forEach((report) => {
    flattenTests(report.suites).forEach((test) => {
      if (!map.has(test.fullTitle)) {
        map.set(test.fullTitle, {
          fullTitle: test.fullTitle,
          title: test.title,
          file: test.file,
          failCount: 0,
          totalRuns: 0,
          lastFailedAt: 0,
        });
      }
      const agg = map.get(test.fullTitle)!;
      agg.totalRuns += 1;
      if (test.status === 'failed') {
        agg.failCount += 1;
        agg.lastFailedAt = reportTime(report);
        agg.lastErrorMessage = test.error?.message;
        agg.lastErrorCategory = test.error?.category;
      }
    });
  });

  return Array.from(map.values())
    .filter((a) => a.failCount > 0)
    .sort((a, b) => b.failCount - a.failCount || b.lastFailedAt - a.lastFailedAt)
    .slice(0, limit);
}

export function TopFailuresCard({ reports }: { reports: ParsedReport[] }) {
  const topFailures = useMemo(() => buildTopFailures(reports, 8), [reports]);

  if (topFailures.length === 0) return null;

  return (
    <Card>
      <CardHeader
        title="Top Failing Scenarios"
        subtitle="Most frequently failing tests across all uploaded runs"
      />
      <div className="overflow-x-auto -mx-2">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 border-b border-slate-300/60">
              <th className="pb-3 px-2 font-medium">Scenario</th>
              <th className="pb-3 px-2 font-medium">Suite / File</th>
              <th className="pb-3 px-2 font-medium text-center">Fails</th>
              <th className="pb-3 px-2 font-medium text-center">Runs</th>
              <th className="pb-3 px-2 font-medium">Category</th>
              <th className="pb-3 px-2 font-medium">Last Failed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-300/40">
            {topFailures.map((f) => {
              const cat = f.lastErrorCategory ? ERROR_CATEGORY_CONFIG[f.lastErrorCategory] : null;
              return (
                <tr key={f.fullTitle} className="hover:bg-slate-200/40 transition-colors">
                  <td
                    className="py-3 px-2 text-slate-900 font-medium max-w-[260px] truncate"
                    title={f.fullTitle}
                  >
                    {f.title}
                  </td>
                  <td className="py-3 px-2 text-slate-500 max-w-[200px] truncate" title={f.file}>
                    {f.file}
                  </td>
                  <td className="py-3 px-2 text-center text-red-600 font-semibold">{f.failCount}</td>
                  <td className="py-3 px-2 text-center text-slate-500">{f.totalRuns}</td>
                  <td className="py-3 px-2">
                    {cat && (
                      <span
                        className="text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
                        style={{ color: cat.hex, backgroundColor: `${cat.hex}20` }}
                      >
                        {cat.label}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-2 text-slate-600 whitespace-nowrap">
                    {formatDate(new Date(f.lastFailedAt).toISOString())}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
