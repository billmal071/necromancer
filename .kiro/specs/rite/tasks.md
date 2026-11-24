# Rite – Tasks

Ordered implementation checklist. Each task is independently testable.

## T-1 Scaffold module
- [ ] Create `src/rite/` directory with `index.ts` exporting `runRite` and `RiteResult`.
- [ ] Define all types from `design.md` in `src/rite/types.ts`.
- [ ] Confirm `npm test` still passes after scaffold (no broken imports).

## T-2 Planner – pure function
- [ ] Implement `planUpgrades(report, lockedPackages, budget)` in `src/rite/planner.ts`.
- [ ] Locked packages never appear in the returned plan.
- [ ] Plan length never exceeds `budget.maxSteps`.
- [ ] Steps sorted: advisory severity first, then semver distance.
- [ ] Unit test: empty `dependencyIssues` → empty plan.
- [ ] Unit test: all packages locked → empty plan.
- [ ] Unit test: advisory packages sorted before outdated.
- [ ] Unit test: plan length capped at `budget.maxSteps`.

## T-3 Property-based tests for planner
- [ ] Add `src/rite/planner.property.test.ts` using fast-check.
- [ ] Property: for any set of issues and locked packages, no step in the plan
  touches a locked package.
- [ ] Property: plan length is always ≤ budget.maxSteps.
- [ ] Run with 1000 iterations minimum.

## T-4 Runner – step execution
- [ ] Implement `runRite(report, options?)` in `src/rite/runner.ts`.
- [ ] Reuse `runInstall`, `runBuild`, `runTests`, `detectStack` from `src/autopsy/`.
- [ ] Each step: run `npm install <pkg>@<version>`, then install → build → test.
- [ ] Enforce `budget.stepTimeoutMs` per step via `execa` timeout option.
- [ ] Stop early if build goes green; record `status: 'green'`.
- [ ] Stop after `budget.maxSteps` steps; record `status: 'budget-exhausted'`.
- [ ] Return `status: 'nothing-to-do'` when plan is empty.
- [ ] Unit test: mock execa; green first step → stepsExecuted has length 1.
- [ ] Unit test: all steps fail → status `budget-exhausted`.
- [ ] Unit test: step times out → `timedOut: true`, next step attempted.

## T-5 Result serialisation
- [ ] Write `rite-result.json` to `sandboxPath` in `runRite`.
- [ ] Unit test: file is written at the correct path.

## T-6 Wire up index
- [ ] Export `runRite`, `RiteResult`, `UpgradeStep`, `RiteOptions`, `RiteBudget`
  from `src/rite/index.ts`.
- [ ] Confirm `npx tsc --noEmit` passes.

## T-7 Autopsy URL hardening
- [ ] Strengthen `isValidGithubUrl` in `src/autopsy/clone.ts`:
  - Require exactly `https:` protocol.
  - Require hostname `github.com` (no subdomains, no credentials in authority).
  - Require path matches `/<owner>/<repo>` (two non-empty segments, no extra path).
  - Reject URLs with credentials (`user:pass@`) or query strings or fragments.
  - Reject `.git` suffix tricks that pad path depth.
- [ ] Unit tests: at least 10 valid and 10 invalid URL cases.

## T-8 Autopsy output redaction
- [ ] Add `redactOutput(text: string): string` to a new `src/autopsy/redact.ts`.
- [ ] Redact home directory paths (replace `/Users/<name>/…` or `/home/<name>/…`
  with `~/<rest>`).
- [ ] Redact tokens: patterns matching `ghp_[A-Za-z0-9]+`, `npm_[A-Za-z0-9]+`,
  `Bearer [A-Za-z0-9._-]+`.
- [ ] Redact email addresses (RFC-5321 simple pattern).
- [ ] Apply `redactOutput` to `stdout` and `stderr` of every `StepResult` before
  storing in the report (in `assembleReport`).
- [ ] Property test: `redactOutput` is idempotent (applying twice = applying once).
- [ ] Unit tests: specific patterns are redacted; non-sensitive text is unchanged.

## T-9 Final verification
- [ ] `npm test` passes (all suites green, fast-check properties hold with ≥ 1000 runs).
- [ ] `npx tsc --noEmit` exits 0 (no type errors).
