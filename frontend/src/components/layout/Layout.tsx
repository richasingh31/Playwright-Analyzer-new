import { Loader2 } from 'lucide-react';
import { Navbar } from './Navbar';
import { useEnvironment } from '../../context/EnvironmentContext';

export function Layout({ children }: { children: React.ReactNode }) {
  const { environment, isSwitching } = useEnvironment();

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <div className="relative">
        <main className="mx-auto max-w-7xl px-6 py-8 animate-fade-in">{children}</main>

        {isSwitching && (
          <div className="absolute inset-0 z-40 flex items-start justify-center bg-slate-50/80 backdrop-blur-sm pt-40 animate-fade-in">
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-lg">
              <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
              <span className="text-sm font-semibold text-slate-700">
                Switching to <span className="text-emerald-600">{environment}</span>…
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
