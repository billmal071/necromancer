# Report – Design

## Module boundary
`src/report/` — pure TypeScript, no web-framework dependencies.
Entry point: `writeReport(autopsy: AutopsyReport, rite: RiteResult, outDir: string): Promise<ReportResult>`

## Key types

```ts
/** Verdict classification for the resurrection report. */
export type Verdict = 'resurrected' | 'partial' | 'still-dead';

/** Summary returned by writeReport. */
export interface ReportResult {
  reportPath: string;   // absolute path to report.md
  patchPath: string;    // absolute path to patch.diff
  prBodyPath: string;   // absolute path to pr-body.md
  verdict: Verdict;
  patchLines: number;   // lines in the diff (0 if empty)
}
```

## Internal module layout

```
src/report/
  types.ts      — Verdict, ReportResult
  render.ts     — pure render functions (no I/O): buildReport(), buildPrBody()
  patch.ts      — collectPatch(): runs git diff in sandboxPath
  writer.ts     — writeReport(): orchestrates render + patch + file writes
  index.ts      — re-exports ReportResult, Verdict, writeReport
```

## Verdict derivation (pure function)

```ts
function deriveVerdict(rite: RiteResult): Verdict {
  if (rite.status === 'green' && rite.finalBuildStatus === 'green') {
    return 'resurrected';
  }
  if (rite.stepsExecuted.length > 0) {
    // Some steps ran; partial progress possible
    const anyGreenStep = rite.stepsExecuted.some(
      (s) => s.build.exitCode === 0
    );
    if (anyGreenStep) return 'partial';
  }
  return 'still-dead';
}
```

The verdict string maps to display text:
| Verdict | Display |
|---|---|
| `resurrected` | `**Resurrected ✅**` |
| `partial` | `**Partial — needs attention ⚠️**` |
| `still-dead` | `**Still dead ❌**` |

## render.ts — buildReport()

Pure function signature:
```ts
function buildReport(autopsy: AutopsyReport, rite: RiteResult): string
```

Sections in order:

### § What was dead
- Repo URL and last commit (`sha` and `date`).
- Repo age in months.
- Pre-rite status table: `install | build | test` → exit codes.
- If `autopsy.status !== 'green'`: truncated (≤ 500 chars) failing step stderr.
- Dependency issue count.

### § What changed
- If `rite.stepsExecuted` is empty: "No upgrade steps were executed."
- Otherwise, for each `StepOutcome`:
  - `### <package> <fromVersion> → <toVersion>` heading.
  - Reason + advisory severity if present.
  - Timed out notice if `timedOut`.
  - Exit code table: install / build / test.

### § What still needs a human
- If `rite.status === 'green'` and `rite.finalBuildStatus === 'green'`:
  "Nothing — the build is green."
- Otherwise: bulleted list of remaining failures (steps whose build/test exited
  non-zero), plus the final `finalBuildStatus`.

### § Verdict
- One bold line derived by `deriveVerdict()`.

### Redaction
All stderr/stdout snippets are passed through `redactOutput` before embedding.

## patch.ts — collectPatch()

```ts
async function collectPatch(sandboxPath: string): Promise<string>
```

Runs:
```
git -C <sandboxPath> diff HEAD
```
using `execa` with a 10-second timeout. Returns raw diff text or `''` on error.

## writer.ts — writeReport()

1. Derive verdict.
2. Build report Markdown string via `buildReport`.
3. Build PR body Markdown string via `buildPrBody`.
4. Collect patch via `collectPatch`.
5. `mkdir -p outDir`.
6. Write `report.md`, `patch.diff`, `pr-body.md` atomically (write-then-rename
   pattern is not needed here; simple `writeFile` is sufficient).
7. Return `ReportResult`.

## buildPrBody()

```ts
function buildPrBody(autopsy: AutopsyReport, rite: RiteResult, reportRelPath: string): string
```

Produces:
```markdown
## chore: resurrect <repo-name>

### Applied upgrades
- pkg A: 1.0.0 → 2.0.0 (outdated)
- pkg B: 3.1.0 → 3.1.5 (advisory: high)

### Full report
See [report.md](<reportRelPath>).

### Reviewer checklist
- [ ] Review the diff in `patch.diff`
- [ ] Run `npm test` locally on the patched branch
- [ ] Confirm no unintended changes
- [ ] Approve and merge only if satisfied
```

## CLI integration (src/cli.ts)

The CLI is **not** part of `src/report/` — it lives at `src/cli.ts` and uses
the report module as a library. It orchestrates the full pipeline:

```
necromancer <github-url> [--budget N]
```

Steps:
1. Validate URL via `isValidGithubUrl`.
2. Create `./out/<repo-slug>/` output directory.
3. Run `runAutopsy(url, { outDir })` → `AutopsyReport`.
4. Run `runRite(autopsy, { budget: { maxSteps: N } })` → `RiteResult`.
5. Run `writeReport(autopsy, rite, outDir)` → `ReportResult`.
6. Print a one-line summary to stdout:
   ```
   [resurrected|partial|still-dead] <repo> — report at ./out/<slug>/report.md
   ```
7. Exit with code 0 if resurrected, 1 otherwise.

## Error handling
All three pipeline steps are wrapped in try/catch; errors are printed to stderr
with `process.exitCode = 1` (not `process.exit(1)`, to allow async cleanup).

## Testing approach
- **Unit / render**: supply synthetic `AutopsyReport` + `RiteResult` fixtures;
  assert section headers are present, verdict is correct.
- **Property-based** (fast-check): for any `RiteResult`, verdict is `'resurrected'`
  only when `status === 'green'` AND `finalBuildStatus === 'green'`.
- **Unit / patch**: mock `execa`; assert empty string on timeout, raw diff otherwise.
- **Unit / writer**: mock fs + execa; assert all three files are written.
