import { Filter } from 'lucide-react';
import { clsx } from 'clsx';
import type { Environment } from '../../types';
import { reportPipelineLabel, type ReportPipeline } from '../../utils/helpers';

export type PipelineFilter = 'all' | ReportPipeline;

/**
 * Which pipelines actually run in each environment. QA and SIT run all three;
 * PPE's Salesforce sandbox only exists for the EstimationAI UI suite today.
 */
const PIPELINES_BY_ENV: Record<Environment, ReportPipeline[]> = {
  QA: ['estimation-api', 'estimation-ai-api', 'estimation-ai-ui'],
  SIT: ['estimation-api', 'estimation-ai-api', 'estimation-ai-ui'],
  PPE: ['estimation-ai-ui'],
};

export function availablePipelines(environment: Environment): ReportPipeline[] {
  return PIPELINES_BY_ENV[environment] ?? [];
}

export function ReportPipelineSelect({
  value,
  onChange,
  environment,
  size = 'md',
}: {
  value: PipelineFilter;
  onChange: (v: PipelineFilter) => void;
  environment: Environment;
  size?: 'md' | 'sm';
}) {
  const compact = size === 'sm';
  const options = availablePipelines(environment);
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={clsx(
          'flex shrink-0 items-center gap-1 rounded-full bg-violet-50 font-bold uppercase tracking-wide text-violet-600',
          compact ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-xs gap-1.5',
        )}
      >
        <Filter className={compact ? 'h-3 w-3' : 'h-4 w-4'} />
        {compact ? 'Pipeline' : 'Report Type'}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as PipelineFilter)}
        className={clsx(
          'rounded-2xl border border-slate-200 bg-white font-semibold text-slate-700 shadow-sm transition-all duration-150 hover:shadow-md focus:outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-500/15',
          compact ? 'px-2.5 py-1.5 text-xs' : 'px-4 py-2.5 text-sm',
        )}
      >
        <option value="all">All Tests</option>
        {options.map((p) => (
          <option key={p} value={p}>
            {reportPipelineLabel(p)}
          </option>
        ))}
      </select>
    </div>
  );
}
