import type { AutopsyReport, DependencyIssue } from '../autopsy/types.js';
import type { RiteBudget, UpgradeStep } from './types.js';

export const DEFAULT_BUDGET: RiteBudget = {
  maxSteps: 10,
  stepTimeoutMs: 120_000,
};

/** Map advisory severity to a sort priority (lower = higher priority). */
function severityPriority(severity: string | undefined): number {
  switch (severity) {
    case 'critical': return 0;
    case 'high':     return 1;
    case 'moderate': return 2;
    case 'low':      return 3;
    default:         return 4;
  }
}

/** Approximate semver distance — major diff dominates. */
function semverDistance(pinned: string, latest: string): number {
  const parse = (v: string): [number, number, number] => {
    const parts = v.replace(/^[^0-9]*/, '').split('.').map(Number);
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
  };
  const [pm, pn, pp] = parse(pinned);
  const [lm, ln, lp] = parse(latest);
  return (lm - pm) * 1_000_000 + (ln - pn) * 1_000 + (lp - pp);
}

function issueToStep(issue: DependencyIssue): UpgradeStep {
  let reason: UpgradeStep['reason'] = 'outdated';
  let advisorySeverity: UpgradeStep['advisorySeverity'];

  if (issue.advisory) {
    reason = 'advisory';
    const sev = issue.advisory.severity;
    if (sev === 'critical' || sev === 'high' || sev === 'moderate' || sev === 'low') {
      advisorySeverity = sev;
    }
  } else if (issue.deprecated) {
    reason = 'deprecated';
  }

  const step: UpgradeStep = {
    package: issue.name,
    fromVersion: issue.pinned,
    toVersion: issue.latest,
    reason,
  };
  if (advisorySeverity !== undefined) {
    step.advisorySeverity = advisorySeverity;
  }
  return step;
}

/**
 * Pure function: derive an ordered upgrade plan from an autopsy report.
 *
 * Guarantees:
 *  - No step touches a package in `lockedPackages`.
 *  - The returned array length never exceeds `budget.maxSteps`.
 *  - No side effects.
 */
export function planUpgrades(
  report: AutopsyReport,
  lockedPackages: Set<string>,
  budget: RiteBudget,
): UpgradeStep[] {
  // Nothing to do when already green
  if (report.status === 'green') return [];
  // Can't help unsupported stacks
  if (report.status === 'unsupported') return [];

  // Filter: skip locked, skip issues with no actionable upgrade
  const actionable = report.dependencyIssues.filter((issue) => {
    if (lockedPackages.has(issue.name)) return false;
    // Only act when there is a concrete newer version to target
    if (issue.latest === 'unknown' || issue.latest === issue.pinned) {
      // Still actionable if there's an advisory (may need a patch)
      return issue.advisory != null;
    }
    return true;
  });

  // Sort: advisory severity first, then by semver distance descending
  const sorted = [...actionable].sort((a, b) => {
    const aPriority = severityPriority(a.advisory?.severity);
    const bPriority = severityPriority(b.advisory?.severity);
    if (aPriority !== bPriority) return aPriority - bPriority;
    // Higher semver distance first
    return semverDistance(b.pinned, b.latest) - semverDistance(a.pinned, a.latest);
  });

  // Apply budget cap
  return sorted.slice(0, budget.maxSteps).map(issueToStep);
}
