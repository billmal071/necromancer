# Necromancer (Kiroween, Resurrection category)

Deadline: Dec 4 2026 14:00 PT. Kiro credits form: Dec 1 12:00 PT. Rules: ../memory kiroween-rules.

## One line
Point it at an abandoned GitHub repo. It diagnoses why the project is dead, brings the build back to green, and opens a "resurrection report" PR.

## Why it fits Resurrection
The product literally revives dead software. The demo is a real corpse coming back: failing install and build before, passing after.

## MVP (must work end to end by Dec 2)
1. Input: a public repo URL.
2. Autopsy: clone, detect the stack (Node first), run install and build, record the failures, find the last commit, count outdated or deprecated dependencies.
3. Rite: an agent loop proposes the minimal upgrade or fix steps, runs them in a sandbox folder, and re-runs build and tests until green or a step budget runs out.
4. Output: a resurrection report (what was dead, what changed, what still needs a human) and a patch or PR draft. Nothing is pushed without the user approving.
5. Live URL: web UI that shows the autopsy and the report for a few pre-resurrected demo repos, plus a "run on your repo" path (rate limited).

Out of scope: languages other than Node, auto-merging, private repos.

## How Kiro is used (this is the 20% "technological implementation" score)
- Spec-driven: requirements.md, design.md, tasks.md for each of autopsy, rite, report in `.kiro/specs/`.
- Steering: `.kiro/steering/` for product rules (never push without approval, minimal diffs, report honesty).
- Hooks: on save run lint and tests; on commit check the report template is filled.
- MCP: GitHub MCP for repo metadata and PR drafts.
- Property-based tests for the dependency-upgrade planner (upgrade plans never break pinned constraints).
- Keep the `.kiro` folder committed (not gitignored). Judges check it.

## Demo repos
Pick 3 abandoned public Node repos that fail to build today and have a permissive licence. Shortlist to be confirmed by the user before use. Do not run it on anyone's repo without the owner's consent beyond read-only clone.

## Open decisions (user)
- Licence: Apache-2.0 (recommended, same as Redacto) or MIT.
- GitHub: `gh auth login` is needed (token in keyring is invalid) before the public repo can be created.
- Stack: TypeScript, Node 22, a small web UI deployed to Firebase Hosting or Vercel.

## Timeline
- Nov 25: spec files and steering in Kiro, repo created.
- Nov 26 to Dec 1: autopsy and rite built through Kiro, credits form sent Dec 1 before noon PT.
- Dec 2: demo repos resurrected, live URL up.
- Dec 3: video (under 3 min, YouTube public), write-up, blog post and social mention bonuses.
- Dec 4 before 14:00 PT: submit (ask the user first).
