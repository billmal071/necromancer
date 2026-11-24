import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { redactOutput } from './redact.js';
import type {
  AutopsyReport,
  DependencyIssue,
  PackageManager,
  StepResult,
} from './types.js';

export interface AssembleInput {
  repoUrl: string;
  clonedAt: string;
  sandboxPath: string;
  packageManager: PackageManager;
  install: StepResult;
  build: StepResult;
  test?: StepResult;
  dependencyIssues: DependencyIssue[];
  lastCommit: { sha: string; date: string };
  repoAgeMonths: number;
}

function computeStatus(
  input: AssembleInput,
  hasPackageJson: boolean,
): AutopsyReport['status'] {
  if (!hasPackageJson) return 'unsupported';
  if (input.install.exitCode !== 0) return 'install-failed';
  if (input.build.exitCode !== 0) return 'build-failed';
  if (input.test != null && input.test.exitCode !== 0) return 'test-failed';
  return 'green';
}

function redactStep(step: StepResult): StepResult {
  return {
    ...step,
    stdout: redactOutput(step.stdout),
    stderr: redactOutput(step.stderr),
  };
}

/** Combine all step results into an AutopsyReport and write autopsy.json. */
export async function assembleReport(
  input: AssembleInput,
  hasPackageJson: boolean,
): Promise<AutopsyReport> {
  const nodeVersion = process.version;

  const report: AutopsyReport = {
    repoUrl: input.repoUrl,
    clonedAt: input.clonedAt,
    nodeVersion,
    packageManager: input.packageManager,
    install: redactStep(input.install),
    build: redactStep(input.build),
    test: input.test != null ? redactStep(input.test) : undefined,
    dependencyIssues: input.dependencyIssues,
    lastCommit: input.lastCommit,
    repoAgeMonths: input.repoAgeMonths,
    status: computeStatus(input, hasPackageJson),
    sandboxPath: input.sandboxPath,
  };

  // Write autopsy.json to sandbox
  if (input.sandboxPath) {
    try {
      await writeFile(
        join(input.sandboxPath, 'autopsy.json'),
        JSON.stringify(report, null, 2),
        'utf-8',
      );
    } catch {
      // best-effort: don't fail the report if write fails
    }
  }

  return report;
}
