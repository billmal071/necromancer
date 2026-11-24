import { describe, it, expect } from 'vitest';
import { planUpgrades, DEFAULT_BUDGET } from './planner.ts';
import type { AutopsyReport, DependencyIssue } from '../autopsy/types.ts';
import type { RiteBudget } from './types.ts';

function makeReport(overrides?: Partial<AutopsyReport>): AutopsyReport {
  return {
    repoUrl: 'https://github.com/owner/repo',
    clonedAt: new Date().toISOString(),
    nodeVersion: 'v22.0.0',
    packageManager: 'npm',
    install: { command: 'npm install', exitCode: 1, stdout: '', stderr: 'err', durationMs: 10 },
    build: { command: 'npm run build', exitCode: 1, stdout: '', stderr: 'err', durationMs: 10 },
    dependencyIssues: [],
    lastCommit: { sha: 'abc', date: '2024-01-01T00:00:00Z' },
    repoAgeMonths: 12,
    status: 'install-failed',
    sandboxPath: '/tmp/sandbox',
    ...overrides,
  };
}

function makeIssue(overrides?: Partial<DependencyIssue>): DependencyIssue {
  return {
    name: 'some-pkg',
    pinned: '1.0.0',
    latest: '2.0.0',
    deprecated: false,
    ...overrides,
  };
}

const budget: RiteBudget = { maxSteps: 10, stepTimeoutMs: 120_000 };

describe('planUpgrades', () => {
  it('returns empty array when report status is green', () => {
    const report = makeReport({ status: 'green', dependencyIssues: [makeIssue()] });
    expect(planUpgrades(report, new Set(), budget)).toHaveLength(0);
  });

  it('returns empty array when report status is unsupported', () => {
    const report = makeReport({ status: 'unsupported', dependencyIssues: [makeIssue()] });
    expect(planUpgrades(report, new Set(), budget)).toHaveLength(0);
  });

  it('returns empty array when dependencyIssues is empty', () => {
    const report = makeReport({ dependencyIssues: [] });
    expect(planUpgrades(report, new Set(), budget)).toHaveLength(0);
  });

  it('excludes locked packages from the plan', () => {
    const report = makeReport({
      dependencyIssues: [
        makeIssue({ name: 'locked-pkg', pinned: '1.0.0', latest: '2.0.0' }),
        makeIssue({ name: 'free-pkg', pinned: '1.0.0', latest: '2.0.0' }),
      ],
    });
    const plan = planUpgrades(report, new Set(['locked-pkg']), budget);
    expect(plan.map((s) => s.package)).not.toContain('locked-pkg');
    expect(plan.map((s) => s.package)).toContain('free-pkg');
  });

  it('returns empty plan when all packages are locked', () => {
    const report = makeReport({
      dependencyIssues: [
        makeIssue({ name: 'pkg-a' }),
        makeIssue({ name: 'pkg-b' }),
      ],
    });
    const plan = planUpgrades(report, new Set(['pkg-a', 'pkg-b']), budget);
    expect(plan).toHaveLength(0);
  });

  it('caps plan at budget.maxSteps', () => {
    const issues: DependencyIssue[] = Array.from({ length: 20 }, (_, i) =>
      makeIssue({ name: `pkg-${i}`, pinned: '1.0.0', latest: '2.0.0' }),
    );
    const report = makeReport({ dependencyIssues: issues });
    const smallBudget: RiteBudget = { maxSteps: 3, stepTimeoutMs: 10_000 };
    const plan = planUpgrades(report, new Set(), smallBudget);
    expect(plan.length).toBeLessThanOrEqual(3);
  });

  it('sorts advisory packages before plain outdated ones', () => {
    const report = makeReport({
      dependencyIssues: [
        makeIssue({ name: 'outdated-pkg', pinned: '1.0.0', latest: '2.0.0' }),
        makeIssue({
          name: 'advisory-pkg',
          pinned: '1.0.0',
          latest: '1.0.1',
          advisory: { id: 'CVE-123', severity: 'high', title: 'RCE' },
        }),
      ],
    });
    const plan = planUpgrades(report, new Set(), budget);
    expect(plan[0]?.package).toBe('advisory-pkg');
    expect(plan[1]?.package).toBe('outdated-pkg');
  });

  it('sorts critical advisory before high advisory', () => {
    const report = makeReport({
      dependencyIssues: [
        makeIssue({ name: 'high-pkg', pinned: '1.0.0', latest: '1.0.1', advisory: { id: 'CVE-2', severity: 'high', title: 'High' } }),
        makeIssue({ name: 'critical-pkg', pinned: '1.0.0', latest: '1.0.1', advisory: { id: 'CVE-1', severity: 'critical', title: 'Critical' } }),
      ],
    });
    const plan = planUpgrades(report, new Set(), budget);
    expect(plan[0]?.package).toBe('critical-pkg');
    expect(plan[1]?.package).toBe('high-pkg');
  });

  it('sets reason to advisory when issue has advisory', () => {
    const report = makeReport({
      dependencyIssues: [
        makeIssue({ advisory: { id: 'CVE-1', severity: 'moderate', title: 'XSS' } }),
      ],
    });
    const [step] = planUpgrades(report, new Set(), budget);
    expect(step?.reason).toBe('advisory');
    expect(step?.advisorySeverity).toBe('moderate');
  });

  it('sets reason to deprecated when issue is deprecated (no advisory)', () => {
    const report = makeReport({
      dependencyIssues: [makeIssue({ deprecated: true })],
    });
    const [step] = planUpgrades(report, new Set(), budget);
    expect(step?.reason).toBe('deprecated');
  });

  it('sets reason to outdated for plain version bump', () => {
    const report = makeReport({
      dependencyIssues: [makeIssue({ deprecated: false })],
    });
    const [step] = planUpgrades(report, new Set(), budget);
    expect(step?.reason).toBe('outdated');
  });

  it('maps fromVersion and toVersion correctly', () => {
    const issue = makeIssue({ pinned: '1.2.3', latest: '4.5.6' });
    const report = makeReport({ dependencyIssues: [issue] });
    const [step] = planUpgrades(report, new Set(), budget);
    expect(step?.fromVersion).toBe('1.2.3');
    expect(step?.toVersion).toBe('4.5.6');
  });

  it('skips issues where latest equals pinned (no-op upgrade)', () => {
    const report = makeReport({
      dependencyIssues: [makeIssue({ pinned: '1.0.0', latest: '1.0.0' })],
    });
    const plan = planUpgrades(report, new Set(), budget);
    expect(plan).toHaveLength(0);
  });

  it('skips issues where latest is unknown', () => {
    const report = makeReport({
      dependencyIssues: [makeIssue({ latest: 'unknown' })],
    });
    const plan = planUpgrades(report, new Set(), budget);
    expect(plan).toHaveLength(0);
  });
});
