# Autopsy – Design

## Module boundary
`src/autopsy/` — pure TypeScript, no web-framework dependencies.
Entry point: `runAutopsy(url: string): Promise<AutopsyReport>`

## Key types

```ts
type Severity = 'critical' | 'high' | 'moderate' | 'low' | 'none';

interface DependencyIssue {
  name: string;
  pinned: string;
  latest: string;
  deprecated: boolean;
  advisory?: { id: string; severity: Severity; title: string };
}

interface StepResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

interface AutopsyReport {
  repoUrl: string;
  clonedAt: string;           // ISO-8601
  nodeVersion: string;
  packageManager: 'npm' | 'pnpm' | 'yarn' | 'unknown';
  install: StepResult;
  build: StepResult;
  test?: StepResult;
  dependencyIssues: DependencyIssue[];
  lastCommit: { sha: string; date: string };
  repoAgeMonths: number;
  status: 'green' | 'install-failed' | 'build-failed' | 'test-failed' | 'unsupported';
}
```

## Pipeline

```
cloneRepo → detectStack → runInstall → runBuild → runTests
         → auditDependencies → fetchCommitMeta → assembleReport
```

Each step is an async function that accepts the sandbox path and returns a
partial result. Steps after a failure still run (best-effort) so the report
is as complete as possible.

## Sandbox management
- Create under `os.tmpdir()/necromancer-<uuid>`.
- Caller is responsible for cleanup; `runAutopsy` returns the path in the report.
- Git clone uses `--depth 50` to limit download size.

## Package manager detection
Priority: `pnpm-lock.yaml` → `yarn.lock` → `package-lock.json` → npm default.

## Error strategy
No step throws. Each `StepResult.exitCode !== 0` sets the report `status`.
Unhandled rejections inside a step are caught and stored in `stderr`.

## Testing approach
- Unit: mock `execa` calls; assert `AutopsyReport` shape and status values.
- Property-based (fast-check): `dependencyIssues` comparator never marks a
  dependency outdated when pinned === latest, and never violates semver order.
- Integration: run against a fixture repo checked into `test/fixtures/`.
