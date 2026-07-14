import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileText, X, Zap, BarChart2, TrendingUp } from 'lucide-react';
import { clsx } from 'clsx';
import { reportsApi, ApiError } from '../api/client';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

const FEATURES = [
  { icon: BarChart2, title: 'Visual Breakdown', desc: 'Donut and bar charts with pass/fail/skip/flaky status at a glance.' },
  { icon: Zap, title: 'Error Insights', desc: 'Automatically categorise failures by assertion, timeout, network and more.' },
  { icon: TrendingUp, title: 'Trend Tracking', desc: 'Compare pass rates across every report you have ever uploaded.' },
];

export function UploadPage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [duplicateId, setDuplicateId] = useState<string | null>(null);

  const accept = (f: File) => {
    setError('');
    setDuplicateId(null);
    if (!f.name.toLowerCase().endsWith('.html')) {
      setError('Please select a Playwright HTML report file (.html).');
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

  return (
    <div className="animate-slide-up">
      {/* Hero */}
      <div className="mb-12 text-center">
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
          Upload your Playwright HTML report and get an instant, visual breakdown of your test suite's health.
        </p>
      </div>

      {/* Drop zone */}
      <div className="mx-auto max-w-2xl mb-10">
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={() => !file && inputRef.current?.click()}
          className={clsx(
            'relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-14 text-center transition-all duration-200',
            dragging
              ? 'border-indigo-500 bg-indigo-500/10 scale-[1.01]'
              : file
              ? 'border-emerald-500/50 bg-emerald-500/5'
              : 'border-slate-300 bg-slate-200/40 hover:border-slate-500 hover:bg-slate-200/60 cursor-pointer',
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".html"
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
                    ? 'bg-indigo-500/30 text-indigo-700 scale-110'
                    : 'bg-slate-300 text-slate-600',
                )}
              >
                <Upload className="h-8 w-8" />
              </div>
              <p className="text-slate-900 font-semibold text-lg mb-1">
                {dragging ? 'Drop it here!' : 'Drop your HTML report here'}
              </p>
              <p className="text-slate-600 text-sm">or click to browse your files</p>
              <p className="mt-4 text-xs text-slate-400 font-mono">
                Supports Playwright HTML reports · Max 50 MB
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
            <div className="h-1.5 w-full rounded-full bg-slate-300 overflow-hidden">
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
      </div>

      {/* Feature cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 max-w-4xl mx-auto">
        {FEATURES.map(({ icon: Icon, title, desc }) => (
          <Card key={title} className="text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-600">
              <Icon className="h-5 w-5" />
            </div>
            <h3 className="font-semibold text-slate-900 text-sm mb-1">{title}</h3>
            <p className="text-slate-600 text-xs leading-relaxed">{desc}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
