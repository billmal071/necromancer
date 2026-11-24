# Autopsy – Requirements

## Purpose
Given a public GitHub repository URL, produce a machine-readable diagnosis of why
the project cannot build today.

## Functional requirements

### FR-1 Clone
- Accept a single HTTPS URL pointing to a public GitHub repository.
- Clone read-only into a temporary sandbox folder; never modify the original.
- Reject any URL that is not a valid github.com path.

### FR-2 Stack detection
- Detect Node.js projects by the presence of `package.json`.
- Record the Node engine field (if present) and the installed Node version.
- Out of scope: non-Node projects (return an unsupported-stack error).

### FR-3 Install
- Run `npm install` (or the detected package manager: npm / pnpm / yarn).
- Capture stdout, stderr, and exit code.
- Record each dependency that failed to resolve, with its required and available version.

### FR-4 Build
- Run the `build` script from `package.json`; if absent, run `tsc --noEmit`.
- Capture stdout, stderr, and exit code.
- Record each compiler or bundler error with file and line where available.

### FR-5 Test
- Run the `test` script if present; skip silently if absent.
- Capture pass / fail counts and any failing test names.

### FR-6 Dependency audit
- List every direct dependency that is outdated, deprecated, or has a known
  security advisory (npm audit).
- For each, record: name, pinned version, latest version, severity (if advisory).

### FR-7 Commit history summary
- Record the date and SHA of the last commit on the default branch.
- Record total commit count and approximate age of the repository.

### FR-8 Output contract
- Return a typed `AutopsyReport` object (defined in `design.md`).
- Serialise to JSON; write to `<sandbox>/autopsy.json`.
- Never include secrets, tokens, or personal data in the report.

## Non-functional requirements
- Complete within 120 seconds for a typical repo (< 500 deps).
- All failures are captured, not thrown; the report is always produced.
- No network calls beyond cloning and npm registry lookups.

## Constraints (from steering)
- Work only in the sandbox copy; never touch the source repo.
- Smallest-change principle: no modifications to the target repo during autopsy.
- Property-based tests cover the dependency-version comparison logic.
