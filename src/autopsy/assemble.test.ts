import { describe, it, expect } from 'vitest';
import { assembleReport } from './assemble.ts';
import type { StepResult } from './types.ts';

const okStep: StepResult = {
  command: 'npm install',
  exitCode: 0,
  stdout: 'ok',
  stderr: '',
  durationMs: 100,
};

const failStep: StepResult = {
  command: 'npm install',
  exitCode: 1,
  stdout: '',
  stderr: 'ERESOLVE',
  durationMs: 50,
};

const baseInput = {
  repoUrl: 'https://github.com/owner/repo',
  clonedAt: '2024-01-01T00:00:00.000Z',
  sandboxPath: '',
  packageManager: 'npm' as const,
  dependencyIssues: [],
  lastCommit: { sha: 'abc123', date: '2024-01-01T00:00:00.000Z' },
  repoAgeMonths: 12,
};

describe('assembleReport', () => {
  it('sets status to green when all steps pass', async () => {
    const report = await assembleReport(
      { ...baseInput, install: okStep, build: okStep },
      true,
    );
    expect(report.status).toBe('green');
  });

  it('sets status to install-failed when install exits non-zero', async () => {
    const report = await assembleReport(
      { ...baseInput, install: failStep, build: okStep },
      true,
    );
    expect(report.status).toBe('install-failed');
  });

  it('sets status to build-failed when build exits non-zero (install ok)', async () => {
    const report = await assembleReport(
      { ...baseInput, install: okStep, build: failStep },
      true,
    );
    expect(report.status).toBe('build-failed');
  });

  it('sets status to test-failed when test exits non-zero (install+build ok)', async () => {
    const report = await assembleReport(
      {
        ...baseInput,
        install: okStep,
        build: okStep,
        test: failStep,
      },
      true,
    );
    expect(report.status).toBe('test-failed');
  });

  it('sets status to unsupported when no package.json', async () => {
    const report = await assembleReport(
      { ...baseInput, install: failStep, build: failStep },
      false,
    );
    expect(report.status).toBe('unsupported');
  });

  it('includes nodeVersion in the report', async () => {
    const report = await assembleReport(
      { ...baseInput, install: okStep, build: okStep },
      true,
    );
    expect(report.nodeVersion).toMatch(/^v\d+\./);
  });

  it('status is green when test is undefined and build passes', async () => {
    const report = await assembleReport(
      { ...baseInput, install: okStep, build: okStep, test: undefined },
      true,
    );
    expect(report.status).toBe('green');
  });
});
