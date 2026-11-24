# Autopsy – Tasks

Ordered implementation checklist. Each task is independently testable.

## T-1 Scaffold module
- [x] Create `src/autopsy/` directory with `index.ts` exporting `runAutopsy`.
- [x] Define all types from `design.md` in `src/autopsy/types.ts`.
- [x] Wire up Vitest; confirm `npm test` runs and passes on empty suite.

## T-2 Clone step
- [x] Implement `cloneRepo(url, sandboxRoot)` using `execa` + `git clone --depth 50`.
- [x] Validate URL format before cloning (reject non-github.com URLs).
- [x] Unit test: invalid URL returns error result without spawning git.

## T-3 Stack detection
- [x] Implement `detectStack(sandboxPath)`: read `package.json`, detect package manager.
- [x] Return `unsupported` status if `package.json` absent.
- [x] Unit test: fixture with pnpm-lock.yaml is detected as `pnpm`.

## T-4 Install step
- [x] Implement `runInstall(sandboxPath, pm)` with captured stdout/stderr/exitCode/duration.
- [x] Unit test: mock execa to return non-zero exit; assert `install.exitCode !== 0`.

## T-5 Build step
- [x] Implement `runBuild(sandboxPath)`: run `build` script or fall back to `tsc --noEmit`.
- [x] Unit test: missing `build` script falls back correctly.

## T-6 Test step
- [x] Implement `runTests(sandboxPath)`: skip gracefully if no `test` script.
- [x] Unit test: no `test` script → `report.test` is `undefined`.

## T-7 Dependency audit
- [x] Implement `auditDependencies(sandboxPath)`: parse `npm outdated --json` and
  `npm audit --json`.
- [x] Map results to `DependencyIssue[]`.
- [x] Property-based test (fast-check): for any (name, v, v) pair where pinned ===
  latest, `deprecated` is false and no advisory severity upgrade occurs.

## T-8 Commit metadata
- [x] Implement `fetchCommitMeta(sandboxPath)`: `git log -1` + `git rev-list --count HEAD`.
- [x] Compute `repoAgeMonths` from first-commit date.
- [x] Unit test: fixture repo returns correct SHA and positive age.

## T-9 Assemble report
- [x] Implement `assembleReport(...)` combining all step results into `AutopsyReport`.
- [x] Set `status` field based on first failing step.
- [x] Serialise to `<sandbox>/autopsy.json` via `fs.writeFile`.
- [x] Unit test: green run → `status === 'green'`; install failure → `status === 'install-failed'`.

## T-10 Integration test
- [x] Add a minimal broken-Node fixture under `test/fixtures/broken-node-app/`.
- [x] Integration test: `runAutopsy` on fixture returns `status !== 'green'` and
  non-empty `dependencyIssues`.

## T-11 Cleanup & export
- [x] Expose `AutopsyReport` and `runAutopsy` from `src/autopsy/index.ts`.
- [x] Confirm all Vitest tests pass and fast-check properties hold with 1000 runs.
