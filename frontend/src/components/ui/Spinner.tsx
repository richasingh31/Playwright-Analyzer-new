import { Loader2 } from 'lucide-react';
import { clsx } from 'clsx';

export function Spinner({
  size = 'md',
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  return (
    <Loader2
      className={clsx(
        'animate-spin text-indigo-400',
        { 'h-4 w-4': size === 'sm', 'h-8 w-8': size === 'md', 'h-12 w-12': size === 'lg' },
        className,
      )}
    />
  );
}

export function FullPageSpinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex h-72 flex-col items-center justify-center gap-4">
      <Spinner size="lg" />
      <p className="text-slate-400 text-sm">{label}</p>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex h-72 flex-col items-center justify-center gap-3 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/15 text-red-400 text-2xl">
        ⚠
      </div>
      <p className="text-slate-300 font-medium">Something went wrong</p>
      <p className="text-slate-500 text-sm max-w-md">{message}</p>
    </div>
  );
}
