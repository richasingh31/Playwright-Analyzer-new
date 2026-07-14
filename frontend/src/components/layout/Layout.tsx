import { Navbar } from './Navbar';

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main className="mx-auto max-w-7xl px-6 py-8 animate-fade-in">{children}</main>
    </div>
  );
}
