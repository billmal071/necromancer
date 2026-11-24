# Rite – Design

## Module boundary
`src/rite/` — pure TypeScript, no web-framework dependencies.
Entry point: `runRite(report: AutopsyReport, options?: RiteOptions): Promise<RiteResult>`

## Key types

```ts
/** A single upgrade action the runner will apply. */
interface UpgradeStep {
  package: string;
  fromVersion: string;
  toVersion: string;
  reason: 'outdated' | 'advisory' | 'deprecated';
  advisorySeverity?: 'critical' | 'high' | 'moderate' | 'low';
}

/** Outcome of executing one UpgradeStep. */
interface StepOutcome {
  step: UpgradeStep;
  install: StepResult;
  build: StepResult;
  test?: StepResult;
  durationMs: number;
  timedOut: boolean;
}

/** Caller-tunable limits. */
interface RiteBudget {
  maxSteps: number;        // default 10
  stepTimeoutMs: number;   // default 120_000
}

/** Top-level options passed to runRite. */
interface RiteOptions {
  lockedPackages?: Set<string>;
  budget?: Partial<RiteBudget>;
}

/** Final result returned by runRite. */
interface RiteResult {
  sandboxPath: string;
  stepsPlanned: UpgradeStep[];
  stepsExecuted: StepOutcome[];
  status: 'green' | 'budget-exhausted' | 'nothing-to-do' | 'unsupported' | 'error';
  finalBuildStatus: AutopsyReport['status'];
  durationMs: number;
  errorMessage?: string;
}
```

## Internal module layout

```
src/rite/
  types.ts        — all Rite types (UpgradeStep, RiteResult, …)
  planner.ts      — pure function: AutopsyReport → UpgradeStep[]
  runner.ts       — executes steps, calls autopsy runners, writes rite-result.json
  index.ts        — re-exports RiteResult, runRite
```

## Planner algorithm

`planUpgrades(report, lockedPackages, budget)` is a pure function:

1. If `report.status === 'green'`, return `[]`.
2. Filter `report.dependencyIssues`:
   - Remove any package whose name is in `lockedPackages`.
3. Sort remaining issues by priority:
   - `advisory.severity` order: critical (0) > high (1) > moderate (2) > low (3) > none (4)
   - Then by semver distance (major diff first)
4. Take the first `budget.maxSteps` issues.
5. For each remaining issue, build an `UpgradeStep`:
   - `fromVersion` = `issue.pinned`
   - `toVersion` = `issue.latest`
   - `reason` = `'advisory'` if `issue.advisory` present, else `'deprecated'` if
     `issue.deprecated`, else `'outdated'`
   - `advisorySeverity` = `issue.advisory?.severity` if present
6. Return the list (length ≤ budget.maxSteps).

The planner never mutates inputs.

## Runner algorithm

`runRite(report, options)`:

1. Build the plan via `planUpgrades`.
2. If plan is empty:
   - If `report.status === 'green'`, set `status: 'nothing-to-do'`.
   - Else set `status: 'nothing-to-do'` (no actionable issues found).
3. For each step in the plan:
   a. Run `npm install <pkg>@<toVersion> --save` in the sandbox via `execa`,
      with a timeout of `budget.stepTimeoutMs`.
   b. Run `runInstall` from the autopsy module.
   c. Run `runBuild` from the autopsy module.
   d. Run `runTests` from the autopsy module (using `stack.testScript`).
   e. Record a `StepOutcome`.
   f. If build passes (exitCode 0), stop and set `status: 'green'`.
4. If all steps executed without reaching green, set `status: 'budget-exhausted'`.
5. Write `rite-result.json` to `sandboxPath`.
6. Return `RiteResult`.

## Reuse of autopsy runners
`runInstall`, `runBuild`, `runTests` are imported directly from `src/autopsy/`.
`detectStack` is called once at the start of the runner to get `buildScript` and
`testScript` (these may have changed after upgrades, but we reuse initial values
for speed; the runner does not re-detect).

## Error strategy
No step throws. Per-step timeouts are enforced via `execa`'s `timeout` option.
Timed-out steps set `timedOut: true` in `StepOutcome` and count against the budget.
Top-level exceptions in `runRite` are caught and returned as `status: 'error'`.

## Sandbox discipline
- All writes happen only inside `report.sandboxPath`.
- `rite-result.json` is written alongside `autopsy.json`.
- No git operations; no network operations beyond `npm install`.

## Testing approach
- **Unit / planner**: mock `AutopsyReport` inputs; verify plan ordering, locked
  package exclusion, and budget cap.
- **Property-based** (fast-check): for any combination of dependency issues and
  locked packages, the plan never includes a locked package and never exceeds
  `budget.maxSteps`.
- **Unit / runner**: mock `execa` and autopsy runners; verify step execution,
  timeout handling, and early-exit on green.
