import { cloneRepo } from './clone.js';
import { detectStack } from './detect-stack.js';
import { runInstall } from './install.js';
import { runBuild } from './build.js';
import { runTests } from './test-runner.js';
import { auditDependencies } from './audit.js';
import { fetchCommitMeta } from './commit-meta.js';
import { assembleReport } from './assemble.js';
import type { AutopsyReport, StepResult } from './types.js';

const EMPTY_STEP: StepResult = {
  command: '',
  exitCode: 1,
  stdout: '',
  stderr: 'Step was not reached',
  durationMs: 0,
};

/**
 * Run a full autopsy on a GitHub repository.
 *
 * The pipeline always completes; no step throws.
 * Returns an AutopsyReport with status set based on first failing step.
 */
export async function runAutopsy(url: string): Promise<AutopsyReport> {
  // 1. Clone
  const cloneResult = await cloneRepo(url);

  if (cloneResult.error != null) {
    // Can't proceed without a sandbox
    const isUrlError = cloneResult.error.startsWith('Invalid URL');
    return assembleReport(
      {
        repoUrl: url,
        clonedAt: cloneResult.clonedAt,
        sandboxPath: cloneResult.sandboxPath,
        packageManager: 'unknown',
        install: { ...EMPTY_STEP, stderr: cloneResult.error },
        build: EMPTY_STEP,
        dependencyIssues: [],
        lastCommit: { sha: 'unknown', date: 'unknown' },
        repoAgeMonths: 0,
      },
      isUrlError ? false : false,
    );
  }

  const { sandboxPath, clonedAt } = cloneResult;

  // 2. Detect stack
  const stack = await detectStack(sandboxPath);

  if (!stack.hasPackageJson) {
    return assembleReport(
      {
        repoUrl: url,
        clonedAt,
        sandboxPath,
        packageManager: 'unknown',
        install: { ...EMPTY_STEP, stderr: 'No package.json found' },
        build: EMPTY_STEP,
        dependencyIssues: [],
        lastCommit: { sha: 'unknown', date: 'unknown' },
        repoAgeMonths: 0,
      },
      false,
    );
  }

  // 3. Run install
  const install = await runInstall(sandboxPath, stack.packageManager);

  // 4. Run build (best-effort even if install failed)
  const build = await runBuild(sandboxPath, stack.buildScript);

  // 5. Run tests (best-effort)
  const test = await runTests(sandboxPath, stack.testScript);

  // 6. Audit dependencies (best-effort)
  const dependencyIssues = await auditDependencies(sandboxPath);

  // 7. Fetch commit metadata (best-effort)
  const { sha, date, repoAgeMonths } = await fetchCommitMeta(sandboxPath);

  // 8. Assemble and write report
  return assembleReport(
    {
      repoUrl: url,
      clonedAt,
      sandboxPath,
      packageManager: stack.packageManager,
      install,
      build,
      test,
      dependencyIssues,
      lastCommit: { sha, date },
      repoAgeMonths,
    },
    true,
  );
}
