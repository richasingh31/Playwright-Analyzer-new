import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Activity, Upload, TrendingUp, Bug, Grid3X3, GitCompare, ShieldCheck, ChevronDown, Globe } from 'lucide-react';
import { clsx } from 'clsx';
import { useEnvironment, ENVIRONMENTS } from '../../context/EnvironmentContext';

const NAV = [
  {
    path: '/trends',
    label: 'Trends',
    Icon: TrendingUp,
    text: 'text-indigo-600',
    hover: 'hover:bg-indigo-50 hover:text-indigo-700',
    active: 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200',
  },
  {
    path: '/failures',
    label: 'Failures',
    Icon: Bug,
    text: 'text-red-600',
    hover: 'hover:bg-red-50 hover:text-red-700',
    active: 'bg-red-100 text-red-700 ring-1 ring-red-200',
  },
  {
    path: '/api-scenarios',
    label: 'Scenarios',
    Icon: Grid3X3,
    text: 'text-violet-600',
    hover: 'hover:bg-violet-50 hover:text-violet-700',
    active: 'bg-violet-100 text-violet-700 ring-1 ring-violet-200',
  },
  {
    path: '/tenant-comparison',
    label: 'Tenant Comparison',
    Icon: GitCompare,
    text: 'text-amber-600',
    hover: 'hover:bg-amber-50 hover:text-amber-700',
    active: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200',
  },
];

function EnvironmentSelect() {
  const { environment, setEnvironment } = useEnvironment();

  return (
    <div className="flex items-center gap-1.5">
      <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-emerald-600">
        <Globe className="h-3.5 w-3.5" />
        Environment
      </span>
      <select
        value={environment}
        onChange={(e) => setEnvironment(e.target.value as typeof environment)}
        className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-all duration-150 hover:shadow-md focus:outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/15"
        title="Only reports uploaded to this environment are shown across the app"
      >
        {ENVIRONMENTS.map((env) => (
          <option key={env} value={env}>
            {env}
          </option>
        ))}
      </select>
    </div>
  );
}

function AdminMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  const active = pathname === '/upload';

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          'flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-bold uppercase tracking-wide transition-all duration-150',
          active || open
            ? 'bg-slate-800 text-white shadow-sm'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
        )}
      >
        <ShieldCheck className="h-3.5 w-3.5" />
        Admin
        <ChevronDown className={clsx('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-40 rounded-lg border border-slate-200 bg-white py-1 shadow-lg animate-fade-in">
          <Link
            to="/upload"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            <Upload className="h-3.5 w-3.5" />
            Upload
          </Link>
        </div>
      )}
    </div>
  );
}

export function Navbar() {
  const { pathname } = useLocation();

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <div className="flex items-center gap-6">
          <Link to="/trends" className="flex items-center gap-3 group">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 shadow-lg shadow-indigo-500/30 group-hover:bg-indigo-500 transition-colors">
              <Activity className="h-4 w-4 text-white" />
            </div>
            <span className="text-base font-bold text-slate-900 tracking-tight">
              API Automation<span className="text-indigo-500"> Dashboard</span>
            </span>
          </Link>

          <div className="flex items-center gap-1.5">
            {NAV.map(({ path, label, Icon, text, hover, active: activeClass }) => {
              const active = pathname === path || pathname.startsWith(path);
              return (
                <Link
                  key={path}
                  to={path}
                  className={clsx(
                    'flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-bold uppercase tracking-wide transition-all duration-150',
                    active ? activeClass : clsx(text, hover),
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </Link>
              );
            })}
          </div>

          <EnvironmentSelect />
        </div>

        <AdminMenu />
      </nav>
    </header>
  );
}
