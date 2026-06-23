import { clsx } from 'clsx';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hoverable?: boolean;
  glow?: 'emerald' | 'red' | 'amber' | 'indigo';
}

const glowMap = {
  emerald: 'hover:shadow-emerald-500/10 hover:border-emerald-500/40',
  red: 'hover:shadow-red-500/10 hover:border-red-500/40',
  amber: 'hover:shadow-amber-500/10 hover:border-amber-500/40',
  indigo: 'hover:shadow-indigo-500/10 hover:border-indigo-500/40',
};

export function Card({ children, className, onClick, hoverable, glow }: CardProps) {
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
      className={clsx(
        'bg-slate-800/60 border border-slate-700/60 rounded-2xl p-6 backdrop-blur-sm',
        'transition-all duration-200',
        hoverable && [
          'hover:bg-slate-800 hover:border-slate-600 hover:shadow-lg',
          glow && glowMap[glow],
        ],
        onClick && 'cursor-pointer select-none',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between mb-5">
      <div>
        <h3 className="text-base font-semibold text-white">{title}</h3>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
