import { AlertCircle, AlertTriangle, Info, CheckCircle2, Lightbulb } from 'lucide-react';
import type { ParsedReport } from '../../types';

type Severity = 'critical' | 'high' | 'medium' | 'low' | 'good';

interface Rec {
  severity: Severity;
  title: string;
  description: string;
}

function buildRecs(report: ParsedReport): Rec[] {
  const { stats, errorGroups } = report;
  const recs: Rec[] = [];

  if (stats.passRate < 70) {
    recs.push({
      severity: 'critical',
      title: 'Pass rate critically low — halt deployments',
      description: `Only ${stats.passRate}% of tests pass. Do not promote this build. Triage failing tests immediately before proceeding to the next environment.`,
    });
  } else if (stats.passRate < 85) {
    recs.push({
      severity: 'high',
      title: 'Pass rate below 85% quality gate',
      description: `${stats.failed} tests are failing. Fix top failures to reach the 85–95% target range. Focus on the Critical items in the priority fix list.`,
    });
  } else if (stats.passRate < 95) {
    const toFix = Math.ceil(stats.total * (95 - stats.passRate) / 100);
    recs.push({
      severity: 'medium',
      title: `${95 - stats.passRate}% gap to 95% quality target`,
      description: `Fixing ~${toFix} more test${toFix !== 1 ? 's' : ''} would reach the 95% goal. Good progress — keep addressing the remaining failures.`,
    });
  }

  if (stats.flaky >= 5) {
    recs.push({
      severity: 'high',
      title: `${stats.flaky} flaky tests undermine reliability`,
      description: 'High flakiness creates false confidence in CI. Investigate race conditions, timing assumptions, and shared state between tests.',
    });
  } else if (stats.flaky > 0) {
    recs.push({
      severity: 'medium',
      title: `${stats.flaky} flaky test${stats.flaky !== 1 ? 's' : ''} detected`,
      description: 'Flaky tests increase CI noise and developer friction. Review retry strategies and async-handling patterns.',
    });
  }

  const timeouts = errorGroups.find((g) => g.category === 'timeout');
  if (timeouts) {
    const pct = Math.round((timeouts.count / Math.max(stats.failed, 1)) * 100);
    recs.push({
      severity: pct > 40 ? 'high' : 'medium',
      title: `Timeout errors account for ${pct}% of failures`,
      description: 'Timeouts usually indicate slow CI infrastructure, missing awaits, or external service latency. Consider increasing selector timeouts or mocking slow APIs.',
    });
  }

  const network = errorGroups.find((g) => g.category === 'network');
  if (network) {
    recs.push({
      severity: 'medium',
      title: `${network.count} network error${network.count !== 1 ? 's' : ''} — check API stability`,
      description: 'Network failures may indicate broken API contracts, missing test fixtures, or CI network restrictions blocking outbound calls.',
    });
  }

  const elemNotFound = errorGroups.find((g) => g.category === 'element-not-found');
  if (elemNotFound) {
    recs.push({
      severity: 'medium',
      title: `${elemNotFound.count} element-not-found error${elemNotFound.count !== 1 ? 's' : ''}`,
      description: 'Selectors may be fragile or the UI has changed. Audit locator strategies and switch to data-testid attributes for stability.',
    });
  }

  if (stats.skipped > stats.total * 0.1) {
    recs.push({
      severity: 'low',
      title: `${stats.skipped} tests skipped (${Math.round((stats.skipped / stats.total) * 100)}% of suite)`,
      description: 'High skip rate may mask real failures. Audit .skip() calls to ensure they are intentionally excluded and tracked.',
    });
  }

  if (recs.length === 0) {
    recs.push({
      severity: 'good',
      title: 'All quality indicators within target',
      description: `${stats.passRate}% pass rate with no flakiness or critical errors. Maintain current testing standards and continue monitoring trends.`,
    });
  }

  return recs;
}

const CFG: Record<Severity, { Icon: React.ElementType; badge: string; bar: string }> = {
  critical: {
    Icon: AlertCircle,
    badge: 'text-red-600 bg-red-500/10 border-red-500/30',
    bar:   'border-l-2 border-red-500/70 bg-red-500/5',
  },
  high: {
    Icon: AlertTriangle,
    badge: 'text-orange-600 bg-orange-500/10 border-orange-500/30',
    bar:   'border-l-2 border-orange-500/60 bg-orange-500/5',
  },
  medium: {
    Icon: AlertTriangle,
    badge: 'text-amber-600 bg-amber-500/10 border-amber-500/30',
    bar:   'border-l-2 border-amber-500/40',
  },
  low: {
    Icon: Info,
    badge: 'text-blue-600 bg-blue-500/10 border-blue-500/30',
    bar:   'border-l-2 border-blue-500/40',
  },
  good: {
    Icon: CheckCircle2,
    badge: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/30',
    bar:   'border-l-2 border-emerald-500/50 bg-emerald-500/5',
  },
};

const LABELS: Record<Severity, string> = {
  critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', good: 'Healthy',
};

export function SmartRecommendations({ report }: { report: ParsedReport }) {
  const recs = buildRecs(report);

  return (
    <div className="rounded-xl border border-slate-300/50 bg-slate-200/30 p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/15">
          <Lightbulb className="h-4 w-4 text-indigo-600" />
        </div>
        <h3 className="text-sm font-semibold text-slate-900">Smart Recommendations</h3>
        <span className="ml-auto text-xs text-slate-500">{recs.length} action item{recs.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="space-y-2">
        {recs.map((rec, i) => {
          const { Icon, badge, bar } = CFG[rec.severity];
          return (
            <div key={i} className={`rounded-lg px-4 py-3 ${bar}`}>
              <div className="flex items-start gap-2.5">
                <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${badge.split(' ')[0]}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded border ${badge}`}>
                      {LABELS[rec.severity]}
                    </span>
                    <span className="text-sm font-medium text-slate-900">{rec.title}</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{rec.description}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
