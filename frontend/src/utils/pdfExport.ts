import type { jsPDF as JsPDFType } from 'jspdf';
import type { ParsedReport, ReportSummary } from '../types';
import { formatDuration, formatDate } from './helpers';

// ── Colour palette (RGB tuples) ───────────────────────────────────────────────

type RGB = [number, number, number];

const C = {
  header:  [15,  23,  42]  as RGB, // slate-950
  accent:  [79,  70,  229] as RGB, // indigo-600
  text:    [30,  41,  59]  as RGB, // slate-800
  muted:   [100, 116, 139] as RGB, // slate-500
  light:   [248, 250, 252] as RGB, // slate-50
  border:  [226, 232, 240] as RGB, // slate-200
  passed:  [5,   150, 105] as RGB, // emerald-600
  failed:  [220, 38,  38]  as RGB, // red-600
  flaky:   [217, 119, 6]   as RGB, // amber-600
  skipped: [148, 163, 184] as RGB, // slate-400
  blue:    [37,  99,  235] as RGB, // blue-600
  orange:  [234, 88,  12]  as RGB, // orange-600
  white:   [255, 255, 255] as RGB,
  mutedBg: [148, 163, 184] as RGB,
};

// ── Small helper wrappers ─────────────────────────────────────────────────────

function sf(pdf: JsPDFType, c: RGB) { pdf.setFillColor(c[0], c[1], c[2]); }
function sd(pdf: JsPDFType, c: RGB) { pdf.setDrawColor(c[0], c[1], c[2]); }
function st(pdf: JsPDFType, c: RGB) { pdf.setTextColor(c[0], c[1], c[2]); }

// ── Quality grade ─────────────────────────────────────────────────────────────

export function getQualityGrade(passRate: number, flaky: number, total: number) {
  const flakyPct = total > 0 ? (flaky / total) * 100 : 0;
  if (passRate >= 95 && flakyPct < 3) return { grade: 'A', label: 'Excellent', tailwind: { text: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' }, rgb: C.passed };
  if (passRate >= 85)                 return { grade: 'B', label: 'Good',      tailwind: { text: 'text-blue-400',    bg: 'bg-blue-500/10 border-blue-500/30'    }, rgb: C.blue };
  if (passRate >= 70)                 return { grade: 'C', label: 'Fair',      tailwind: { text: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/30'  }, rgb: C.flaky };
  if (passRate >= 50)                 return { grade: 'D', label: 'Poor',      tailwind: { text: 'text-orange-400',  bg: 'bg-orange-500/10 border-orange-500/30' }, rgb: C.orange };
  return                                      { grade: 'F', label: 'Critical', tailwind: { text: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/30'      }, rgb: C.failed };
}

// ── Table drawing helper ──────────────────────────────────────────────────────

function drawTable(
  pdf: JsPDFType,
  headers: string[],
  rows: string[][],
  x: number,
  startY: number,
  colWidths: number[],
  maxY = 275,
): number {
  const H_ROW = 8;
  const D_ROW = 7;
  const PAD   = 3;
  const totalW = colWidths.reduce((a, b) => a + b, 0);
  let y = startY;

  sf(pdf, C.header);
  pdf.rect(x, y, totalW, H_ROW, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  st(pdf, C.white);
  let cx = x;
  headers.forEach((h, i) => { pdf.text(h, cx + PAD, y + 5.5); cx += colWidths[i]; });
  y += H_ROW;

  rows.forEach((row, ri) => {
    if (y + D_ROW > maxY) return;
    if (ri % 2 === 0) { sf(pdf, C.light); pdf.rect(x, y, totalW, D_ROW, 'F'); }
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    st(pdf, C.text);
    cx = x;
    row.forEach((cell, ci) => {
      const t = pdf.splitTextToSize(String(cell), colWidths[ci] - PAD * 2)[0] ?? '';
      pdf.text(t, cx + PAD, y + 5);
      cx += colWidths[ci];
    });
    y += D_ROW;
  });

  sd(pdf, C.border);
  pdf.setLineWidth(0.3);
  pdf.rect(x, startY, totalW, H_ROW + rows.length * D_ROW, 'S');
  return y + 4;
}

// ── Section heading ───────────────────────────────────────────────────────────

function sectionHeading(pdf: JsPDFType, title: string, x: number, y: number, pageW: number): number {
  sd(pdf, C.border);
  pdf.setLineWidth(0.4);
  pdf.line(x, y, pageW - x, y);
  y += 6;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  st(pdf, C.text);
  pdf.text(title, x, y);
  return y + 6;
}

// ── Footer ────────────────────────────────────────────────────────────────────

function addFooter(pdf: JsPDFType, page: number, total: number, pageW: number) {
  sd(pdf, C.border);
  pdf.setLineWidth(0.3);
  pdf.line(15, 287, pageW - 15, 287);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  st(pdf, C.muted);
  pdf.text(
    `Page ${page} of ${total}  ·  PlaywrightAnalyzer  ·  Confidential`,
    pageW / 2, 292, { align: 'center' },
  );
}

// ── Page 2+ mini-header ───────────────────────────────────────────────────────

function addSubHeader(pdf: JsPDFType, title: string, sub: string, pageW: number): number {
  sf(pdf, C.header);
  pdf.rect(0, 0, pageW, 28, 'F');
  sf(pdf, C.accent);
  pdf.rect(0, 0, 4, 28, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  st(pdf, C.white);
  pdf.text(title, 12, 13);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  st(pdf, C.mutedBg);
  pdf.text(sub, 12, 22);
  sf(pdf, C.accent);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  st(pdf, C.accent);
  pdf.text('PlaywrightAnalyzer', pageW - 50, 13);
  st(pdf, C.mutedBg);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Generated ${formatDate(new Date().toISOString())}`, pageW - 50, 21);
  return 36;
}

// ── Bullets for executive summary ─────────────────────────────────────────────

function buildSummaryBullets(report: ParsedReport): string[] {
  const { stats, suites, errorGroups } = report;
  const bullets: string[] = [];
  bullets.push(
    `${stats.total} tests executed across ${suites.length} suite${suites.length !== 1 ? 's' : ''} in ${formatDuration(stats.duration)}.`,
  );
  const failPct  = Math.round((stats.failed  / stats.total) * 100);
  const flakyPct = Math.round((stats.flaky   / stats.total) * 100);
  bullets.push(
    `${stats.passed} passed (${stats.passRate}%), ${stats.failed} failed (${failPct}%), ` +
    `${stats.skipped} skipped, ${stats.flaky} flaky (${flakyPct}%).`,
  );
  if (errorGroups.length > 0) {
    const top = errorGroups[0];
    bullets.push(`Primary failure type: ${top.label} (${top.count} occurrence${top.count !== 1 ? 's' : ''}).`);
  }
  if      (stats.passRate >= 95) bullets.push('Quality is excellent. No critical action required.');
  else if (stats.passRate >= 85) bullets.push(`Good quality. Fix ${stats.failed + stats.flaky} test(s) to reach 95% target.`);
  else if (stats.passRate >= 70) bullets.push('Quality below target — immediate review recommended.');
  else                           bullets.push('CRITICAL: Pass rate severely below threshold. Escalate immediately.');
  return bullets;
}

// ── PDF-specific recommendations ─────────────────────────────────────────────

function buildPDFRecs(report: ParsedReport) {
  const { stats, errorGroups } = report;
  const recs: Array<{ level: string; title: string; detail: string }> = [];

  if (stats.passRate < 70)
    recs.push({ level: 'CRITICAL', title: 'Pass rate critically low', detail: `${stats.passRate}% pass rate. Halt deployments until resolved.` });
  else if (stats.passRate < 85)
    recs.push({ level: 'HIGH', title: 'Pass rate below quality gate', detail: `${stats.passRate}% is below the 85% minimum. Prioritize fixing top failing tests.` });
  else if (stats.passRate < 95)
    recs.push({ level: 'MEDIUM', title: `${95 - stats.passRate}% gap to 95% target`, detail: `Fixing ~${Math.ceil(stats.total * (95 - stats.passRate) / 100)} tests would reach the 95% goal.` });

  if (stats.flaky >= 5)
    recs.push({ level: 'HIGH',   title: `${stats.flaky} flaky tests`, detail: 'High flakiness causes false CI confidence. Investigate race conditions and async issues.' });
  else if (stats.flaky > 0)
    recs.push({ level: 'MEDIUM', title: `${stats.flaky} flaky test(s)`, detail: 'Review retry counts and environment stability.' });

  const timeouts = errorGroups.find((g) => g.category === 'timeout');
  if (timeouts)
    recs.push({ level: 'MEDIUM', title: 'Timeout errors present', detail: `${timeouts.count} timeout(s). Check CI infrastructure, async handling, and selector stability.` });

  const network = errorGroups.find((g) => g.category === 'network');
  if (network)
    recs.push({ level: 'MEDIUM', title: 'Network errors detected', detail: `${network.count} network error(s). Verify API availability and mock unstable endpoints.` });

  if (stats.skipped > stats.total * 0.1)
    recs.push({ level: 'LOW', title: `${stats.skipped} tests skipped`, detail: 'High skip count may mask real failures. Audit skipped tests.' });

  if (recs.length === 0)
    recs.push({ level: 'INFO', title: 'No critical issues', detail: 'All quality indicators are within acceptable thresholds. Keep monitoring.' });

  return recs;
}

// ── Export Analysis PDF ───────────────────────────────────────────────────────

export async function exportAnalysisPDF(report: ParsedReport): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' }) as unknown as JsPDFType;

  const PAGE_W  = 210;
  const M       = 15;
  const CONT_W  = PAGE_W - 2 * M;
  const MAX_Y   = 278;

  const { stats, suites, errorGroups } = report;
  const { grade, rgb: gradeRGB } = getQualityGrade(stats.passRate, stats.flaky, stats.total);
  const reportDate = formatDate(
    report.metadata?.startTime ? new Date(report.metadata.startTime).toISOString() : report.uploadedAt,
  );

  // ── Cover header ─────────────────────────────────────────────────────────────
  sf(pdf, C.header);
  pdf.rect(0, 0, PAGE_W, 50, 'F');
  sf(pdf, C.accent);
  pdf.rect(0, 0, 4, 50, 'F');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  st(pdf, C.white);
  const name = report.name.length > 55 ? report.name.substring(0, 55) + '…' : report.name;
  pdf.text(name, 12, 19);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  st(pdf, C.mutedBg);
  pdf.text(`Playwright Test Report  ·  ${reportDate}`, 12, 29);
  if (report.metadata?.workers)
    pdf.text(`${report.metadata.workers} parallel workers`, 12, 37);

  // Grade badge
  sf(pdf, gradeRGB);
  pdf.roundedRect(PAGE_W - 42, 10, 28, 30, 3, 3, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(22);
  st(pdf, C.white);
  pdf.text(grade, PAGE_W - 31, 31);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  st(pdf, C.accent);
  pdf.text('PlaywrightAnalyzer', PAGE_W - 42, 46);

  let y = 60;

  // ── Key Metrics ───────────────────────────────────────────────────────────────
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  st(pdf, C.text);
  pdf.text('Key Metrics', M, y);
  y += 5;

  const metrics: Array<{ label: string; value: string; rgb: RGB }> = [
    { label: 'Total',    value: String(stats.total),          rgb: C.text   },
    { label: 'Passed',   value: String(stats.passed),         rgb: C.passed },
    { label: 'Failed',   value: String(stats.failed),         rgb: C.failed },
    { label: 'Skipped',  value: String(stats.skipped),        rgb: C.skipped},
    { label: 'Flaky',    value: String(stats.flaky),          rgb: C.flaky  },
    { label: 'Duration', value: formatDuration(stats.duration),rgb: C.blue  },
  ];

  const boxW = CONT_W / metrics.length;
  metrics.forEach(({ label, value, rgb }, i) => {
    const bx = M + i * boxW;
    sf(pdf, C.light);
    pdf.roundedRect(bx, y, boxW - 2, 18, 1.5, 1.5, 'F');
    sd(pdf, C.border);
    pdf.setLineWidth(0.3);
    pdf.roundedRect(bx, y, boxW - 2, 18, 1.5, 1.5, 'S');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    st(pdf, rgb);
    const vw = pdf.getTextWidth(value);
    pdf.text(value, bx + (boxW - 2) / 2 - vw / 2, y + 9);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.5);
    st(pdf, C.muted);
    const lw = pdf.getTextWidth(label);
    pdf.text(label, bx + (boxW - 2) / 2 - lw / 2, y + 15);
  });
  y += 24;

  // Pass rate bar
  const passRGB = stats.passRate >= 90 ? C.passed : stats.passRate >= 70 ? C.flaky : C.failed;
  sf(pdf, C.border);
  pdf.roundedRect(M, y, CONT_W, 4, 2, 2, 'F');
  sf(pdf, passRGB);
  pdf.roundedRect(M, y, (CONT_W * stats.passRate) / 100, 4, 2, 2, 'F');
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  st(pdf, C.muted);
  pdf.text(`${stats.passRate}% pass rate`, M, y + 9);
  const failNote = `${stats.failed + stats.flaky} test(s) need attention`;
  pdf.text(failNote, M + CONT_W - pdf.getTextWidth(failNote), y + 9);
  y += 16;

  // ── Executive Summary ─────────────────────────────────────────────────────────
  y = sectionHeading(pdf, 'Executive Summary', M, y, PAGE_W);
  const bullets = buildSummaryBullets(report);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  st(pdf, C.text);
  bullets.forEach((b) => {
    sf(pdf, C.accent);
    pdf.circle(M + 2, y - 1.5, 1.2, 'F');
    pdf.text(b, M + 6, y);
    y += 6.5;
  });
  y += 4;

  // ── Failure Analysis ──────────────────────────────────────────────────────────
  if (errorGroups.length > 0) {
    y = sectionHeading(pdf, 'Failure Analysis by Category', M, y, PAGE_W);
    const rows = errorGroups.map((eg) => [
      eg.label,
      String(eg.count),
      `${Math.round((eg.count / Math.max(stats.failed, 1)) * 100)}%`,
      eg.tests.slice(0, 2).map((t) => t.title).join('; ') || '—',
    ]);
    y = drawTable(pdf, ['Category', 'Count', '% of Failures', 'Example Tests'], rows, M, y, [56, 18, 24, 82], MAX_Y);
  }

  // ── Recommendations ───────────────────────────────────────────────────────────
  if (y > 228) { pdf.addPage(); y = 20; }
  y = sectionHeading(pdf, 'Recommendations', M, y, PAGE_W);

  const levelRGB: Record<string, RGB> = {
    CRITICAL: C.failed, HIGH: C.orange, MEDIUM: C.flaky, LOW: C.blue, INFO: C.passed,
  };
  buildPDFRecs(report).forEach((rec) => {
    if (y > MAX_Y) { pdf.addPage(); y = 20; }
    const lc = levelRGB[rec.level] ?? C.muted;
    sf(pdf, lc);
    pdf.roundedRect(M, y, 20, 6.5, 1, 1, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.5);
    st(pdf, C.white);
    pdf.text(rec.level, M + 1.5, y + 4.5);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    st(pdf, C.text);
    pdf.text(rec.title, M + 24, y + 4.5);
    y += 9;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    st(pdf, C.muted);
    pdf.splitTextToSize(rec.detail, CONT_W - 10).forEach((line: string) => {
      pdf.text(line, M + 4, y);
      y += 5;
    });
    y += 3;
  });

  // ── Page 2: Suite Details ─────────────────────────────────────────────────────
  pdf.addPage();
  y = addSubHeader(pdf, 'Test Suite Details', `${suites.length} suite(s) · ${stats.total} total tests · ${name}`, PAGE_W);
  const suiteRows = suites.map((s) => [
    s.title || s.file,
    String(s.stats.total),
    String(s.stats.passed),
    String(s.stats.failed),
    String(s.stats.skipped),
    String(s.stats.flaky),
    `${s.stats.total > 0 ? Math.round((s.stats.passed / s.stats.total) * 100) : 0}%`,
  ]);
  drawTable(pdf, ['Suite Name', 'Total', 'Passed', 'Failed', 'Skipped', 'Flaky', 'Pass%'], suiteRows, M, y, [70, 18, 18, 18, 18, 18, 20], MAX_Y);

  // ── Footers ───────────────────────────────────────────────────────────────────
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) { pdf.setPage(i); addFooter(pdf, i, pages, PAGE_W); }

  const safeName = report.name.replace(/[^a-zA-Z0-9\-_]/g, '_').substring(0, 50);
  pdf.save(`${safeName}_report.pdf`);
}

// ── Export Trends PDF ─────────────────────────────────────────────────────────

export async function exportTrendsPDF(reports: ReportSummary[]): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' }) as unknown as JsPDFType;

  const PAGE_W = 210;
  const M      = 15;
  const CONT_W = PAGE_W - 2 * M;
  const MAX_Y  = 278;

  const sorted = [...reports].sort((a, b) =>
    (a.startTime ?? new Date(a.uploadedAt).getTime()) -
    (b.startTime ?? new Date(b.uploadedAt).getTime()),
  );

  const avgPassRate   = reports.length > 0 ? Math.round(reports.reduce((s, r) => s + r.stats.passRate, 0) / reports.length) : 0;
  const totalTests    = reports.reduce((s, r) => s + r.stats.total, 0);
  const latest        = sorted[sorted.length - 1];
  const trendDelta    = sorted.length >= 2 ? sorted[sorted.length - 1].stats.passRate - sorted[0].stats.passRate : 0;
  const trendStr      = trendDelta > 1 ? `+${trendDelta.toFixed(0)}%` : trendDelta < -1 ? `${trendDelta.toFixed(0)}%` : 'Stable';
  const trendRGB: RGB = trendDelta > 1 ? C.passed : trendDelta < -1 ? C.failed : C.flaky;

  // ── Cover ─────────────────────────────────────────────────────────────────────
  sf(pdf, C.header);
  pdf.rect(0, 0, PAGE_W, 50, 'F');
  sf(pdf, C.accent);
  pdf.rect(0, 0, 4, 50, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  st(pdf, C.white);
  pdf.text('Playwright Test Trends Report', 12, 19);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  st(pdf, C.mutedBg);
  pdf.text(`${reports.length} reports analyzed  ·  Generated ${formatDate(new Date().toISOString())}`, 12, 29);

  sf(pdf, trendRGB);
  pdf.roundedRect(PAGE_W - 42, 10, 28, 30, 3, 3, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  st(pdf, C.white);
  pdf.text(trendStr, PAGE_W - 38, 24, { maxWidth: 24 });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.text('trend', PAGE_W - 35, 32);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  st(pdf, C.accent);
  pdf.text('PlaywrightAnalyzer', PAGE_W - 42, 46);

  let y = 60;

  // ── Summary metrics ───────────────────────────────────────────────────────────
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  st(pdf, C.text);
  pdf.text('Summary', M, y);
  y += 5;

  const smMetrics: Array<{ label: string; value: string; rgb: RGB }> = [
    { label: 'Reports',       value: String(reports.length),   rgb: C.text  },
    { label: 'Avg Pass Rate', value: `${avgPassRate}%`,         rgb: avgPassRate >= 90 ? C.passed : avgPassRate >= 70 ? C.flaky : C.failed },
    { label: 'Total Runs',    value: totalTests.toLocaleString(),rgb: C.blue },
    { label: 'Latest Pass',   value: latest ? `${latest.stats.passRate}%` : '—', rgb: C.text },
    { label: 'Trend',         value: trendStr,                  rgb: trendRGB},
  ];

  const smW = CONT_W / smMetrics.length;
  smMetrics.forEach(({ label, value, rgb }, i) => {
    const bx = M + i * smW;
    sf(pdf, C.light);
    pdf.roundedRect(bx, y, smW - 2, 18, 1.5, 1.5, 'F');
    sd(pdf, C.border);
    pdf.setLineWidth(0.3);
    pdf.roundedRect(bx, y, smW - 2, 18, 1.5, 1.5, 'S');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    st(pdf, rgb);
    const vw = pdf.getTextWidth(value);
    pdf.text(value, bx + (smW - 2) / 2 - vw / 2, y + 9);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.5);
    st(pdf, C.muted);
    const lw = pdf.getTextWidth(label);
    pdf.text(label, bx + (smW - 2) / 2 - lw / 2, y + 15);
  });
  y += 24;

  // ── Mini bar chart ────────────────────────────────────────────────────────────
  y = sectionHeading(pdf, 'Pass Rate History', M, y, PAGE_W);

  const BAR_H = 32;
  const barW  = Math.min(18, (CONT_W - 10) / Math.max(sorted.length, 1));
  sorted.forEach((r, i) => {
    const bx  = M + i * (barW + 2);
    const bh  = (r.stats.passRate / 100) * BAR_H;
    const by  = y + BAR_H - bh;
    const pc  = r.stats.passRate >= 90 ? C.passed : r.stats.passRate >= 70 ? C.flaky : C.failed;
    sf(pdf, pc);
    pdf.rect(bx, by, barW, bh, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(5.5);
    st(pdf, pc);
    pdf.text(`${r.stats.passRate}%`, bx + barW / 2, by - 1.5, { align: 'center' });
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(5);
    st(pdf, C.muted);
    const dl = formatDate(r.startTime ? new Date(r.startTime).toISOString() : r.uploadedAt).split(',')[0];
    pdf.text(dl, bx + barW / 2, y + BAR_H + 5, { align: 'center' });
  });
  y += BAR_H + 14;

  // ── Report comparison table ───────────────────────────────────────────────────
  y = sectionHeading(pdf, 'Report Comparison', M, y, PAGE_W);
  const reportRows = [...sorted].reverse().map((r) => [
    r.name.length > 34 ? r.name.substring(0, 34) + '…' : r.name,
    formatDate(r.startTime ? new Date(r.startTime).toISOString() : r.uploadedAt),
    `${r.stats.passRate}%`,
    String(r.stats.total),
    String(r.stats.passed),
    String(r.stats.failed),
    String(r.stats.flaky),
    formatDuration(r.stats.duration),
  ]);
  drawTable(
    pdf,
    ['Report', 'Date', 'Pass%', 'Total', 'Passed', 'Failed', 'Flaky', 'Duration'],
    reportRows,
    M, y,
    [50, 38, 16, 16, 16, 16, 16, 22],
    MAX_Y,
  );

  // ── Footers ───────────────────────────────────────────────────────────────────
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) { pdf.setPage(i); addFooter(pdf, i, pages, PAGE_W); }

  pdf.save('playwright_trends_report.pdf');
}
