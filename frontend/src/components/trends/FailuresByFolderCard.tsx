import { useMemo, useState } from 'react';
import { CheckCircle2, X, XCircle, CalendarRange } from 'lucide-react';
import {
  ResponsiveContainer,
  Treemap,
  Tooltip as RechartsTooltip,
} from 'recharts';
import type { ParsedReport } from '../../types';
import { flattenTests, formatDate } from '../../utils/helpers';
import { Card, CardHeader } from '../ui/Card';

// ── Types ─────────────────────────────────────────────────────────────────────

type CellStatus = 'passed' | 'failed' | 'flaky' | 'skipped' | 'missing';

interface FolderLeafTest {
  title: string;
  status: CellStatus;
  errorMessage?: string;
  reportName: string;
  reportDate: string;
}

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

function trunc(s: string, max: number) {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

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
      tests: tests.map(({ title, status, errorMessage, reportName, reportDate }) => ({
        title,
        status,
        errorMessage,
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

/** Aggregates failures-by-folder across every test execution in the given reports. */
function buildFolderTree(reports: ParsedReport[]): FolderTreeNode[] {
  const withSegments = reports.flatMap((report) =>
    flattenTests(report.suites).map((t) => {
      const normalized = t.file.replace(/\\/g, '/').replace(/^\.?\//, '');
      const parts = normalized.split('/').filter(Boolean);
      return {
        title: t.title,
        status: t.status as CellStatus,
        errorMessage: t.error?.message,
        reportName: report.name,
        reportDate: reportShortDate(report),
        segments: parts,
      };
    }),
  );

  if (withSegments.length === 0) return [];

  // strip directory segments shared by every test so the treemap starts at the first branch
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

// ── Treemap tile ──────────────────────────────────────────────────────────────

function TreemapTile(props: Record<string, any>) {
  const { x, y, width, height, name, children, failRate, failed, total, depth } = props;
  if (x == null || width <= 0 || height <= 0) return null;

  const isBranch = !!(children && children.length);
  const isRoot = depth === 0;
  const fill = isRoot ? 'transparent' : folderColor(failRate ?? 0, failed ?? 0);
  const txt = folderTextColor(fill === 'transparent' ? '#ffffff' : fill);
  const pad = 10;
  const showChevron = isBranch && !isRoot && width > 34 && height > 26;
  const showName = !isRoot && width > 44 && height > 24;
  const showStats = !isRoot && width > 84 && height > 46;

  const maxChars = Math.max(3, Math.floor((width - pad * 2 - (showChevron ? 16 : 0)) / 6.3));
  const label = trunc(name ?? '', maxChars);

  return (
    <g style={{ cursor: isRoot ? 'default' : 'pointer' }}>
      {!isRoot && (
        <rect
          x={x + 1.5}
          y={y + 1.5}
          width={Math.max(0, width - 3)}
          height={Math.max(0, height - 3)}
          rx={7}
          fill={fill}
          stroke="#ffffff"
          strokeWidth={2}
        />
      )}
      {showName && (
        <text
          x={x + pad}
          y={y + (showStats ? 23 : height / 2 + 4)}
          fontSize={12.5}
          fontWeight={600}
          fill={txt}
        >
          {label}
        </text>
      )}
      {showStats && (
        <text x={x + pad} y={y + height - 12} fontSize={11} fill={txt} opacity={0.9}>
          {failed > 0 ? `${failed}/${total} failing · ${failRate}%` : `${total} passing`}
        </text>
      )}
      {showChevron && (
        <polyline
          points={`${x + width - 18},${y + height / 2 - 5} ${x + width - 11},${y + height / 2} ${x + width - 18},${y + height / 2 + 5}`}
          fill="none"
          stroke={txt}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.75}
        />
      )}
    </g>
  );
}

function FolderTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: FolderTreeNode & { children?: unknown[] } }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  if (!d || d.total == null) return null;
  const color = folderColor(d.failRate, d.failed);
  return (
    <div className="rounded-xl border border-slate-400 bg-slate-200/95 p-3 shadow-2xl text-xs max-w-[220px]">
      <p className="font-semibold text-slate-900 mb-2 break-all">{d.name}</p>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-slate-600">Fail rate</span>
          <span className="font-bold" style={{ color }}>{d.failRate}%</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-red-600">Failing</span>
          <span className="text-red-600 font-medium">{d.failed}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-600">Total tests</span>
          <span className="text-slate-700">{d.total}</span>
        </div>
      </div>
      <p className="text-slate-400 mt-2 pt-2 border-t border-slate-400/40">
        {d.children && d.children.length > 0 ? 'Click to drill in' : 'Click to see failing tests'}
      </p>
    </div>
  );
}

function FolderDetailPanel({ node, onClose, showRunLabels }: { node: FolderTreeNode; onClose: () => void; showRunLabels: boolean }) {
  const failing = (node.tests ?? []).filter((t) => t.status === 'failed' || t.status === 'flaky');

  return (
    <div className="mt-5 pt-5 border-t border-slate-200">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-slate-900" title={node.fullPath || node.name}>
            {node.fullPath || node.name}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">{node.failed} failing of {node.total} tests</p>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 transition-colors shrink-0"
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {failing.length === 0 ? (
        <p className="text-sm text-emerald-600 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" /> All tests passing in this folder.
        </p>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
          {failing.map((t, i) => (
            <div key={i} className="flex items-start gap-2 rounded-lg px-3 py-2 bg-red-50 border border-red-100">
              <XCircle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm text-slate-800 truncate" title={t.title}>{t.title}</p>
                {t.errorMessage && (
                  <p
                    className="text-xs text-red-600/80 mt-0.5 truncate"
                    style={{ fontFamily: 'ui-monospace, monospace' }}
                    title={t.errorMessage}
                  >
                    {t.errorMessage.split('\n')[0]}
                  </p>
                )}
                {showRunLabels && (
                  <p className="text-[11px] text-slate-400 mt-0.5 truncate" title={t.reportName}>
                    in {t.reportName} · {t.reportDate}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FailuresByFoldersTreemap({
  folderTree,
  showRunLabels,
}: {
  folderTree: FolderTreeNode[];
  showRunLabels: boolean;
}) {
  const [selectedLeaf, setSelectedLeaf] = useState<FolderTreeNode | null>(null);

  if (folderTree.length === 0) {
    return (
      <p className="text-center text-sm text-slate-500 py-6">
        No test files found in the selected reports.
      </p>
    );
  }

  const height = Math.min(480, Math.max(300, folderTree.length * 22 + 260));

  return (
    <div>
      {/* Legend */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <span className="text-xs text-slate-500 shrink-0">Fail rate</span>
        <div className="w-full max-w-[220px]">
          <div className="flex justify-between text-[10px] text-slate-400 mb-1 font-mono">
            <span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span>
          </div>
          <div
            className="h-2 rounded-full"
            style={{ background: 'linear-gradient(to right, #7f1d1d, #b91c1c, #ef4444, #f87171, #fecaca)' }}
          />
        </div>
        <span className="flex items-center gap-1.5 text-xs text-slate-500 ml-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#10b981' }} />
          No failures
        </span>
      </div>

      <div className="treemap-breadcrumb">
        <style>{`
          .treemap-breadcrumb .recharts-treemap-nest-index-wrapper {
            display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
            margin-top: 10px !important; text-align: left !important;
          }
          .treemap-breadcrumb .recharts-treemap-nest-index-box {
            background: #f1f5f9 !important; color: #475569 !important;
            padding: 3px 10px !important; border-radius: 9999px !important;
            font-size: 11px !important; font-weight: 500 !important;
            margin-right: 0 !important; transition: background 0.15s;
          }
          .treemap-breadcrumb .recharts-treemap-nest-index-box:hover { background: #e2e8f0 !important; }
          .treemap-breadcrumb .recharts-treemap-nest-index-box:last-child {
            background: #1e293b !important; color: #fff !important; cursor: default;
          }
        `}</style>
        <ResponsiveContainer width="100%" height={height}>
          <Treemap
            data={folderTree}
            dataKey="size"
            nameKey="name"
            type="nest"
            aspectRatio={4 / 3}
            isAnimationActive={false}
            content={<TreemapTile />}
            nestIndexContent={(item: any) => item?.name ?? 'All folders'}
            onClick={(node: any) => {
              setSelectedLeaf(!node.children || !node.children.length ? node : null);
            }}
          >
            <RechartsTooltip content={<FolderTooltip />} />
          </Treemap>
        </ResponsiveContainer>
      </div>

      {selectedLeaf && (
        <FolderDetailPanel
          node={selectedLeaf}
          onClose={() => setSelectedLeaf(null)}
          showRunLabels={showRunLabels}
        />
      )}
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
      <CalendarRange className="h-3.5 w-3.5 text-slate-400 shrink-0" />
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
          title="Clear date filter"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ── Page-level card ───────────────────────────────────────────────────────────

export function FailuresByFolderCard({ reports }: { reports: ParsedReport[] }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const sorted = useMemo(
    () => [...reports].sort((a, b) => reportTime(a) - reportTime(b)),
    [reports],
  );

  const minDate = sorted.length ? toDateInputValue(reportTime(sorted[0])) : '';
  const maxDate = sorted.length ? toDateInputValue(reportTime(sorted[sorted.length - 1])) : '';

  const filtered = useMemo(() => {
    if (!from && !to) return sorted;
    const fromTs = from ? new Date(`${from}T00:00:00`).getTime() : -Infinity;
    const toTs = to ? new Date(`${to}T23:59:59.999`).getTime() : Infinity;
    return sorted.filter((r) => {
      const t = reportTime(r);
      return t >= fromTs && t <= toTs;
    });
  }, [sorted, from, to]);

  const folderTree = useMemo(() => buildFolderTree(filtered), [filtered]);
  const showRunLabels = filtered.length > 1;

  if (reports.length === 0) return null;

  return (
    <Card>
      <CardHeader
        title="Failures by Folder"
        subtitle={
          from || to
            ? `${filtered.length} of ${reports.length} reports · size is test volume, color is fail rate`
            : `Aggregated across all ${reports.length} report${reports.length !== 1 ? 's' : ''} — size is test volume, color is fail rate`
        }
        action={
          <DateRangeFilter
            from={from}
            to={to}
            minDate={minDate}
            maxDate={maxDate}
            onChange={(f, t) => { setFrom(f); setTo(t); }}
          />
        }
      />
      <FailuresByFoldersTreemap folderTree={folderTree} showRunLabels={showRunLabels} />
    </Card>
  );
}
