import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';

interface Props {
  onClick: () => Promise<void>;
  label?: string;
}

export function ExportPDFButton({ onClick, label = 'Download PDF' }: Props) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      await onClick();
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Download className="h-3.5 w-3.5" />
      )}
      {loading ? 'Generating PDF…' : label}
    </button>
  );
}
