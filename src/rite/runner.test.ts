import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AutopsyReport, StepResult } from '../autopsy/types.ts';

// Mock all external dependencies before importing runner
vi.mock('execa');
vi.mock('../autopsy/install.js');
vi.mock('../autopsy/build.js');
vi.mock('../autopsy/test-runner.js');
vi.mock('../autopsy/detect-stack.js');
vi.mock('node:fs/promises');

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

function greenStep(): StepResult {
  return { command: 'cmd', exitCode: 0, stdout: 'ok', stderr: '', durationMs: 10 };
}

function failStep(): StepResult {
  return { command: 'cmd', exitCode: 1, stdout: '', stderr: 'fail', durationMs: 10 };
}

describe('runRite', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns nothing-to-do when report is already green', async () => {
    const { runRite } = await import('./runner.ts');
    const report = makeReport({ status: 'green' });
    const result = await runRite(report);
    expect(result.status).toBe('nothing-to-do');
    expect(result.stepsExecuted).toHaveLength(0);
  });

  it('returns unsupported when report status is unsupported', async () => {
    const { runRite } = await import('./runner.ts');
    const report = makeReport({ status: 'unsupported' });
    const result = await runRite(report);
    expect(result.status).toBe('unsupported');
    expect(result.errorMessage).toBeDefined();
  });

  it('returns nothing-to-do when there are no actionable dependency issues', async () => {
    const { detectStack } = await import('../autopsy/detect-stack.js');
    vi.mocked(detectStack).mockResolvedValue({
      hasPackageJson: true,
      packageManager: 'npm',
      buildScript: 'build',
      testScript: 'test',
    });

    const { runRite } = await import('./runner.ts');
    const report = makeReport({ dependencyIssues: [] });
    const result = await runRite(report);
    expect(result.status).toBe('nothing-to-do');
  });

  it('returns green status when first step fixes the build', async () => {
    const { execa } = await import('execa');
    const { detectStack } = await import('../autopsy/detect-stack.js');
    const { runInstall } = await import('../autopsy/install.js');
    const { runBuild } = await import('../autopsy/build.js');
    const { runTests } = await import('../autopsy/test-runner.js');
    const { writeFile } = await import('node:fs/promises');

    vi.mocked(execa).mockResolvedValue({
      exitCode: 0, stdout: '', stderr: '', all: '',
    } as ReturnType<typeof execa> extends Promise<infer T> ? T : never);
    vi.mocked(detectStack).mockResolvedValue({ hasPackageJson: true, packageManager: 'npm', buildScript: 'build', testScript: 'test' });
    vi.mocked(runInstall).mockResolvedValue(greenStep());
    vi.mocked(runBuild).mockResolvedValue(greenStep());
    vi.mocked(runTests).mockResolvedValue(greenStep());
    vi.mocked(writeFile).mockResolvedValue(undefined);

    const { runRite } = await import('./runner.ts');
    const report = makeReport({
      dependencyIssues: [{ name: 'pkg-a', pinned: '1.0.0', latest: '2.0.0', deprecated: false }],
    });

    const result = await runRite(report);
    expect(result.status).toBe('green');
    expect(result.stepsExecuted).toHaveLength(1);
  });

  it('returns budget-exhausted when all steps fail', async () => {
    const { execa } = await import('execa');
    const { detectStack } = await import('../autopsy/detect-stack.js');
    const { runInstall } = await import('../autopsy/install.js');
    const { runBuild } = await import('../autopsy/build.js');
    const { runTests } = await import('../autopsy/test-runner.js');
    const { writeFile } = await import('node:fs/promises');

    vi.mocked(execa).mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' } as ReturnType<typeof execa> extends Promise<infer T> ? T : never);
    vi.mocked(detectStack).mockResolvedValue({ hasPackageJson: true, packageManager: 'npm', buildScript: 'build', testScript: 'test' });
    vi.mocked(runInstall).mockResolvedValue(failStep());
    vi.mocked(runBuild).mockResolvedValue(failStep());
    vi.mocked(runTests).mockResolvedValue(undefined);
    vi.mocked(writeFile).mockResolvedValue(undefined);

    const { runRite } = await import('./runner.ts');
    const report = makeReport({
      dependencyIssues: [
        { name: 'pkg-a', pinned: '1.0.0', latest: '2.0.0', deprecated: false },
        { name: 'pkg-b', pinned: '1.0.0', latest: '2.0.0', deprecated: false },
      ],
    });

    const result = await runRite(report, { budget: { maxSteps: 2 } });
    expect(result.status).toBe('budget-exhausted');
    expect(result.stepsExecuted).toHaveLength(2);
  });

  it('marks a step as timedOut when execa throws a timeout error', async () => {
    const { execa } = await import('execa');
    const { detectStack } = await import('../autopsy/detect-stack.js');
    const { runInstall } = await import('../autopsy/install.js');
    const { runBuild } = await import('../autopsy/build.js');
    const { runTests } = await import('../autopsy/test-runner.js');
    const { writeFile } = await import('node:fs/promises');

    // First call times out, second succeeds
    vi.mocked(execa)
      .mockRejectedValueOnce(new Error('Command timed out after 120000ms'))
      .mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' } as ReturnType<typeof execa> extends Promise<infer T> ? T : never);
    vi.mocked(detectStack).mockResolvedValue({ hasPackageJson: true, packageManager: 'npm', buildScript: 'build' });
    vi.mocked(runInstall).mockResolvedValue(greenStep());
    vi.mocked(runBuild).mockResolvedValue(greenStep());
    vi.mocked(runTests).mockResolvedValue(undefined);
    vi.mocked(writeFile).mockResolvedValue(undefined);

    const { runRite } = await import('./runner.ts');
    const report = makeReport({
      dependencyIssues: [
        { name: 'pkg-a', pinned: '1.0.0', latest: '2.0.0', deprecated: false },
        { name: 'pkg-b', pinned: '1.0.0', latest: '2.0.0', deprecated: false },
      ],
    });

    const result = await runRite(report);
    expect(result.stepsExecuted[0]?.timedOut).toBe(true);
    expect(result.stepsExecuted[1]?.timedOut).toBe(false);
  });

  it('writes rite-result.json to sandbox path when build goes green', async () => {
    const { execa } = await import('execa');
    const { detectStack } = await import('../autopsy/detect-stack.js');
    const { runInstall } = await import('../autopsy/install.js');
    const { runBuild } = await import('../autopsy/build.js');
    const { runTests } = await import('../autopsy/test-runner.js');
    const { writeFile } = await import('node:fs/promises');

    vi.mocked(execa).mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' } as ReturnType<typeof execa> extends Promise<infer T> ? T : never);
    vi.mocked(detectStack).mockResolvedValue({ hasPackageJson: true, packageManager: 'npm' });
    vi.mocked(runInstall).mockResolvedValue(greenStep());
    vi.mocked(runBuild).mockResolvedValue(greenStep());
    vi.mocked(runTests).mockResolvedValue(undefined);
    vi.mocked(writeFile).mockResolvedValue(undefined);

    const { runRite } = await import('./runner.ts');
    const report = makeReport({
      sandboxPath: '/tmp/mysandbox',
      dependencyIssues: [{ name: 'pkg', pinned: '1.0.0', latest: '2.0.0', deprecated: false }],
    });

    await runRite(report);

    expect(vi.mocked(writeFile)).toHaveBeenCalledWith(
      '/tmp/mysandbox/rite-result.json',
      expect.any(String),
      'utf-8',
    );
  });
});
