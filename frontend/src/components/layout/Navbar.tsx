import { Link, useLocation } from 'react-router-dom';
import { Activity, Upload, TrendingUp, Bug, Grid3X3, GitCompare } from 'lucide-react';
import { clsx } from 'clsx';

const NAV = [
  { path: '/', label: 'Upload', Icon: Upload },
  { path: '/trends', label: 'Trends', Icon: TrendingUp },
  { path: '/failures', label: 'Failures', Icon: Bug },
  { path: '/api-scenarios', label: 'API & Scenarios', Icon: Grid3X3 },
  { path: '/tenant-comparison', label: 'Tenant Comparison', Icon: GitCompare },
];

export function Navbar() {
  const { pathname } = useLocation();

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 shadow-lg shadow-indigo-500/30 group-hover:bg-indigo-500 transition-colors">
            <Activity className="h-4 w-4 text-white" />
          </div>
          <span className="text-base font-bold text-slate-900 tracking-tight">
            Playwright<span className="text-indigo-500">Analyzer</span>
          </span>
        </Link>

        <div className="flex items-center gap-1">
          {NAV.map(({ path, label, Icon }) => {
            const active = pathname === path || (path !== '/' && pathname.startsWith(path));
            return (
              <Link
                key={path}
                to={path}
                className={clsx(
                  'flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-all duration-150',
                  active
                    ? 'bg-slate-200 text-slate-900'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
