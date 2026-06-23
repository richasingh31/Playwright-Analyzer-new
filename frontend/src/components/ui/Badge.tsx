import { clsx } from 'clsx';
import type { TestStatus } from '../../types';
import { STATUS_CONFIG } from '../../utils/helpers';

export function StatusBadge({
  status,
  size = 'md',
}: {
  status: TestStatus;
  size?: 'sm' | 'md';
}) {
  const c = STATUS_CONFIG[status];
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full font-medium ring-1',
        c.color,
        c.bg,
        c.border.replace('border-', 'ring-'),
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs',
      )}
    >
      <span
        className={clsx('h-1.5 w-1.5 rounded-full', {
          'bg-emerald-400': status === 'passed',
          'bg-red-400': status === 'failed',
          'bg-slate-400': status === 'skipped',
          'bg-amber-400': status === 'flaky',
        })}
      />
      {c.label}
    </span>
  );
}
