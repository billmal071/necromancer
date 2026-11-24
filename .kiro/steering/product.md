# Necromancer: product rules

Necromancer revives abandoned open-source Node repositories. These rules apply to every change.

- Never push, open a PR or write outside the sandbox working folder without explicit user approval.
- Prefer the smallest change that makes the build pass. No drive-by refactors.
- The resurrection report must be honest: list what is still broken and what needs a human.
- Never run on a repository the user has not named. Clone read-only, work in a temp copy.
- No secrets, tokens or personal data in code, logs, reports or the repo.
- Every planner function gets a property-based test (upgrade plans never violate pinned constraints).
