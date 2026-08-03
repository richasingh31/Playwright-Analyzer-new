import { useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, ChevronUp, Maximize2, Minimize2, X, XCircle, CalendarRange } from 'lucide-react';
import type { ParsedReport } from '../../types';
import { flattenTests, formatDate } from '../../utils/helpers';
import { Card, CardHeader } from '../ui/Card';

// ── Types ─────────────────────────────────────────────────────────────────────

type CellStatus = 'passed' | 'failed' | 'flaky' | 'skipped' | 'missing';

interface FolderLeafTest {
  title: string;
  status: CellStatus;
  errorMessage?: string;
  errorStack?: string;
  errorCategory?: string;
  reportName: string;
  reportDate: string;
}

const CATEGORY_STYLE: Record<string, { label: string; color: string; bg: string; border: string }> = {
  assertion:            { label: 'Assertion',    color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.3)' },
  timeout:              { label: 'Timeout',      color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.3)' },
  network:               { label: 'Network',      color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',  border: 'rgba(59,130,246,0.3)' },
  'element-not-found':   { label: 'Element',      color: '#a855f7', bg: 'rgba(168,85,247,0.1)', border: 'rgba(168,85,247,0.3)' },
  runtime:               { label: 'Runtime',      color: '#ec4899', bg: 'rgba(236,72,153,0.1)',  border: 'rgba(236,72,153,0.3)' },
  application:           { label: 'Application',  color: '#64748b', bg: 'rgba(100,116,139,0.1)', border: 'rgba(100,116,139,0.3)' },
};

interface FolderTreeNode {
  name: string;
  fullPath: string;
  children?: FolderTreeNode[];
  size?: number;
  total: number;
  failed: number;
  passed: number;
  skipped: number;
  failRate: number;
  tests?: FolderLeafTest[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function reportTime(r: ParsedReport): number {
  return r.metadata?.startTime ?? new Date(r.uploadedAt).getTime();
}

function reportShortDate(r: ParsedReport): string {
  return formatDate(new Date(reportTime(r)).toISOString()).split(',')[0];
}

function toDateInputValue(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function folderColor(failRate: number, failed: number): string {
  if (failed === 0) return '#10b981'; // reserved status green — perfectly healthy folder
  const t = Math.min(1, Math.max(0, failRate / 100));
  const from = [0xfe, 0xca, 0xca]; // red-200
  const to = [0x7f, 0x1d, 0x1d]; // red-900
  const rgb = from.map((c, i) => Math.round(c + (to[i] - c) * t));
  return `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

function folderTextColor(bgHex: string): string {
  const r = parseInt(bgHex.slice(1, 3), 16);
  const g = parseInt(bgHex.slice(3, 5), 16);
  const b = parseInt(bgHex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#1e293b' : '#ffffff';
}

// ── Folder tree construction ─────────────────────────────────────────────────

function computeFolderStats(tests: FolderLeafTest[]) {
  const total = tests.length;
  const failed = tests.filter((t) => t.status === 'failed' || t.status === 'flaky').length;
  const passed = tests.filter((t) => t.status === 'passed').length;
  const skipped = tests.filter((t) => t.status === 'skipped').length;
  return { total, failed, passed, skipped, failRate: total > 0 ? Math.round((failed / total) * 100) : 0 };
}

function buildFolderNode(
  tests: (FolderLeafTest & { segments: string[] })[],
  depth: number,
  path: string,
  name: string,
): FolderTreeNode {
  const stats = computeFolderStats(tests);
  const deeper = tests.filter((t) => t.segments.length > depth);

  if (deeper.length === 0) {
    return {
      name,
      fullPath: path,
      size: stats.total,
      tests: tests.map(({ title, status, errorMessage, errorStack, errorCategory, reportName, reportDate }) => ({
        title,
        status,
        errorMessage,
        errorStack,
        errorCategory,
        reportName,
        reportDate,
      })),
      ...stats,
    };
  }

  const groups = new Map<string, (FolderLeafTest & { segments: string[] })[]>();
  deeper.forEach((t) => {
    const seg = t.segments[depth];
    if (!groups.has(seg)) groups.set(seg, []);
    groups.get(seg)!.push(t);
  });

  const here = tests.filter((t) => t.segments.length === depth);

  const children = Array.from(groups.entries()).map(([seg, group]) =>
    buildFolderNode(group, depth + 1, path ? `${path}/${seg}` : seg, seg),
  );

  if (here.length > 0) {
    children.push({
      name: '(other tests)',
      fullPath: path,
      size: here.length,
      tests: here.map(({ title, status, errorMessage, reportName, reportDate }) => ({
        title,
        status,
        errorMessage,
        reportName,
        reportDate,
      })),
      ...computeFolderStats(here),
    });
  }

  return { name, fullPath: path, children, ...stats };
}

// CPQ's specs (postLaborRatesRateOverrides, postOverrides) hit the same
// estimatingapi endpoints as Estimations — fold it into the same top-level
// group instead of showing it as its own folder.
const TOP_FOLDER_ALIASES: Record<string, string> = {
  CPQ: 'Estimations',
};

/** Aggregates failures-by-folder across every test execution in the given reports. */
function buildFolderTree(reports: ParsedReport[]): FolderTreeNode[] {
  const withSegments = reports.flatMap((report) =>
    flattenTests(report.suites).map((t) => {
      const normalized = t.file.replace(/\\/g, '/').replace(/^\.?\//, '');
      const parts = normalized.split('/').filter(Boolean);
      if (parts.length > 0) {
        parts[0] = TOP_FOLDER_ALIASES[parts[0]] ?? parts[0];
      }
      return {
        title: t.title,
        status: t.status as CellStatus,
        errorMessage: t.error?.message,
        errorStack: t.error?.stack,
        errorCategory: t.error?.category,
        reportName: report.name,
        reportDate: reportShortDate(report),
        segments: parts,
      };
    }),
  );

  if (withSegments.length === 0) return [];

  // strip directory segments shared by every test so the grid starts at the first branch
  let commonDepth = 0;
  const maxCommon = Math.min(...withSegments.map((t) => t.segments.length));
  outer: for (let i = 0; i < maxCommon; i++) {
    const seg = withSegments[0].segments[i];
    for (const t of withSegments) {
      if (t.segments[i] !== seg) break outer;
    }
    commonDepth = i + 1;
  }
  const trimmed = withSegments.map((t) => ({ ...t, segments: t.segments.slice(commonDepth) }));

  const root = buildFolderNode(trimmed, 0, '', 'All tests');
  return root.children ?? [];
}

// ── Folder card ───────────────────────────────────────────────────────────────
// Every card is the same fixed size regardless of how many tests it represents —
// test volume is still shown as text, but no longer encoded as tile area. That
// trade-off is what makes the grid immune to the treemap's clipping problem:
// there's no pixel-height math to get wrong, the browser just adds rows.

function FolderCard({ node, onOpen }: { node: FolderTreeNode; onOpen: (node: FolderTreeNode) => void }) {
  const isBranch = !!(node.children && node.children.length);
  const bg = folderColor(node.failRate, node.failed);
  const txt = folderTextColor(bg);

  return (
    <button
      onClick={() => onOpen(node)}
      title={isBranch ? `${node.name} — click to open` : `${node.name} — click to see failing tests`}
      className="flex h-24 flex-col justify-between rounded-xl p-3 text-left shadow-sm ring-1 ring-black/5 transition-transform hover:scale-[1.02] hover:shadow-md"
      style={{ backgroundColor: bg, color: txt }}
    >
      <span className="flex items-start justify-between gap-1">
        <span className="line-clamp-2 break-all text-xs font-semibold leading-tight">{node.name}</span>
        {isBranch && <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-75" />}
      </span>
      <span className="text-[11px] opacity-90">
        {node.failed > 0 ? `${node.failed}/${node.total} failing · ${node.failRate}%` : `${node.total} passing`}
      </span>
    </button>
  );
}

function FolderDetailPanel({ node, onClose, showRunLabels }: { node: FolderTreeNode; onClose: () => void; showRunLabels: boolean }) {
  const failing = (node.tests ?? []).filter((t) => t.status === 'failed' || t.status === 'flaky');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const expandableIdx = failing.reduce<number[]>((acc, t, i) => {
    if (t.errorMessage) acc.push(i);
    return acc;
  }, []);
  const allExpanded = expandableIdx.length > 0 && expandableIdx.every((i) => expanded.has(i));

  const toggleAll = () => setExpanded(allExpanded ? new Set() : new Set(expandableIdx));
  const toggleOne = (i: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <div className="mt-5 pt-5 border-t border-slate-200">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-slate-900" title={node.fullPath || node.name}>
            {node.fullPath || node.name}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">{node.failed} failing of {node.total} tests</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {expandableIdx.length > 0 && (
            <button
              onClick={toggleAll}
              className="flex items-center gap-1.5 rounded-lg bg-slate-100 border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-200 transition-colors"
            >
              {allExpanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
              {allExpanded ? 'Collapse all' : 'Expand all'}
            </button>
          )}
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      {failing.length === 0 ? (
        <p className="text-sm text-emerald-600 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" /> All tests passing in this folder.
        </p>
      ) : (
        <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
          {failing.map((t, i) => {
            const isOpen = expanded.has(i);
            const canExpand = !!t.errorMessage;
            const cat = t.errorCategory ? (CATEGORY_STYLE[t.errorCategory] ?? CATEGORY_STYLE.application) : undefined;
            return (
              <div key={i} className="rounded-lg bg-red-50 border border-red-100 overflow-hidden">
                <div
                  className={`flex items-start gap-2 px-3 py-2 ${canExpand ? 'cursor-pointer' : ''}`}
                  onClick={() => canExpand && toggleOne(i)}
                >
                  <XCircle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-slate-800 truncate flex-1" title={t.title}>{t.title}</p>
                      {cat && (
                        <span
                          className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full border"
                          style={{ color: cat.color, backgroundColor: cat.bg, borderColor: cat.border }}
                        >
                          {cat.label}
                        </span>
                      )}
                    </div>
                    {t.errorMessage && (
                      <p
                        className={`text-xs text-red-600/80 mt-0.5 ${isOpen ? 'whitespace-pre-wrap break-all' : 'truncate'}`}
                        style={{ fontFamily: 'ui-monospace, monospace' }}
                        title={isOpen ? undefined : t.errorMessage}
                      >
                        {isOpen ? t.errorMessage : t.errorMessage.split('\n')[0]}
                      </p>
                    )}
                    {showRunLabels && (
                      <p className="text-[11px] text-slate-400 mt-0.5 truncate" title={t.reportName}>
                        in {t.reportName} · {t.reportDate}
                      </p>
                    )}
                  </div>
                  {canExpand && (
                    <span className="shrink-0 text-slate-400 mt-0.5">
                      {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </span>
                  )}
                </div>
                {isOpen && t.errorStack && (
                  <div className="px-3 pb-3 border-t border-red-500/10 pt-2">
                    <pre
                      className="text-xs text-slate-600 whitespace-pre-wrap break-all leading-relaxed max-h-48 overflow-y-auto rounded-lg p-3"
                      style={{ backgroundColor: 'rgba(0,0,0,0.25)', fontFamily: 'ui-monospace, monospace' }}
                    >
                      {t.errorStack}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FailuresByFolderGrid({
  folderTree,
  showRunLabels,
}: {
  folderTree: FolderTreeNode[];
  showRunLabels: boolean;
}) {
  const [path, setPath] = useState<FolderTreeNode[]>([]);
  const [selectedLeaf, setSelectedLeaf] = useState<FolderTreeNode | null>(null);

  if (folderTree.length === 0) {
    return (
      <p className="text-center text-sm text-slate-500 py-6">
        No test files found in the selected reports.
      </p>
    );
  }

  const current = path.length > 0 ? path[path.length - 1].children ?? [] : folderTree;
  // Color-ordered: perfectly healthy (green) folders always first, then
  // ascending fail rate through light red, with darkest red (highest fail rate) last.
  const visible = [...current].sort((a, b) => {
    if (a.failed === 0 && b.failed === 0) return b.total - a.total;
    if (a.failed === 0) return -1;
    if (b.failed === 0) return 1;
    return a.failRate - b.failRate || a.failed - b.failed;
  });

  const openNode = (node: FolderTreeNode) => {
    if (node.children && node.children.length > 0) {
      setPath((p) => [...p, node]);
      setSelectedLeaf(null);
    } else {
      setSelectedLeaf(node);
    }
  };

  return (
    <div>
      {/* Breadcrumb + legend share one row — no standalone strip wasting vertical space */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => { setPath([]); setSelectedLeaf(null); }}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
              path.length === 0 ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All folders
          </button>
          {path.map((node, i) => (
            <button
              key={node.fullPath || node.name}
              onClick={() => { setPath(path.slice(0, i + 1)); setSelectedLeaf(null); }}
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                i === path.length - 1 ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {node.name}
            </button>
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2.5 shrink-0">
          <span className="text-[11px] font-semibold text-slate-500">Fail Rate</span>
          <span className="text-[10px] text-slate-400 font-mono">100%</span>
          <div
            className="h-2 w-20 rounded-full shadow-inner ring-1 ring-black/5"
            style={{ background: 'linear-gradient(to right, #7f1d1d, #b91c1c, #ef4444, #f87171, #fecaca)' }}
          />
          <span className="text-[10px] text-slate-400 font-mono">0%</span>
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600 pl-2.5 border-l border-slate-200">
            <span className="inline-block h-2 w-2 rounded-full ring-2 ring-emerald-100" style={{ backgroundColor: '#10b981' }} />
            No failures
          </span>
        </div>
      </div>

      {/* Uniform grid — every card is the same size; the grid just wraps onto as
          many rows as needed, so nothing is ever clipped. */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {visible.map((node) => (
          <FolderCard key={node.fullPath || node.name} node={node} onOpen={openNode} />
        ))}
      </div>

      {selectedLeaf && (
        <FolderDetailPanel
          key={selectedLeaf.fullPath || selectedLeaf.name}
          node={selectedLeaf}
          onClose={() => setSelectedLeaf(null)}
          showRunLabels={showRunLabels}
        />
      )}
    </div>
  );
}

// ── Date dropdown ────────────────────────────────────────────────────────────

function ReportDateSelect({
  reports,
  value,
  onChange,
}: {
  reports: ParsedReport[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <CalendarRange className="h-3.5 w-3.5 text-slate-400 shrink-0" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-slate-700"
      >
        <option value="">All dates</option>
        {reports.map((r) => (
          <option key={r.id} value={r.id}>
            {reportShortDate(r)} — {r.name}
          </option>
        ))}
      </select>
    </div>
  );
}

// ── Date range filter ─────────────────────────────────────────────────────────

function DateRangeFilter({
  from,
  to,
  minDate,
  maxDate,
  onChange,
}: {
  from: string;
  to: string;
  minDate: string;
  maxDate: string;
  onChange: (from: string, to: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <input
        type="date"
        value={from}
        min={minDate}
        max={to || maxDate}
        onChange={(e) => onChange(e.target.value, to)}
        className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-slate-700"
      />
      <span className="text-slate-400">to</span>
      <input
        type="date"
        value={to}
        min={from || minDate}
        max={maxDate}
        onChange={(e) => onChange(from, e.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-slate-700"
      />
      {(from || to) && (
        <button
          onClick={() => onChange('', '')}
          className="text-slate-400 hover:text-slate-600 transition-colors"
          title="Clear date range"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ── Page-level card ───────────────────────────────────────────────────────────

export function FailuresByFolderCard({
  reports,
  title = 'Test Results Heatmap',
}: {
  reports: ParsedReport[];
  title?: string;
}) {
  const [selectedId, setSelectedId] = useState('');
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');

  const sorted = useMemo(
    () => [...reports].sort((a, b) => reportTime(a) - reportTime(b)),
    [reports],
  );

  // Newest first in the dropdown, oldest-first order is only needed internally.
  const dropdownReports = useMemo(() => [...sorted].reverse(), [sorted]);

  const minDate = sorted.length ? toDateInputValue(reportTime(sorted[0])) : '';
  const maxDate = sorted.length ? toDateInputValue(reportTime(sorted[sorted.length - 1])) : '';

  const hasRange = !!(rangeFrom || rangeTo);

  const filtered = useMemo(() => {
    if (hasRange) {
      const fromTs = rangeFrom ? new Date(`${rangeFrom}T00:00:00`).getTime() : -Infinity;
      const toTs = rangeTo ? new Date(`${rangeTo}T23:59:59.999`).getTime() : Infinity;
      return sorted.filter((r) => {
        const t = reportTime(r);
        return t >= fromTs && t <= toTs;
      });
    }
    if (selectedId) return sorted.filter((r) => r.id === selectedId);
    return sorted;
  }, [sorted, selectedId, hasRange, rangeFrom, rangeTo]);

  const folderTree = useMemo(() => buildFolderTree(filtered), [filtered]);
  const showRunLabels = filtered.length > 1;

  const selectReport = (id: string) => {
    setSelectedId(id);
    if (id) { setRangeFrom(''); setRangeTo(''); }
  };

  const selectRange = (from: string, to: string) => {
    setRangeFrom(from);
    setRangeTo(to);
    if (from || to) setSelectedId('');
  };

  if (reports.length === 0) return null;

  return (
    <Card>
      <CardHeader
        title={title}
        subtitle={
          hasRange
            ? `${filtered.length} of ${reports.length} reports · color is fail rate`
            : selectedId
            ? `Showing 1 of ${reports.length} reports · color is fail rate`
            : `Aggregated across all ${reports.length} report${reports.length !== 1 ? 's' : ''} — color is fail rate`
        }
        action={
          <div className="flex items-center gap-3 flex-wrap">
            <ReportDateSelect reports={dropdownReports} value={selectedId} onChange={selectReport} />
            <span className="text-slate-300 text-xs">|</span>
            <DateRangeFilter from={rangeFrom} to={rangeTo} minDate={minDate} maxDate={maxDate} onChange={selectRange} />
          </div>
        }
      />
      <FailuresByFolderGrid folderTree={folderTree} showRunLabels={showRunLabels} />
    </Card>
  );
}
