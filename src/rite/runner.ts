import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execa } from 'execa';
import { runInstall } from '../autopsy/install.js';
import { runBuild } from '../autopsy/build.js';
import { runTests } from '../autopsy/test-runner.js';
import { detectStack } from '../autopsy/detect-stack.js';
import { planUpgrades, DEFAULT_BUDGET } from './planner.js';
import type { AutopsyReport } from '../autopsy/types.js';
import type {
  RiteOptions,
  RiteResult,
  RiteBudget,
  StepOutcome,
  UpgradeStep,
} from './types.js';

function resolveBudget(partial?: Partial<RiteBudget>): RiteBudget {
  return {
    maxSteps: partial?.maxSteps ?? DEFAULT_BUDGET.maxSteps,
    stepTimeoutMs: partial?.stepTimeoutMs ?? DEFAULT_BUDGET.stepTimeoutMs,
  };
}

/** Install a specific package version in the sandbox. Never throws. */
async function applyUpgrade(
  sandboxPath: string,
  step: UpgradeStep,
  timeoutMs: number,
): Promise<{ timedOut: boolean; error?: string }> {
  try {
    await execa(
      'npm',
      ['install', `${step.package}@${step.toVersion}`, '--save', '--legacy-peer-deps'],
      { cwd: sandboxPath, timeout: timeoutMs, reject: false },
    );
    return { timedOut: false };
  } catch (err: unknown) {
    // execa throws on timeout
    const msg = String(err);
    const timedOut = msg.includes('timed out') || msg.includes('ETIMEDOUT');
    return { timedOut, error: msg };
  }
}

/**
 * Execute the rite: plan upgrades, apply them one at a time, re-run build, stop when green.
 * Never throws; always returns a RiteResult.
 */
export async function runRite(
  report: AutopsyReport,
  options?: RiteOptions,
): Promise<RiteResult> {
  const start = Date.now();
  const budget = resolveBudget(options?.budget);
  const lockedPackages = options?.lockedPackages ?? new Set<string>();
  const sandboxPath = report.sandboxPath;

  if (report.status === 'unsupported') {
    return makeResult(sandboxPath, [], [], 'unsupported', report.status, start, 'Stack is not supported');
  }

  if (report.status === 'green') {
    return makeResult(sandboxPath, [], [], 'nothing-to-do', report.status, start);
  }

  // Detect stack once to get build/test scripts
  const stack = await detectStack(sandboxPath);

  const plan = planUpgrades(report, lockedPackages, budget);

  if (plan.length === 0) {
    return makeResult(sandboxPath, plan, [], 'nothing-to-do', report.status, start);
  }

  const executed: StepOutcome[] = [];
  // Use a string union type explicitly to avoid control-flow narrowing from report.status
  let finalBuildStatus: 'green' | 'install-failed' | 'build-failed' | 'test-failed' | 'unsupported' = report.status as 'green' | 'install-failed' | 'build-failed' | 'test-failed' | 'unsupported';

  for (const step of plan) {
    const stepStart = Date.now();

    // Apply the upgrade
    const { timedOut, error: applyError } = await applyUpgrade(sandboxPath, step, budget.stepTimeoutMs);

    if (timedOut) {
      const emptyStep = emptyStepResult(`npm install ${step.package}@${step.toVersion}`);
      executed.push({
        step,
        install: { ...emptyStep, stderr: applyError ?? 'timed out' },
        build: emptyStepResult(''),
        timedOut: true,
        durationMs: Date.now() - stepStart,
      });
      continue;
    }

    // Re-run install + build + test
    const install = await runInstall(sandboxPath, stack.packageManager);
    const build = await runBuild(sandboxPath, stack.buildScript);
    const test = await runTests(sandboxPath, stack.testScript);

    const outcome: StepOutcome = {
      step,
      install,
      build,
      test,
      durationMs: Date.now() - stepStart,
      timedOut: false,
    };
    executed.push(outcome);

    // Determine new status
    if (install.exitCode !== 0) {
      finalBuildStatus = 'install-failed';
    } else if (build.exitCode !== 0) {
      finalBuildStatus = 'build-failed';
    } else if (test != null && test.exitCode !== 0) {
      finalBuildStatus = 'test-failed';
    } else {
      finalBuildStatus = 'green';
    }

    if (finalBuildStatus === 'green') {
      const result = makeResult(sandboxPath, plan, executed, 'green', 'green', start);
      await writeRiteResult(result);
      return result;
    }
  }

  const riteStatus = finalBuildStatus === 'green' ? 'green' : 'budget-exhausted';
  const result = makeResult(sandboxPath, plan, executed, riteStatus, finalBuildStatus, start);
  await writeRiteResult(result);
  return result;
}

function makeResult(
  sandboxPath: string,
  plan: UpgradeStep[],
  executed: StepOutcome[],
  status: RiteResult['status'],
  finalBuildStatus: AutopsyReport['status'],
  startMs: number,
  errorMessage?: string,
): RiteResult {
  const result: RiteResult = {
    sandboxPath,
    stepsPlanned: plan,
    stepsExecuted: executed,
    status,
    finalBuildStatus,
    durationMs: Date.now() - startMs,
  };
  if (errorMessage !== undefined) {
    result.errorMessage = errorMessage;
  }
  return result;
}

async function writeRiteResult(result: RiteResult): Promise<void> {
  if (!result.sandboxPath) return;
  try {
    await writeFile(
      join(result.sandboxPath, 'rite-result.json'),
      JSON.stringify(result, null, 2),
      'utf-8',
    );
  } catch {
    // best-effort: don't fail the rite if write fails
  }
}

function emptyStepResult(command: string) {
  return {
    command,
    exitCode: 1,
    stdout: '',
    stderr: '',
    durationMs: 0,
  };
}
