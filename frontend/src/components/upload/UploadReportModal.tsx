import { useState, useRef, useCallback } from 'react';
import { Upload, FileText, X } from 'lucide-react';
import { clsx } from 'clsx';
import { reportsApi } from '../../api/client';
import type { UploadResponse } from '../../types';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

interface UploadReportModalProps {
  onClose: () => void;
  onUploaded: (report: UploadResponse) => void;
}

export function UploadReportModal({ onClose, onUploaded }: UploadReportModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const accept = (f: File) => {
    setError('');
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
    try {
      const report = await reportsApi.upload(file, setProgress);
      onUploaded(report);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <Modal title="Upload New Report" onClose={onClose}>
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => !file && inputRef.current?.click()}
        className={clsx(
          'relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 text-center transition-all duration-200',
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
          accept=".xml"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && accept(e.target.files[0])}
        />

        {file ? (
          <>
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-600">
              <FileText className="h-6 w-6" />
            </div>
            <p className="font-semibold text-slate-900">{file.name}</p>
            <p className="mt-1 text-slate-600 text-sm">
              {(file.size / 1024).toFixed(1)} KB — ready to analyze
            </p>
            <button
              onClick={(e) => { e.stopPropagation(); setFile(null); setError(''); }}
              className="mt-3 flex items-center gap-1 text-xs text-slate-500 hover:text-red-600 transition-colors"
            >
              <X className="h-3.5 w-3.5" /> Remove file
            </button>
          </>
        ) : (
          <>
            <div
              className={clsx(
                'mb-4 flex h-14 w-14 items-center justify-center rounded-2xl transition-all',
                dragging
                  ? 'bg-indigo-500/30 text-indigo-700 scale-110'
                  : 'bg-slate-300 text-slate-600',
              )}
            >
              <Upload className="h-7 w-7" />
            </div>
            <p className="text-slate-900 font-semibold mb-1">
              {dragging ? 'Drop it here!' : 'Drop your XML report here'}
            </p>
            <p className="text-slate-600 text-sm">or click to browse your files</p>
            <p className="mt-3 text-xs text-slate-400 font-mono">
              Supports Playwright JUnit XML reports · Max 50 MB
            </p>
          </>
        )}
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-600">
          <span>⚠</span>
          <span>{error}</span>
        </div>
      )}

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

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={uploading}>
          Cancel
        </Button>
        <Button onClick={handleUpload} disabled={!file} loading={uploading}>
          Upload &amp; Analyze
        </Button>
      </div>
    </Modal>
  );
}
