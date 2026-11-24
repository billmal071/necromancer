import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { planUpgrades } from './planner.ts';
import type { AutopsyReport, DependencyIssue } from '../autopsy/types.ts';
import type { RiteBudget } from './types.ts';

// Arbitrary generators
const semverArb = fc.tuple(
  fc.nat({ max: 20 }),
  fc.nat({ max: 20 }),
  fc.nat({ max: 20 }),
).map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

const pkgNameArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,19}$/);

const issueArb: fc.Arbitrary<DependencyIssue> = fc.record({
  name: pkgNameArb,
  pinned: semverArb,
  latest: semverArb,
  deprecated: fc.boolean(),
  advisory: fc.option(
    fc.record({
      id: fc.string({ minLength: 1, maxLength: 20 }),
      severity: fc.constantFrom('critical' as const, 'high' as const, 'moderate' as const, 'low' as const, 'none' as const),
      title: fc.string({ minLength: 1, maxLength: 50 }),
    }),
    { nil: undefined },
  ),
}).map((r) => {
  // Remove undefined advisory
  if (r.advisory === undefined) {
    const { advisory: _, ...rest } = r;
    return rest as DependencyIssue;
  }
  return r as DependencyIssue;
});

const statusArb = fc.constantFrom(
  'install-failed' as const,
  'build-failed' as const,
  'test-failed' as const,
);

function makeReport(issues: DependencyIssue[], status: AutopsyReport['status']): AutopsyReport {
  return {
    repoUrl: 'https://github.com/owner/repo',
    clonedAt: new Date().toISOString(),
    nodeVersion: 'v22.0.0',
    packageManager: 'npm',
    install: { command: 'npm install', exitCode: 1, stdout: '', stderr: '', durationMs: 10 },
    build: { command: 'npm run build', exitCode: 1, stdout: '', stderr: '', durationMs: 10 },
    dependencyIssues: issues,
    lastCommit: { sha: 'abc', date: '2024-01-01T00:00:00Z' },
    repoAgeMonths: 12,
    status,
    sandboxPath: '/tmp/sandbox',
  };
}

describe('planUpgrades property-based tests', () => {
  it('never includes a locked package in the plan', () => {
    fc.assert(
      fc.property(
        fc.array(issueArb, { minLength: 0, maxLength: 30 }),
        fc.array(pkgNameArb, { minLength: 0, maxLength: 15 }),
        statusArb,
        fc.integer({ min: 1, max: 20 }),
        (issues, lockedNames, status, maxSteps) => {
          const locked = new Set(lockedNames);
          const budget: RiteBudget = { maxSteps, stepTimeoutMs: 120_000 };
          const report = makeReport(issues, status);
          const plan = planUpgrades(report, locked, budget);

          for (const step of plan) {
            expect(locked.has(step.package)).toBe(false);
          }
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('never exceeds budget.maxSteps', () => {
    fc.assert(
      fc.property(
        fc.array(issueArb, { minLength: 0, maxLength: 50 }),
        statusArb,
        fc.integer({ min: 0, max: 25 }),
        (issues, status, maxSteps) => {
          const budget: RiteBudget = { maxSteps, stepTimeoutMs: 120_000 };
          const report = makeReport(issues, status);
          const plan = planUpgrades(report, new Set(), budget);

          expect(plan.length).toBeLessThanOrEqual(maxSteps);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('always returns empty plan for green or unsupported status', () => {
    fc.assert(
      fc.property(
        fc.array(issueArb, { minLength: 1, maxLength: 20 }),
        fc.constantFrom('green' as const, 'unsupported' as const),
        (issues, status) => {
          const budget: RiteBudget = { maxSteps: 10, stepTimeoutMs: 120_000 };
          const report = makeReport(issues, status);
          const plan = planUpgrades(report, new Set(), budget);
          expect(plan).toHaveLength(0);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('plan length is 0 when all packages are locked', () => {
    fc.assert(
      fc.property(
        fc.array(issueArb, { minLength: 1, maxLength: 20 }),
        statusArb,
        (issues, status) => {
          const allNames = new Set(issues.map((i) => i.name));
          const budget: RiteBudget = { maxSteps: 10, stepTimeoutMs: 120_000 };
          const report = makeReport(issues, status);
          const plan = planUpgrades(report, allNames, budget);
          expect(plan).toHaveLength(0);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('every step in the plan references a package from the dependency issues', () => {
    fc.assert(
      fc.property(
        fc.array(issueArb, { minLength: 0, maxLength: 30 }),
        statusArb,
        (issues, status) => {
          const issueNames = new Set(issues.map((i) => i.name));
          const budget: RiteBudget = { maxSteps: 10, stepTimeoutMs: 120_000 };
          const report = makeReport(issues, status);
          const plan = planUpgrades(report, new Set(), budget);

          for (const step of plan) {
            expect(issueNames.has(step.package)).toBe(true);
          }
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('steps with actionable advisory severity come before non-advisory-severity steps', () => {
    fc.assert(
      fc.property(
        fc.array(issueArb, { minLength: 2, maxLength: 20 }),
        statusArb,
        (issues, status) => {
          const budget: RiteBudget = { maxSteps: issues.length, stepTimeoutMs: 120_000 };
          const report = makeReport(issues, status);
          const plan = planUpgrades(report, new Set(), budget);

          // A step has an "actionable" advisory if it has an explicit advisorySeverity
          // (critical/high/moderate/low). Steps with reason==='advisory' but no
          // advisorySeverity (severity='none') sort the same as outdated.
          const firstNoActionableAdvisory = plan.findIndex(
            (s) => s.advisorySeverity === undefined,
          );
          if (firstNoActionableAdvisory === -1) return; // all actionable advisory or empty: fine

          // All steps after the first non-actionable must also lack advisorySeverity
          for (let i = firstNoActionableAdvisory + 1; i < plan.length; i++) {
            expect(plan[i]?.advisorySeverity).toBeUndefined();
          }
        },
      ),
      { numRuns: 1000 },
    );
  });
});
