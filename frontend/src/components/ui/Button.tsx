import { clsx } from 'clsx';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading,
  icon,
  className,
  disabled,
  ...rest
}: ButtonProps) {
  const variants = {
    primary:
      'bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20',
    secondary:
      'bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-900 border border-slate-300',
    ghost: 'bg-transparent hover:bg-slate-100 text-slate-600 hover:text-slate-900',
    danger: 'bg-red-600 hover:bg-red-500 active:bg-red-700 text-white shadow-lg shadow-red-500/20',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-xs gap-1.5',
    md: 'px-4 py-2 text-sm gap-2',
    lg: 'px-6 py-3 text-base gap-2',
  };

  return (
    <button
      disabled={disabled ?? loading}
      className={clsx(
        'inline-flex items-center justify-center rounded-xl font-medium',
        'transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}
