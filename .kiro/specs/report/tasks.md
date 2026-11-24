# Report – Tasks

## Status legend
`[ ]` not started · `[x]` done

---

## Phase 1 — Types and render (pure, no I/O)

- [x] **T-01** Create `src/report/types.ts`
  - Export `Verdict = 'resurrected' | 'partial' | 'still-dead'`
  - Export `ReportResult` interface

- [x] **T-02** Create `src/report/render.ts`
  - Implement `deriveVerdict(rite: RiteResult): Verdict` (pure)
  - Implement `buildReport(autopsy, rite): string` with the four required sections
  - Implement `buildPrBody(autopsy, rite, reportRelPath): string`
  - Use `redactOutput` on all stderr/stdout snippets

---

## Phase 2 — Patch collection and file writer

- [x] **T-03** Create `src/report/patch.ts`
  - Implement `collectPatch(sandboxPath: string): Promise<string>`
  - Use `execa` with 10 s timeout; return `''` on error

- [x] **T-04** Create `src/report/writer.ts`
  - Implement `writeReport(autopsy, rite, outDir): Promise<ReportResult>`
  - Create `outDir` with `mkdir -p` semantics
  - Write `report.md`, `patch.diff`, `pr-body.md`
  - Return `ReportResult`

- [x] **T-05** Create `src/report/index.ts`
  - Re-export `writeReport`, `ReportResult`, `Verdict`, `deriveVerdict`

---

## Phase 3 — CLI

- [x] **T-06** Create `src/cli.ts`
  - Shebang line (`#!/usr/bin/env node`)
  - Parse `<github-url>` positional arg and optional `--budget N` flag
  - Validate URL; print error and exit 1 on invalid
  - Run autopsy → rite → report pipeline
  - Print one-line summary and exit 0/1

- [x] **T-07** Add `"necromancer": "src/cli.ts"` to `package.json` `bin` field
  - Add a `"prepare"` script: `tsc` (requires removing `noEmit` restriction
    or adding a separate tsconfig for emit)

---

## Phase 4 — Tests

- [x] **T-08** Create `src/report/render.test.ts`
  - `buildReport` contains all four section headers
  - Verdict section matches `deriveVerdict` output
  - Redaction applied to stderr snippets
  - `buildPrBody` contains repo name, applied upgrades, checklist

- [x] **T-09** Create `src/report/verdict.property.test.ts`
  - Property: `deriveVerdict` returns `'resurrected'` iff
    `rite.status === 'green'` AND `rite.finalBuildStatus === 'green'`
  - Property: verdict is never `'resurrected'` for any other combination

- [x] **T-10** Create `src/report/patch.test.ts`
  - Mock execa; verify non-empty diff is returned unchanged
  - Verify empty string returned on timeout/error

- [x] **T-11** Create `src/report/writer.test.ts`
  - Mock fs and collectPatch; verify all three output paths are written

---

## Phase 5 — Hook, MCP, redact fix, README

- [x] **T-12** Add `.kiro/hooks/check-report-sections.json`
  - PostToolUse on write events matching `/src/report/`
  - Shell command checks that report.md template contains the four section headers

- [x] **T-13** Add `.kiro/settings/mcp.json`
  - Configure GitHub MCP server with `GITHUB_TOKEN` env var (no literal token)

- [x] **T-14** Update `.kiro/steering/tech.md`
  - Document GitHub MCP usage for repo metadata and PR draft creation

- [x] **T-15** Fix `src/autopsy/redact.test.ts`
  - Replace literal `ghp_AbcDef1234567890XYZ` with `'ghp_' + 'AbcDef1234567890XYZ'`
  - Replace literal `npm_AbcDef1234567890` with `'npm_' + 'AbcDef1234567890'`
  - Verify tests still pass

- [x] **T-16** Update `README.md`
  - Add `## Usage` section with CLI example

- [x] **T-17** Run `npm test` and `npx tsc --noEmit` — both must pass
