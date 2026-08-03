import type { jsPDF as JsPDFType } from 'jspdf';
import type { ParsedReport, ReportSummary } from '../types';
import type { RegressionItem, SuiteHealth, ErrorEvoEntry } from '../pages/FailurePatternsPage';
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

function truncateCell(pdf: JsPDFType, text: string, maxWidth: number): string {
  const lines = pdf.splitTextToSize(text, maxWidth);
  if (lines.length <= 1) return lines[0] ?? '';
  let line = lines[0];
  while (line.length > 1 && pdf.getTextWidth(line + '…') > maxWidth) {
    line = line.slice(0, -1);
  }
  return line.replace(/\s+$/, '') + '…';
}

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

  let drawnRows = 0;
  rows.forEach((row, ri) => {
    if (y + D_ROW > maxY) return;
    drawnRows++;
    if (ri % 2 === 0) { sf(pdf, C.light); pdf.rect(x, y, totalW, D_ROW, 'F'); }
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    st(pdf, C.text);
    cx = x;
    row.forEach((cell, ci) => {
      const t = truncateCell(pdf, String(cell), colWidths[ci] - PAD * 2);
      pdf.text(t, cx + PAD, y + 5);
      cx += colWidths[ci];
    });
    y += D_ROW;
  });

  sd(pdf, C.border);
  pdf.setLineWidth(0.3);
  pdf.rect(x, startY, totalW, H_ROW + drawnRows * D_ROW, 'S');
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

// ── Plain footer (page number only, no branding/confidentiality mark) ────────

function addPlainFooter(pdf: JsPDFType, page: number, total: number, pageW: number) {
  sd(pdf, C.border);
  pdf.setLineWidth(0.3);
  pdf.line(15, 287, pageW - 15, 287);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  st(pdf, C.muted);
  pdf.text(`Page ${page} of ${total}`, pageW / 2, 292, { align: 'center' });
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

// ── Trend-card mini chart helpers ─────────────────────────────────────────────

const DURATION_BANDS: Array<{ maxMs: number; rgb: RGB }> = [
  { maxMs: 22_000, rgb: C.passed },
  { maxMs: 30_000, rgb: C.flaky },
  { maxMs: Infinity, rgb: C.orange },
];
function durationBandRGB(ms: number): RGB {
  return (DURATION_BANDS.find((b) => ms <= b.maxMs) ?? DURATION_BANDS[DURATION_BANDS.length - 1]).rgb;
}

function chartDate(r: ReportSummary): string {
  return formatDate(r.startTime ? new Date(r.startTime).toISOString() : r.uploadedAt).split(',')[0];
}

function drawNoData(pdf: JsPDFType, x: number, y: number, w: number, h: number, msg: string) {
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  st(pdf, C.muted);
  pdf.text(msg, x + w / 2, y + h / 2, { align: 'center' });
}

function drawStackedBars(pdf: JsPDFType, x: number, y: number, w: number, h: number, data: Array<{ date: string; pass: number; fail: number }>) {
  if (data.length === 0) return drawNoData(pdf, x, y, w, h, 'No data');
  const gap = 3;
  const barW = Math.min(14, (w - gap * (data.length - 1)) / data.length);
  const totalW = barW * data.length + gap * (data.length - 1);
  const startX = x + (w - totalW) / 2;
  const baseline = y + h;
  data.forEach((d, i) => {
    const bx = startX + i * (barW + gap);
    const passH = (d.pass / 100) * h;
    const failH = (d.fail / 100) * h;
    sf(pdf, C.passed);
    pdf.rect(bx, baseline - passH, barW, passH, 'F');
    sf(pdf, C.failed);
    pdf.rect(bx, baseline - passH - failH, barW, failH, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(5.5);
    st(pdf, C.text);
    pdf.text(`${d.pass}%`, bx + barW / 2, baseline - passH - failH - 1.5, { align: 'center' });
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(5);
    st(pdf, C.muted);
    pdf.text(d.date, bx + barW / 2, baseline + 5, { align: 'center' });
  });
}

function drawBandedBars(pdf: JsPDFType, x: number, y: number, w: number, h: number, data: Array<{ date: string; ms: number }>) {
  if (data.length === 0) return drawNoData(pdf, x, y, w, h, 'No data');
  const max = Math.max(...data.map((d) => d.ms), 1);
  const gap = 3;
  const barW = Math.min(14, (w - gap * (data.length - 1)) / data.length);
  const totalW = barW * data.length + gap * (data.length - 1);
  const startX = x + (w - totalW) / 2;
  const baseline = y + h;
  data.forEach((d, i) => {
    const bx = startX + i * (barW + gap);
    const bh = max > 0 ? (d.ms / max) * h : 0;
    sf(pdf, durationBandRGB(d.ms));
    pdf.rect(bx, baseline - bh, barW, bh, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(5.5);
    st(pdf, C.text);
    pdf.text(formatDuration(d.ms), bx + barW / 2, baseline - bh - 1.5, { align: 'center' });
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(5);
    st(pdf, C.muted);
    pdf.text(d.date, bx + barW / 2, baseline + 5, { align: 'center' });
  });
}

function drawLineMini(pdf: JsPDFType, x: number, y: number, w: number, h: number, data: Array<{ date: string; value: number }>, color: RGB) {
  if (data.length === 0) return drawNoData(pdf, x, y, w, h, 'No data');
  const n = data.length;
  const stepX = n > 1 ? w / (n - 1) : 0;
  const points = data.map((d, i) => ({
    px: n > 1 ? x + i * stepX : x + w / 2,
    py: y + h - (Math.min(d.value, 100) / 100) * h,
  }));
  sd(pdf, color);
  pdf.setLineWidth(0.6);
  for (let i = 0; i < points.length - 1; i++) pdf.line(points[i].px, points[i].py, points[i + 1].px, points[i + 1].py);
  points.forEach((p, i) => {
    sf(pdf, color);
    pdf.circle(p.px, p.py, 1.1, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(5.5);
    st(pdf, color);
    pdf.text(`${data[i].value}%`, p.px, p.py - 2.5, { align: 'center' });
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(5);
    st(pdf, C.muted);
    pdf.text(data[i].date, p.px, y + h + 5, { align: 'center' });
  });
}

function drawTrendCard(
  pdf: JsPDFType,
  x: number, y: number, w: number, h: number,
  title: string, subtitle: string,
  draw: (pdf: JsPDFType, cx: number, cy: number, cw: number, ch: number) => void,
) {
  sf(pdf, C.light);
  pdf.roundedRect(x, y, w, h, 2, 2, 'F');
  sd(pdf, C.border);
  pdf.setLineWidth(0.3);
  pdf.roundedRect(x, y, w, h, 2, 2, 'S');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.5);
  st(pdf, C.text);
  pdf.text(title, x + 4, y + 8);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6.5);
  st(pdf, C.muted);
  pdf.text(subtitle, x + 4, y + 13.5);
  sd(pdf, C.border);
  pdf.setLineWidth(0.25);
  pdf.line(x + 4, y + 16, x + w - 4, y + 16);
  draw(pdf, x + 6, y + 22, w - 12, h - 22 - 12);
}

// ── Export Trends PDF ─────────────────────────────────────────────────────────

export async function exportTrendsPDF(reports: ReportSummary[], kindLabel: 'API' | 'UI' = 'API'): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' }) as unknown as JsPDFType;

  const PAGE_W = 210;
  const M      = 15;
  const CONT_W = PAGE_W - 2 * M;
  const MAX_Y  = 278;
  const MAX_RUNS = 8;

  const sorted = [...reports].sort((a, b) =>
    (a.startTime ?? new Date(a.uploadedAt).getTime()) -
    (b.startTime ?? new Date(b.uploadedAt).getTime()),
  );
  // The 4 trend cards and the Report Comparison table only ever chart the most
  // recent runs — kept identical so the table always matches what the charts show.
  const recent = sorted.slice(-MAX_RUNS);

  const avgPassRate   = reports.length > 0 ? Math.round(reports.reduce((s, r) => s + r.stats.passRate, 0) / reports.length) : 0;
  const totalTests    = reports.reduce((s, r) => s + r.stats.total, 0);
  const latest        = sorted[sorted.length - 1];
  const trendDelta    = sorted.length >= 2 ? sorted[sorted.length - 1].stats.passRate - sorted[0].stats.passRate : 0;
  const trendStr      = trendDelta > 1 ? `+${trendDelta.toFixed(0)}%` : trendDelta < -1 ? `${trendDelta.toFixed(0)}%` : 'Stable';
  const trendRGB: RGB = trendDelta > 1 ? C.passed : trendDelta < -1 ? C.failed : C.flaky;

  const chartDateRange = recent.length === 0
    ? ''
    : recent.length === 1
      ? `${chartDate(recent[0])} (1 report)`
      : `${chartDate(recent[0])} – ${chartDate(recent[recent.length - 1])} (last ${recent.length} of ${reports.length} reports)`;

  // ── Cover ─────────────────────────────────────────────────────────────────────
  sf(pdf, C.header);
  pdf.rect(0, 0, PAGE_W, 50, 'F');
  sf(pdf, C.accent);
  pdf.rect(0, 0, 4, 50, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  st(pdf, C.white);
  pdf.text(`${kindLabel} Automation Dashboard - Trends`, 12, 19);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  st(pdf, C.mutedBg);
  pdf.text(`${reports.length} reports analyzed  ·  Generated ${formatDate(new Date().toISOString())}`, 12, 29);
  if (chartDateRange) {
    pdf.setFontSize(8);
    pdf.text(`Chart data: ${chartDateRange}`, 12, 37);
  }

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

  // ── Page 2: Trend charts (mirrors the 4 dashboard cards) ─────────────────────
  pdf.addPage();
  y = addSubHeader(
    pdf,
    'Trend Charts',
    `${kindLabel} Automation · last ${recent.length} of ${reports.length} report${reports.length !== 1 ? 's' : ''}`,
    PAGE_W,
  );

  const resultsData   = recent.map((r) => ({ date: chartDate(r), pass: r.stats.passRate, fail: 100 - r.stats.passRate }));
  const durationData  = recent.map((r) => ({ date: chartDate(r), ms: r.stats.duration }));
  const passTrendData = recent.map((r) => ({ date: chartDate(r), value: r.stats.passRate }));
  const failTrendData = recent.map((r) => ({
    date: chartDate(r),
    value: r.stats.total > 0 ? Math.round((r.stats.failed / r.stats.total) * 100) : 0,
  }));

  const CARD_GAP = 6;
  const cardW    = (CONT_W - CARD_GAP) / 2;
  const cardH    = 88;
  const row1Y    = y + 8;
  const row2Y    = row1Y + cardH + 8;

  drawTrendCard(
    pdf, M, row1Y, cardW, cardH,
    'Test Results by Date', `Pass/fail distribution — last ${recent.length} runs`,
    (p, cx, cy, cw, ch) => drawStackedBars(p, cx, cy, cw, ch, resultsData),
  );
  drawTrendCard(
    pdf, M + cardW + CARD_GAP, row1Y, cardW, cardH,
    'Suite Duration Trend', `Total run time — last ${recent.length} runs`,
    (p, cx, cy, cw, ch) => drawBandedBars(p, cx, cy, cw, ch, durationData),
  );
  drawTrendCard(
    pdf, M, row2Y, cardW, cardH,
    `${kindLabel} Automation — Pass Trend`, `Pass rate (%) — last ${recent.length} runs`,
    (p, cx, cy, cw, ch) => drawLineMini(p, cx, cy, cw, ch, passTrendData, C.passed),
  );
  drawTrendCard(
    pdf, M + cardW + CARD_GAP, row2Y, cardW, cardH,
    `${kindLabel} Automation — Fail Trend`, `Fail rate (%) — last ${recent.length} runs`,
    (p, cx, cy, cw, ch) => drawLineMini(p, cx, cy, cw, ch, failTrendData, C.failed),
  );

  // ── Page 3: Report comparison table — same runs as the charts above ──────────
  pdf.addPage();
  y = addSubHeader(
    pdf,
    'Report Comparison',
    `${kindLabel} Automation · the ${recent.length} report${recent.length !== 1 ? 's' : ''} charted above`,
    PAGE_W,
  );
  const reportRows = [...recent].reverse().map((r) => [
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

  pdf.save(`${kindLabel.toLowerCase()}_automation_trends_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ── Export Failure Analysis PDF (whole Analysis/Failures page) ───────────────

export interface FailureAnalysisPDFInput {
  reportCount: number;
  reportKindLabel: string;
  regressions: RegressionItem[];
  regressionPrevDate: string;
  regressionLatestDate: string;
  consistentlyFailing: number;
  flakyCount: number;
  suiteHealth: SuiteHealth[];
  errorEvolution: ErrorEvoEntry[];
}

export async function exportFailureAnalysisPDF(input: FailureAnalysisPDFInput): Promise<void> {
  const {
    reportCount, reportKindLabel, regressions, regressionPrevDate, regressionLatestDate,
    consistentlyFailing, flakyCount, suiteHealth, errorEvolution,
  } = input;

  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' }) as unknown as JsPDFType;

  const PAGE_W = 210;
  const M      = 15;
  const CONT_W = PAGE_W - 2 * M;
  const MAX_Y  = 278;

  // ── Cover header ─────────────────────────────────────────────────────────────
  sf(pdf, C.header);
  pdf.rect(0, 0, PAGE_W, 42, 'F');
  sf(pdf, C.accent);
  pdf.rect(0, 0, 4, 42, 'F');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(17);
  st(pdf, C.white);
  pdf.text('Failure Analysis Report', 12, 19);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  st(pdf, C.mutedBg);
  pdf.text(
    `${reportKindLabel} · Cross-run analysis across ${reportCount} report${reportCount !== 1 ? 's' : ''}`,
    12, 29,
  );

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  st(pdf, C.mutedBg);
  const genLabel = `Generated ${formatDate(new Date().toISOString())}`;
  pdf.text(genLabel, PAGE_W - 12 - pdf.getTextWidth(genLabel), 29);

  let y = 54;

  // ── Key Metrics ───────────────────────────────────────────────────────────────
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  st(pdf, C.text);
  pdf.text('Key Metrics', M, y);
  y += 6;

  const metrics: Array<{ label: string; value: string; rgb: RGB }> = [
    { label: 'Newly Broken', value: String(regressions.length), rgb: regressions.length > 0 ? C.flaky : C.passed },
    { label: 'Always Failing', value: String(consistentlyFailing), rgb: C.failed },
    { label: 'Flaky Tests', value: String(flakyCount), rgb: C.flaky },
  ];

  const GAP = 6;
  const boxW = Math.min(56, (CONT_W - GAP * (metrics.length - 1)) / metrics.length);
  const groupW = boxW * metrics.length + GAP * (metrics.length - 1);
  const groupX = M + (CONT_W - groupW) / 2;
  metrics.forEach(({ label, value, rgb }, i) => {
    const bx = groupX + i * (boxW + GAP);
    sf(pdf, C.light);
    pdf.roundedRect(bx, y, boxW, 20, 2, 2, 'F');
    sd(pdf, C.border);
    pdf.setLineWidth(0.3);
    pdf.roundedRect(bx, y, boxW, 20, 2, 2, 'S');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    st(pdf, rgb);
    const vw = pdf.getTextWidth(value);
    pdf.text(value, bx + boxW / 2 - vw / 2, y + 10);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    st(pdf, C.muted);
    const lw = pdf.getTextWidth(label);
    pdf.text(label, bx + boxW / 2 - lw / 2, y + 16.5);
  });
  y += 30;

  // ── Newly Broken Tests ────────────────────────────────────────────────────────
  y = sectionHeading(pdf, 'Newly Broken Tests', M, y, PAGE_W);
  if (!regressionPrevDate) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    st(pdf, C.muted);
    pdf.text('Upload at least 2 reports from different dates to detect regressions.', M, y);
    y += 10;
  } else if (regressions.length === 0) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    st(pdf, C.passed);
    pdf.text(`No regressions detected since ${regressionPrevDate}.`, M, y);
    y += 10;
  } else {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    st(pdf, C.muted);
    pdf.text(
      `${regressions.length} test(s) passed on ${regressionPrevDate} but failed on ${regressionLatestDate}.`,
      M, y,
    );
    y += 6;
    let rows = regressions.map((r) => [
      r.testLabel,
      r.file.split(/[\\/]/).slice(-2).join('/'),
      r.errorCategory,
      r.errorMessage.split('\n')[0],
    ]);

    // Avoid overflowing the page: if the full list won't fit, show as many as
    // fit and point to the CSV export (which always has the complete list).
    const maxRows = Math.max(0, Math.floor((MAX_Y - y - 8) / 7));
    if (rows.length > maxRows) {
      const kept = rows.slice(0, Math.max(0, maxRows - 1));
      const remaining = rows.length - kept.length;
      rows = [...kept, [`+ ${remaining} more — use "Download CSV" for the full list`, '', '', '']];
    }

    y = drawTable(pdf, ['Test', 'File', 'Category', 'Error Message'], rows, M, y, [50, 40, 24, 66], MAX_Y);
  }

  // ── Suite Health ──────────────────────────────────────────────────────────────
  if (y > 228) { pdf.addPage(); y = 20; }
  y = sectionHeading(pdf, 'Suite Health', M, y, PAGE_W);
  if (suiteHealth.length === 0) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    st(pdf, C.muted);
    pdf.text('No suite failures detected.', M, y);
    y += 10;
  } else {
    const rows = suiteHealth.map((s) => [
      s.suiteName,
      String(s.total),
      String(s.failed),
      `${s.failRate}%`,
    ]);
    y = drawTable(pdf, ['Suite Name', 'Total', 'Failed', 'Fail Rate'], rows, M, y, [90, 30, 30, 30], MAX_Y);
  }

  // ── Failure Types by Run ──────────────────────────────────────────────────────
  if (y > 228) { pdf.addPage(); y = 20; }
  y = sectionHeading(pdf, 'Failure Types by Run', M, y, PAGE_W);
  const hasErrors = errorEvolution.some(
    (e) => e.Assertion + e.Timeout + e.Network + e.Element + e.Runtime + e.Application > 0,
  );
  if (errorEvolution.length < 2 || !hasErrors) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    st(pdf, C.muted);
    pdf.text(
      errorEvolution.length < 2
        ? 'Upload at least 2 reports to compare failure types.'
        : 'No categorised errors found.',
      M, y,
    );
    y += 10;
  } else {
    const rows = errorEvolution.map((e) => [
      e.date,
      String(e.Assertion),
      String(e.Timeout),
      String(e.Network),
      String(e.Element),
      String(e.Runtime),
      String(e.Application),
    ]);
    drawTable(
      pdf,
      ['Date', 'Assertion', 'Timeout', 'Network', 'Element', 'Runtime', 'Application'],
      rows, M, y, [30, 25, 25, 25, 25, 25, 25], MAX_Y,
    );
  }

  // ── Footers ───────────────────────────────────────────────────────────────────
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) { pdf.setPage(i); addPlainFooter(pdf, i, pages, PAGE_W); }

  pdf.save(`failure_analysis_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ── Export API Scenarios PDF ──────────────────────────────────────────────────

export interface ScenariosPDFInput {
  reportKindLabel: string;
  reportCount: number;
  totals: { apis: number; scenarios: number; passed: number; failed: number; flaky: number; skipped: number };
  groups: Array<{
    apiName: string;
    total: number;
    passCount: number;
    failCount: number;
    flakyCount: number;
    scenarios: Array<{ title: string; latestStatus: string; failCount: number }>;
  }>;
}

export async function exportScenariosPDF(input: ScenariosPDFInput): Promise<void> {
  const { reportKindLabel, reportCount, totals, groups } = input;

  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' }) as unknown as JsPDFType;

  const PAGE_W = 210;
  const M      = 15;
  const CONT_W = PAGE_W - 2 * M;
  const MAX_Y  = 278;

  sf(pdf, C.header);
  pdf.rect(0, 0, PAGE_W, 42, 'F');
  sf(pdf, C.accent);
  pdf.rect(0, 0, 4, 42, 'F');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(17);
  st(pdf, C.white);
  pdf.text('API Scenarios Report', 12, 19);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  st(pdf, C.mutedBg);
  pdf.text(`${reportKindLabel} · ${reportCount} report${reportCount !== 1 ? 's' : ''}`, 12, 29);

  const genLabel = `Generated ${formatDate(new Date().toISOString())}`;
  pdf.text(genLabel, PAGE_W - 12 - pdf.getTextWidth(genLabel), 29);

  let y = 54;

  // ── Key Metrics ───────────────────────────────────────────────────────────────
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  st(pdf, C.text);
  pdf.text('Key Metrics', M, y);
  y += 6;

  const metrics: Array<{ label: string; value: string; rgb: RGB }> = [
    { label: 'APIs',      value: String(totals.apis),      rgb: C.text   },
    { label: 'Scenarios', value: String(totals.scenarios), rgb: C.text   },
    { label: 'Passed',    value: String(totals.passed),    rgb: C.passed },
    { label: 'Failed',    value: String(totals.failed),    rgb: C.failed },
    { label: 'Flaky',     value: String(totals.flaky),     rgb: C.flaky  },
    { label: 'Skipped',   value: String(totals.skipped),   rgb: C.skipped},
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
  y += 28;

  // ── One section per API group ─────────────────────────────────────────────────
  groups.forEach((group) => {
    if (y > 228) { pdf.addPage(); y = 20; }
    y = sectionHeading(
      pdf,
      `${group.apiName}  (${group.passCount} passed · ${group.failCount} failed · ${group.flakyCount} flaky)`,
      M, y, PAGE_W,
    );
    const rows = group.scenarios.map((s) => [s.title, s.latestStatus, String(s.failCount)]);
    y = drawTable(pdf, ['Scenario', 'Latest Status', 'Fail Count'], rows, M, y, [126, 34, 30], MAX_Y);
  });

  // ── Footers ───────────────────────────────────────────────────────────────────
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) { pdf.setPage(i); addFooter(pdf, i, pages, PAGE_W); }

  pdf.save(`api_scenarios_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ── Export Tenant Comparison PDF ──────────────────────────────────────────────

export interface TenantComparisonPDFInput {
  dimensionLabelPlural: string;
  reportCount: number;
  tenants: string[];
  tenantLabels: Record<string, string>;
  stats: { totalScenarios: number; allPassing: number; allFailing: number; divergent: number };
  groups: Array<{
    apiName: string;
    scenarios: Array<{
      title: string;
      isDivergent: boolean;
      statusByTenant: Record<string, string>; // tenantKey -> status label (e.g. "pass", "fail", "-")
    }>;
  }>;
}

export async function exportTenantComparisonPDF(input: TenantComparisonPDFInput): Promise<void> {
  const { dimensionLabelPlural, reportCount, tenants, tenantLabels, stats, groups } = input;

  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' }) as unknown as JsPDFType;

  const PAGE_W = 297;
  const M      = 15;
  const CONT_W = PAGE_W - 2 * M;
  const MAX_Y  = 190;

  sf(pdf, C.header);
  pdf.rect(0, 0, PAGE_W, 42, 'F');
  sf(pdf, C.accent);
  pdf.rect(0, 0, 4, 42, 'F');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(17);
  st(pdf, C.white);
  pdf.text('Tenant Comparison Report', 12, 19);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  st(pdf, C.mutedBg);
  pdf.text(
    `${tenants.length} ${dimensionLabelPlural} · ${reportCount} report${reportCount !== 1 ? 's' : ''}`,
    12, 29,
  );

  const genLabel = `Generated ${formatDate(new Date().toISOString())}`;
  pdf.text(genLabel, PAGE_W - 12 - pdf.getTextWidth(genLabel), 29);

  let y = 54;

  // ── Key Metrics ───────────────────────────────────────────────────────────────
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  st(pdf, C.text);
  pdf.text('Key Metrics', M, y);
  y += 6;

  const metrics: Array<{ label: string; value: string; rgb: RGB }> = [
    { label: 'Scenarios',     value: String(stats.totalScenarios), rgb: C.text   },
    { label: 'All Passing',   value: String(stats.allPassing),     rgb: C.passed },
    { label: 'All Failing',   value: String(stats.allFailing),     rgb: C.failed },
    { label: 'Divergent',     value: String(stats.divergent),      rgb: C.flaky  },
  ];

  const GAP = 6;
  const boxW = Math.min(56, (CONT_W - GAP * (metrics.length - 1)) / metrics.length);
  const groupW = boxW * metrics.length + GAP * (metrics.length - 1);
  const groupX = M + (CONT_W - groupW) / 2;
  metrics.forEach(({ label, value, rgb }, i) => {
    const bx = groupX + i * (boxW + GAP);
    sf(pdf, C.light);
    pdf.roundedRect(bx, y, boxW, 20, 2, 2, 'F');
    sd(pdf, C.border);
    pdf.setLineWidth(0.3);
    pdf.roundedRect(bx, y, boxW, 20, 2, 2, 'S');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    st(pdf, rgb);
    const vw = pdf.getTextWidth(value);
    pdf.text(value, bx + boxW / 2 - vw / 2, y + 10);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    st(pdf, C.muted);
    const lw = pdf.getTextWidth(label);
    pdf.text(label, bx + boxW / 2 - lw / 2, y + 16.5);
  });
  y += 30;

  // ── One table per API group: Scenario | <tenant columns> ─────────────────────
  const tenantColW = Math.min(30, (CONT_W - 90) / Math.max(tenants.length, 1));
  const headers = ['Scenario', ...tenants.map((t) => tenantLabels[t] ?? t)];
  const colWidths = [90, ...tenants.map(() => tenantColW)];

  groups.forEach((group) => {
    if (y > MAX_Y - 20) { pdf.addPage(); y = 20; }
    y = sectionHeading(pdf, group.apiName, M, y, PAGE_W);
    const rows = group.scenarios.map((s) => [
      s.isDivergent ? `${s.title} ⚠` : s.title,
      ...tenants.map((t) => s.statusByTenant[t] ?? '—'),
    ]);
    y = drawTable(pdf, headers, rows, M, y, colWidths, MAX_Y);
  });

  // ── Footers ───────────────────────────────────────────────────────────────────
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) { pdf.setPage(i); addFooter(pdf, i, pages, PAGE_W); }

  pdf.save(`tenant_comparison_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ── Export Drill-Down PDF ─────────────────────────────────────────────────────

export interface DrillDownPDFInput {
  reportName: string;
  statusLabel: string;
  errorFilterLabel?: string;
  tests: Array<{
    title: string;
    file: string;
    duration: number;
    retries: number;
    errorCategory?: string;
    errorMessage?: string;
  }>;
}

export async function exportDrillDownPDF(input: DrillDownPDFInput): Promise<void> {
  const { reportName, statusLabel, errorFilterLabel, tests } = input;

  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' }) as unknown as JsPDFType;

  const PAGE_W = 210;
  const M      = 15;
  const CONT_W = PAGE_W - 2 * M;
  const MAX_Y  = 278;

  sf(pdf, C.header);
  pdf.rect(0, 0, PAGE_W, 42, 'F');
  sf(pdf, C.accent);
  pdf.rect(0, 0, 4, 42, 'F');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(17);
  st(pdf, C.white);
  pdf.text(`${statusLabel} Tests`, 12, 19);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  st(pdf, C.mutedBg);
  pdf.text(
    `${reportName}${errorFilterLabel ? ` · Filtered by ${errorFilterLabel}` : ''} · ${tests.length} test${tests.length !== 1 ? 's' : ''}`,
    12, 29,
  );

  const genLabel = `Generated ${formatDate(new Date().toISOString())}`;
  pdf.text(genLabel, PAGE_W - 12 - pdf.getTextWidth(genLabel), 29);

  let y = 54;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  st(pdf, C.text);
  pdf.text(`${tests.length} test${tests.length !== 1 ? 's' : ''} total`, M, y);
  const totalDuration = tests.reduce((s, t) => s + t.duration, 0);
  const durLabel = `Total duration: ${formatDuration(totalDuration)}`;
  pdf.text(durLabel, M + CONT_W - pdf.getTextWidth(durLabel), y);
  y += 8;

  const rows = tests.map((t) => [
    t.title,
    t.file,
    formatDuration(t.duration),
    String(t.retries),
    t.errorMessage ? `${t.errorCategory ? `[${t.errorCategory}] ` : ''}${t.errorMessage.split('\n')[0]}` : '—',
  ]);
  drawTable(pdf, ['Test', 'File', 'Duration', 'Retries', 'Error'], rows, M, y, [42, 34, 20, 18, 66], MAX_Y);

  // ── Footers ───────────────────────────────────────────────────────────────────
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) { pdf.setPage(i); addFooter(pdf, i, pages, PAGE_W); }

  const safeStatus = statusLabel.replace(/[^a-zA-Z0-9\-_]/g, '_');
  pdf.save(`${safeStatus}_tests_${new Date().toISOString().slice(0, 10)}.pdf`);
}
