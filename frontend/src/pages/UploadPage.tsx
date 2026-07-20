import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Upload,
  FileText,
  X,
  BarChart2,
  ScanLine,
  Sparkles,
  Inbox,
  ChevronRight,
  Clock,
} from 'lucide-react';
import { clsx } from 'clsx';
import { reportsApi, ApiError } from '../api/client';
import type { ReportSummary } from '../types';
import { Button } from '../components/ui/Button';
import { timeAgo, formatDate } from '../utils/helpers';

const STEPS = [
  { icon: FileText, title: 'Select', desc: 'Pick or drop your .xml report' },
  { icon: ScanLine, title: 'Parse', desc: 'Suites, errors & durations extracted' },
  { icon: Sparkles, title: 'Explore', desc: 'Charts, trends & drill-downs ready' },
];

function passRateTone(rate: number) {
  if (rate >= 85) return { text: 'text-emerald-600', bg: 'bg-emerald-50', ring: 'ring-emerald-200' };
  if (rate >= 70) return { text: 'text-amber-600', bg: 'bg-amber-50', ring: 'ring-amber-200' };
  return { text: 'text-red-600', bg: 'bg-red-50', ring: 'ring-red-200' };
}

export function UploadPage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [duplicateId, setDuplicateId] = useState<string | null>(null);

  const [recent, setRecent] = useState<ReportSummary[] | null>(null);

  useEffect(() => {
    reportsApi
      .getAll()
      .then((data) =>
        setRecent([...data].sort((a, b) => +new Date(b.uploadedAt) - +new Date(a.uploadedAt))),
      )
      .catch(() => setRecent([]));
  }, []);

  const accept = (f: File) => {
    setError('');
    setDuplicateId(null);
    if (!f.name.toLowerCase().endsWith('.xml')) {
      setError('Please select a Playwright JUnit XML report file (.xml).');
      return;
    }
    setFile(f);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) accept(f);
  }, []);

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError('');
    setDuplicateId(null);
    try {
      const { id } = await reportsApi.upload(file, setProgress);
      navigate(`/analysis/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
      if (err instanceof ApiError && err.status === 409 && err.existingId) {
        setDuplicateId(err.existingId);
      }
      setUploading(false);
      setProgress(0);
    }
  };

  const activeStep = uploading ? 1 : file ? 1 : 0;

  const avgPassRate =
    recent && recent.length
      ? Math.round(recent.reduce((sum, r) => sum + r.stats.passRate, 0) / recent.length)
      : null;

  return (
    <div className="animate-slide-up relative">
      {/* Ambient background accents */}
      <div className="pointer-events-none absolute inset-x-0 -top-10 -z-10 h-[420px] overflow-hidden">
        <div className="absolute left-1/4 top-0 h-80 w-80 rounded-full bg-indigo-400/30 blur-3xl animate-float" />
        <div className="absolute right-1/4 top-10 h-80 w-80 rounded-full bg-purple-400/30 blur-3xl animate-float-delayed" />
      </div>

      {/* Hero */}
      <div className="mb-10 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-4 py-1.5 text-xs font-medium text-indigo-600 mb-6">
          <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
          Enterprise Playwright Report Analyzer
        </div>
        <h1 className="text-4xl font-bold text-slate-900 mb-3">
          Turn test reports into{' '}
          <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
            actionable insights
          </span>
        </h1>
        <p className="text-slate-600 text-lg max-w-xl mx-auto">
          Upload your Playwright JUnit XML report and get an instant, visual breakdown of your test suite's health.
        </p>
      </div>

      {/* Command center: dropzone + recent reports */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 max-w-6xl mx-auto items-start">
        {/* Left: dropzone + pipeline */}
        <div className="lg:col-span-3">
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onClick={() => !file && inputRef.current?.click()}
            className={clsx(
              'group relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-12 text-center transition-all duration-200 overflow-hidden',
              dragging
                ? 'border-indigo-500 bg-indigo-500/10 scale-[1.01]'
                : file
                ? 'border-emerald-500/50 bg-emerald-500/5'
                : 'border-slate-300 bg-white hover:border-indigo-400 hover:bg-indigo-50/30 cursor-pointer',
            )}
          >
            {/* Corner accents */}
            {[
              'left-3 top-3 border-l-2 border-t-2 rounded-tl-lg',
              'right-3 top-3 border-r-2 border-t-2 rounded-tr-lg',
              'left-3 bottom-3 border-l-2 border-b-2 rounded-bl-lg',
              'right-3 bottom-3 border-r-2 border-b-2 rounded-br-lg',
            ].map((pos) => (
              <span
                key={pos}
                className={clsx(
                  'absolute h-4 w-4 transition-colors duration-200',
                  pos,
                  dragging
                    ? 'border-indigo-500'
                    : file
                    ? 'border-emerald-500/60'
                    : 'border-slate-300 group-hover:border-indigo-400',
                )}
              />
            ))}

            <input
              ref={inputRef}
              type="file"
              accept=".xml"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && accept(e.target.files[0])}
            />

            {file ? (
              <>
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-600">
                  <FileText className="h-7 w-7" />
                </div>
                <p className="font-semibold text-slate-900 text-lg">{file.name}</p>
                <p className="mt-1 text-slate-600 text-sm">
                  {(file.size / 1024).toFixed(1)} KB — ready to analyze
                </p>
                <button
                  onClick={(e) => { e.stopPropagation(); setFile(null); setError(''); }}
                  className="mt-4 flex items-center gap-1 text-xs text-slate-500 hover:text-red-600 transition-colors"
                >
                  <X className="h-3.5 w-3.5" /> Remove file
                </button>
              </>
            ) : (
              <>
                <div
                  className={clsx(
                    'mb-5 flex h-16 w-16 items-center justify-center rounded-2xl transition-all',
                    dragging
                      ? 'bg-gradient-to-br from-indigo-500 to-purple-500 text-white scale-110 shadow-lg shadow-indigo-500/30'
                      : 'bg-gradient-to-br from-slate-100 to-slate-200 text-slate-500 group-hover:from-indigo-100 group-hover:to-purple-100 group-hover:text-indigo-600',
                  )}
                >
                  <Upload className="h-8 w-8" />
                </div>
                <p className="text-slate-900 font-semibold text-lg mb-1">
                  {dragging ? 'Drop it here!' : 'Drop your XML report here'}
                </p>
                <p className="text-slate-600 text-sm">or click to browse your files</p>
                <p className="mt-4 text-xs text-slate-400 font-mono">
                  Supports Playwright JUnit XML reports · Max 50 MB
                </p>
              </>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="mt-3 flex items-start justify-between gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">
              <div className="flex items-start gap-2">
                <span>⚠</span>
                <span>{error}</span>
              </div>
              {duplicateId && (
                <button
                  onClick={() => navigate(`/analysis/${duplicateId}`)}
                  className="shrink-0 whitespace-nowrap rounded-lg border border-red-500/30 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-500/20 transition-colors"
                >
                  View existing report
                </button>
              )}
            </div>
          )}

          {/* Upload progress */}
          {uploading && (
            <div className="mt-4">
              <div className="flex justify-between text-xs text-slate-600 mb-1.5">
                <span>Analyzing report…</span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* CTA */}
          <div className="mt-5 flex justify-center">
            <Button
              size="lg"
              onClick={handleUpload}
              disabled={!file}
              loading={uploading}
              icon={<BarChart2 className="h-5 w-5" />}
              className="px-8"
            >
              Analyze Report
            </Button>
          </div>

          {/* Pipeline */}
          <div className="mt-8 flex items-start justify-between">
            {STEPS.map(({ icon: Icon, title, desc }, i) => (
              <div key={title} className="flex flex-1 items-start">
                <div className="flex flex-col items-center text-center px-2">
                  <div
                    className={clsx(
                      'flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all duration-300',
                      i <= activeStep
                        ? 'border-indigo-500 bg-indigo-500 text-white shadow-md shadow-indigo-500/30'
                        : 'border-slate-300 bg-white text-slate-400',
                      i === 1 && uploading && 'animate-pulse-slow',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <p
                    className={clsx(
                      'mt-2 text-xs font-semibold',
                      i <= activeStep ? 'text-slate-900' : 'text-slate-400',
                    )}
                  >
                    {title}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-400 max-w-[9rem] leading-snug hidden sm:block">
                    {desc}
                  </p>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={clsx(
                      'mt-[18px] h-0.5 flex-1 rounded-full transition-colors duration-300',
                      i < activeStep ? 'bg-indigo-500' : 'bg-slate-200',
                    )}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right: recent reports rail */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-slate-400" />
              <h3 className="text-sm font-semibold text-slate-900">Recent Reports</h3>
            </div>
            {avgPassRate !== null && (
              <span
                className={clsx(
                  'rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset',
                  passRateTone(avgPassRate).text,
                  passRateTone(avgPassRate).bg,
                  passRateTone(avgPassRate).ring,
                )}
              >
                {avgPassRate}% avg pass
              </span>
            )}
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {recent === null &&
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-4 border-b border-slate-50 animate-pulse">
                  <div className="h-9 w-9 rounded-lg bg-slate-100" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-2/3 rounded bg-slate-100" />
                    <div className="h-2.5 w-1/3 rounded bg-slate-100" />
                  </div>
                </div>
              ))}

            {recent !== null && recent.length === 0 && (
              <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                  <Inbox className="h-5 w-5" />
                </div>
                <p className="text-sm font-medium text-slate-600">No reports yet</p>
                <p className="mt-1 text-xs text-slate-400 max-w-[16rem]">
                  Upload your first Playwright JUnit XML report to see it show up here.
                </p>
              </div>
            )}

            {recent !== null &&
              recent.slice(0, 6).map((r) => {
                const tone = passRateTone(r.stats.passRate);
                return (
                  <button
                    key={r.id}
                    onClick={() => navigate(`/analysis/${r.id}`)}
                    className="flex w-full items-center gap-3 border-b border-slate-50 px-5 py-3.5 text-left transition-colors hover:bg-slate-50 last:border-b-0"
                  >
                    <div className={clsx('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', tone.bg, tone.text)}>
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {formatDate(r.startTime ? new Date(r.startTime).toISOString() : r.uploadedAt)}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {timeAgo(r.uploadedAt)} · {r.stats.total} tests
                      </p>
                    </div>
                    <span className={clsx('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold', tone.bg, tone.text)}>
                      {r.stats.passRate}%
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                  </button>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}
