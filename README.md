# Necromancer

Revive abandoned Node repositories. Necromancer clones a public repo into a sandbox, runs an autopsy (stack, install, build, tests, outdated and vulnerable dependencies, commit history) and returns a machine-readable diagnosis. A later rite step will propose minimal fixes and a resurrection report.

Built with Kiro for Kiroween 2026 (Resurrection category). The `.kiro/` folder holds the specs, steering and hooks used to build it.

## Status
- Autopsy: implemented, 43 tests passing (Vitest, fast-check).
- Rite and report: planned (see `BRIEF.md`).

## Develop
```
npm install
npm test
npx tsc --noEmit
```

Licence: Apache-2.0.
