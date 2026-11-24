import { describe, it, expect } from 'vitest';
import { buildReport, buildPrBody, deriveVerdict } from './render.ts';
import type { AutopsyReport } from '../autopsy/types.ts';
import type { RiteResult, StepOutcome, UpgradeStep } from '../rite/types.ts';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeStep(overrides: Partial<UpgradeStep> = {}): UpgradeStep {
  return {
    package: 'lodash',
    fromVersion: '3.0.0',
    toVersion: '4.17.21',
    reason: 'outdated',
    ...overrides,
  };
}

function makeStepOutcome(overrides: Partial<StepOutcome> = {}): StepOutcome {
  return {
    step: makeStep(),
    install: { command: 'npm install', exitCode: 0, stdout: '', stderr: '', durationMs: 100 },
    build:   { command: 'npm run build', exitCode: 0, stdout: '', stderr: '', durationMs: 200 },
    durationMs: 300,
    timedOut: false,
    ...overrides,
  };
}

function makeAutopsy(overrides: Partial<AutopsyReport> = {}): AutopsyReport {
  return {
    repoUrl: 'https://github.com/example/dead-project',
    clonedAt: '2026-11-24T18:00:00.000Z',
    nodeVersion: '18.0.0',
    packageManager: 'npm',
    install: { command: 'npm install', exitCode: 1, stdout: '', stderr: 'ENOENT: package not found', durationMs: 500 },
    build:   { command: 'npm run build', exitCode: 1, stdout: '', stderr: 'tsc: error TS2345', durationMs: 300 },
    dependencyIssues: [],
    lastCommit: { sha: 'abc1234567890', date: '2022-01-15T10:00:00Z' },
    repoAgeMonths: 48,
    status: 'install-failed',
    sandboxPath: '/tmp/sandbox/dead-project',
    ...overrides,
  };
}

function makeRiteResult(overrides: Partial<RiteResult> = {}): RiteResult {
  return {
    sandboxPath: '/tmp/sandbox/dead-project',
    stepsPlanned: [],
    stepsExecuted: [],
    status: 'nothing-to-do',
    finalBuildStatus: 'install-failed',
    durationMs: 1200,
    ...overrides,
  };
}

// ── deriveVerdict ─────────────────────────────────────────────────────────────

describe('deriveVerdict', () => {
  it('returns resurrected when status=green and finalBuildStatus=green', () => {
    const rite = makeRiteResult({ status: 'green', finalBuildStatus: 'green' });
    expect(deriveVerdict(rite)).toBe('resurrected');
  });

  it('returns still-dead when status=nothing-to-do and finalBuildStatus=install-failed', () => {
    const rite = makeRiteResult({ status: 'nothing-to-do', finalBuildStatus: 'install-failed' });
    expect(deriveVerdict(rite)).toBe('still-dead');
  });

  it('returns still-dead when status=budget-exhausted with no green steps', () => {
    const outcome = makeStepOutcome({
      build: { command: 'npm run build', exitCode: 1, stdout: '', stderr: 'fail', durationMs: 100 },
    });
    const rite = makeRiteResult({
      status: 'budget-exhausted',
      finalBuildStatus: 'build-failed',
      stepsExecuted: [outcome],
    });
    expect(deriveVerdict(rite)).toBe('still-dead');
  });

  it('returns partial when status=budget-exhausted with at least one green build step', () => {
    const greenOutcome = makeStepOutcome();
    const rite = makeRiteResult({
      status: 'budget-exhausted',
      finalBuildStatus: 'test-failed',
      stepsExecuted: [greenOutcome],
    });
    expect(deriveVerdict(rite)).toBe('partial');
  });

  it('returns still-dead when status=error', () => {
    const rite = makeRiteResult({ status: 'error', finalBuildStatus: 'install-failed' });
    expect(deriveVerdict(rite)).toBe('still-dead');
  });

  it('never returns resurrected when status=green but finalBuildStatus!=green', () => {
    const rite = makeRiteResult({ status: 'green', finalBuildStatus: 'test-failed' });
    expect(deriveVerdict(rite)).not.toBe('resurrected');
  });
});

// ── buildReport ───────────────────────────────────────────────────────────────

describe('buildReport', () => {
  it('contains all four required section headers', () => {
    const report = buildReport(makeAutopsy(), makeRiteResult());
    expect(report).toContain('## What was dead');
    expect(report).toContain('## What changed');
    expect(report).toContain('## What still needs a human');
    expect(report).toContain('## Verdict');
  });

  it('contains the repo URL in "What was dead"', () => {
    const report = buildReport(makeAutopsy(), makeRiteResult());
    expect(report).toContain('https://github.com/example/dead-project');
  });

  it('shows pre-rite exit codes', () => {
    const report = buildReport(makeAutopsy(), makeRiteResult());
    // install exit code 1
    expect(report).toContain('❌ 1');
  });

  it('notes "No upgrade steps were executed" when stepsExecuted is empty', () => {
    const report = buildReport(makeAutopsy(), makeRiteResult({ stepsExecuted: [] }));
    expect(report).toContain('No upgrade steps were executed');
  });

  it('renders each executed step with package and version change', () => {
    const outcome = makeStepOutcome();
    const rite = makeRiteResult({
      status: 'budget-exhausted',
      finalBuildStatus: 'build-failed',
      stepsPlanned: [makeStep()],
      stepsExecuted: [outcome],
    });
    const report = buildReport(makeAutopsy(), rite);
    expect(report).toContain('lodash');
    expect(report).toContain('3.0.0 → 4.17.21');
  });

  it('notes timed-out step', () => {
    const outcome = makeStepOutcome({ timedOut: true });
    const rite = makeRiteResult({ stepsExecuted: [outcome] });
    const report = buildReport(makeAutopsy(), rite);
    expect(report).toContain('timed out');
  });

  it('shows Resurrected ✅ when verdict is resurrected', () => {
    const rite = makeRiteResult({ status: 'green', finalBuildStatus: 'green' });
    const report = buildReport(makeAutopsy({ status: 'green' }), rite);
    expect(report).toContain('Resurrected ✅');
  });

  it('shows Still dead ❌ when verdict is still-dead', () => {
    const rite = makeRiteResult({ status: 'nothing-to-do', finalBuildStatus: 'install-failed' });
    const report = buildReport(makeAutopsy(), rite);
    expect(report).toContain('Still dead ❌');
  });

  it('shows Partial when some steps ran but rite is not green', () => {
    const outcome = makeStepOutcome(); // build exitCode 0
    const rite = makeRiteResult({
      status: 'budget-exhausted',
      finalBuildStatus: 'test-failed',
      stepsExecuted: [outcome],
    });
    const report = buildReport(makeAutopsy(), rite);
    expect(report).toContain('Partial');
  });

  it('says Nothing — the build is green when resurrected', () => {
    const rite = makeRiteResult({ status: 'green', finalBuildStatus: 'green' });
    const report = buildReport(makeAutopsy({ status: 'green' }), rite);
    expect(report).toContain('Nothing — the build is green');
  });

  it('redacts token-shaped strings in stderr snippets', () => {
    // Fake a token in stderr using concat so this file itself isn't flagged
    const fakeToken = 'ghp_' + 'FakeTokenABCDEF1234567890';
    const autopsy = makeAutopsy({
      install: {
        command: 'npm install',
        exitCode: 1,
        stdout: '',
        stderr: `Error: bad token ${fakeToken}`,
        durationMs: 100,
      },
    });
    const report = buildReport(autopsy, makeRiteResult());
    expect(report).not.toContain(fakeToken);
    expect(report).toContain('[REDACTED_TOKEN]');
  });

  it('shows advisory severity in step header when present', () => {
    const step = makeStep({ reason: 'advisory', advisorySeverity: 'high' });
    const outcome = makeStepOutcome({ step });
    const rite = makeRiteResult({ stepsExecuted: [outcome] });
    const report = buildReport(makeAutopsy(), rite);
    expect(report).toContain('advisory (high)');
  });
});

// ── buildPrBody ───────────────────────────────────────────────────────────────

describe('buildPrBody', () => {
  it('contains the repo name in the title line', () => {
    const body = buildPrBody(makeAutopsy(), makeRiteResult(), 'report.md');
    expect(body).toContain('dead-project');
  });

  it('contains a link to the report', () => {
    const body = buildPrBody(makeAutopsy(), makeRiteResult(), 'report.md');
    expect(body).toContain('report.md');
  });

  it('contains a reviewer checklist', () => {
    const body = buildPrBody(makeAutopsy(), makeRiteResult(), 'report.md');
    expect(body).toContain('Reviewer checklist');
    expect(body).toContain('patch.diff');
    expect(body).toContain('npm test');
  });

  it('lists applied upgrades', () => {
    const outcome = makeStepOutcome();
    const rite = makeRiteResult({ stepsExecuted: [outcome] });
    const body = buildPrBody(makeAutopsy(), rite, 'report.md');
    expect(body).toContain('lodash');
    expect(body).toContain('3.0.0 → 4.17.21');
  });

  it('notes no upgrades when stepsExecuted is empty', () => {
    const body = buildPrBody(makeAutopsy(), makeRiteResult(), 'report.md');
    expect(body).toContain('No upgrade steps were applied');
  });
});
