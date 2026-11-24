# Rite – Requirements

## Purpose
Given an `AutopsyReport`, apply a minimal set of deterministic upgrade/fix steps
to the sandbox copy of the repository, re-run install/build/test after each step,
and stop when the build goes green or a step budget is exhausted.

No LLM or agent loop is used: the planner is a pure function. Nothing is ever
pushed or committed outside the sandbox.

## Functional requirements

### FR-1 Input contract
- Accept an `AutopsyReport` produced by the Autopsy step.
- If `report.status === 'green'`, return immediately with an empty plan (nothing to do).
- If `report.status === 'unsupported'`, return a failure result explaining the
  stack is not supported.
- Respect `report.sandboxPath` as the working directory; never write outside it.

### FR-2 Planner – dependency upgrades
- For each `DependencyIssue` in `report.dependencyIssues`:
  - If the package is in the `lockedPackages` set (caller-supplied), **skip it
    unconditionally**. Locked packages must never be modified.
  - Otherwise, compute the semver-safe target:
    - Use the **latest** version from the issue when it satisfies the existing
      range specifier (e.g. `^1.2.3` → target the latest `^1.x`).
    - If the issue has an advisory, prefer the fixed range from the advisory.
  - Produce one `UpgradeStep` per package to change.
- Never produce more steps than `budget.maxSteps`.
- Prioritise security advisories (critical → high → moderate → low) then
  outdated packages by semver distance.

### FR-3 Runner – step execution
- Execute steps one at a time in the sandbox, never in parallel.
- For each step:
  - Apply the dependency change (write `package.json`, or run the appropriate
    `npm install <pkg>@<version>` command).
  - Re-run install → build → test using the same runners as Autopsy.
  - If the step produces a green result, stop immediately and report success.
  - If the step fails, record the failure and continue to the next step.
  - Enforce a per-step timeout (`budget.stepTimeoutMs`; default 120 s).
- Stop after `budget.maxSteps` steps regardless of outcome.

### FR-4 Budget guard
- `budget.maxSteps` (default 10) is the total number of upgrade steps allowed.
- `budget.stepTimeoutMs` (default 120 000 ms) is the per-step wall-clock limit.
- If the budget is exhausted before green, the rite result reports
  `status: 'budget-exhausted'`.
- Steps that time out count against the budget; they do not throw.

### FR-5 Output contract
- Return a `RiteResult` object (defined in `design.md`).
- Write `rite-result.json` to the sandbox path alongside `autopsy.json`.
- Never include secrets, tokens, or personal data in the result.

### FR-6 Locked constraints
- The caller passes a `lockedPackages: Set<string>` to `runRite`.
- The planner guarantees (and property tests verify) that no step in the returned
  plan touches a locked package.
- Locked packages are never modified even if they appear in `dependencyIssues`.

## Non-functional requirements
- The planner is a pure function with no side-effects (easy to test and property-check).
- All failures are captured, not thrown; `RiteResult` is always produced.
- Complete within `budget.maxSteps × budget.stepTimeoutMs + 30 s` overhead.

## Constraints (from steering)
- Work only in the sandbox copy; never touch the source repo or push anything.
- Smallest-change principle: prefer the minimum version bump that makes the build pass.
- Property-based tests cover the planner (locked constraints never violated,
  budget never exceeded).
