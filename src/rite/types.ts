import type { AutopsyReport, Severity, StepResult } from '../autopsy/types.js';

export type { AutopsyReport, Severity, StepResult };

/** A single upgrade action the runner will apply to the sandbox. */
export interface UpgradeStep {
  package: string;
  fromVersion: string;
  toVersion: string;
  reason: 'outdated' | 'advisory' | 'deprecated';
  advisorySeverity?: 'critical' | 'high' | 'moderate' | 'low';
}

/** Outcome of executing one UpgradeStep in the sandbox. */
export interface StepOutcome {
  step: UpgradeStep;
  install: StepResult;
  build: StepResult;
  test?: StepResult;
  durationMs: number;
  timedOut: boolean;
}

/** Caller-tunable limits for the rite runner. */
export interface RiteBudget {
  /** Maximum number of upgrade steps to attempt. Default: 10. */
  maxSteps: number;
  /** Wall-clock timeout in ms per step. Default: 120_000. */
  stepTimeoutMs: number;
}

/** Top-level options passed to runRite. */
export interface RiteOptions {
  /** Package names the planner must never modify. */
  lockedPackages?: Set<string>;
  /** Override budget defaults. */
  budget?: Partial<RiteBudget>;
}

/** Final result returned by runRite. */
export interface RiteResult {
  sandboxPath: string;
  stepsPlanned: UpgradeStep[];
  stepsExecuted: StepOutcome[];
  status: 'green' | 'budget-exhausted' | 'nothing-to-do' | 'unsupported' | 'error';
  finalBuildStatus: AutopsyReport['status'];
  durationMs: number;
  errorMessage?: string;
}
