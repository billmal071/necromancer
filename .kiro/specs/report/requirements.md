# Report – Requirements

## Purpose
Given an `AutopsyReport` (before state) and a `RiteResult` (after state), produce
three output artefacts in a designated output directory:

1. A human-readable **resurrection report** in Markdown.
2. A **patch draft** file — the git diff of the sandbox after the rite.
3. A **PR body** (Markdown) suitable for opening a pull request.

Nothing is pushed, opened, or committed; output is local only.

## Functional requirements

### FR-1 Input contract
- Accept `AutopsyReport`, `RiteResult`, and an output directory path.
- Both inputs are plain objects (deserialisable from JSON files produced by the
  earlier pipeline steps).

### FR-2 Resurrection report structure
The Markdown file **must** contain exactly these four top-level sections in this order:

1. `## What was dead` — summarise the pre-rite state: install/build/test exit codes,
   any failing step output (truncated to ≤ 500 chars), dependency issue count,
   last commit date and SHA, and repo age in months.
2. `## What changed` — one sub-section per executed upgrade step, showing:
   - package name, `fromVersion` → `toVersion`, reason, advisory severity if present.
   - Install, build, and test exit codes after that step.
   - If a step timed out, note it explicitly.
3. `## What still needs a human` — list every failure that remains after the rite
   ends. If the rite reached `status: 'green'`, this section reads
   "Nothing — the build is green." Otherwise list all steps that failed and the
   final build status.
4. `## Verdict` — a single bold line:
   - `**Resurrected ✅**` when `RiteResult.status === 'green'` **AND**
     `finalBuildStatus === 'green'` (i.e. final build and test both exited 0).
   - `**Partial — needs attention ⚠️**` when some steps succeeded but the rite
     did not reach fully green.
   - `**Still dead ❌**` in all other cases (no progress, error, unsupported).

The honesty rule: **never** claim resurrected unless `finalBuildStatus === 'green'`.
If any failing step exists, it must appear in "What still needs a human".

### FR-3 Patch draft
- Run `git diff HEAD` inside `RiteResult.sandboxPath`.
- Write the raw diff to `patch.diff` in the output directory.
- If the diff command fails or returns empty, write an empty file and note it in
  the report.

### FR-4 PR body
- Produce `pr-body.md` with a standard PR description:
  - Title line: `chore: resurrect <repo-name>`.
  - Bullet list of all applied upgrades.
  - Link to the full resurrection report.
  - A "Checklist" section for the human reviewer (review diff, run tests locally,
    approve before merging).

### FR-5 Output layout
All three files are written to the caller-supplied output directory:
```
<outDir>/
  report.md
  patch.diff
  pr-body.md
```

### FR-6 Redaction
Any sandbox path segments and any token-shaped strings in stdout/stderr must be
redacted (via `redactOutput` from `src/autopsy/redact.ts`) before inclusion in
the report.

### FR-7 Determinism
Given the same inputs, the report function must produce identical content (no
timestamps from `Date.now()` in the body; use `RiteResult.durationMs` and
`AutopsyReport.clonedAt` where dates are needed).

## Non-functional requirements
- No external network calls.
- Pure synchronous logic where possible; file I/O via async fs.
- Complete within 5 seconds for typical inputs.

## Constraints (from steering)
- Never push or open PRs automatically. The PR body is a local file only.
- The report is honest: no green claim without both build and test exit codes 0.
- No secrets, tokens, or personal data in any output file.
