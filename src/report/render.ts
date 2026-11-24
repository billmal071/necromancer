import type { AutopsyReport } from '../autopsy/types.js';
import { redactOutput } from '../autopsy/redact.js';
import type { RiteResult, StepOutcome } from '../rite/types.js';
import type { Verdict } from './types.js';

const MAX_SNIPPET = 500;

/** Truncate a string to at most maxLen chars, appending "…" if truncated. */
function truncate(s: string, maxLen = MAX_SNIPPET): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + '…';
}

/** Derive the resurrection verdict from a RiteResult. Pure function. */
export function deriveVerdict(rite: RiteResult): Verdict {
  if (rite.status === 'green' && rite.finalBuildStatus === 'green') {
    return 'resurrected';
  }
  if (rite.stepsExecuted.length > 0) {
    const anyGreenBuild = rite.stepsExecuted.some((s) => s.build.exitCode === 0);
    if (anyGreenBuild) return 'partial';
  }
  return 'still-dead';
}

function verdictLine(v: Verdict): string {
  switch (v) {
    case 'resurrected': return '**Resurrected ✅**';
    case 'partial':     return '**Partial — needs attention ⚠️**';
    case 'still-dead':  return '**Still dead ❌**';
  }
}

function exitCodeCell(code: number): string {
  return code === 0 ? `✅ ${code}` : `❌ ${code}`;
}

function formatStep(outcome: StepOutcome): string {
  const { step, install, build, test, timedOut } = outcome;
  const lines: string[] = [];
  lines.push(`### ${step.package}: ${step.fromVersion} → ${step.toVersion}`);
  lines.push('');

  const reasonLabel = step.reason === 'advisory' && step.advisorySeverity
    ? `advisory (${step.advisorySeverity})`
    : step.reason;
  lines.push(`**Reason:** ${reasonLabel}`);

  if (timedOut) {
    lines.push('');
    lines.push('> ⏱️ This step timed out before completing.');
  }

  lines.push('');
  lines.push('| Phase   | Exit code |');
  lines.push('|---------|-----------|');
  lines.push(`| install | ${exitCodeCell(install.exitCode)} |`);
  lines.push(`| build   | ${exitCodeCell(build.exitCode)} |`);
  if (test !== undefined) {
    lines.push(`| test    | ${exitCodeCell(test.exitCode)} |`);
  }

  // Show first failing snippet
  const failing = [install, build, test].find((r) => r !== undefined && r.exitCode !== 0);
  if (failing !== undefined && (failing.stderr || failing.stdout)) {
    const snippet = redactOutput(truncate(failing.stderr || failing.stdout));
    if (snippet) {
      lines.push('');
      lines.push('```');
      lines.push(snippet);
      lines.push('```');
    }
  }

  return lines.join('\n');
}

/** Build the full resurrection report Markdown. Pure function — no I/O. */
export function buildReport(autopsy: AutopsyReport, rite: RiteResult): string {
  const verdict = deriveVerdict(rite);
  const repoName = autopsy.repoUrl.replace(/\.git$/, '').split('/').slice(-2).join('/');

  const lines: string[] = [];

  // ── Title ──────────────────────────────────────────────────────────────────
  lines.push(`# Resurrection Report: ${repoName}`);
  lines.push('');
  lines.push(`Generated from autopsy taken at: ${autopsy.clonedAt}`);
  lines.push(`Rite duration: ${(rite.durationMs / 1000).toFixed(1)} s`);
  lines.push('');

  // ── § What was dead ────────────────────────────────────────────────────────
  lines.push('## What was dead');
  lines.push('');
  lines.push(`- **Repo:** ${autopsy.repoUrl}`);
  lines.push(`- **Last commit:** ${autopsy.lastCommit.sha.slice(0, 8)} (${autopsy.lastCommit.date})`);
  lines.push(`- **Repo age:** ~${autopsy.repoAgeMonths} months`);
  lines.push(`- **Node version:** ${autopsy.nodeVersion}`);
  lines.push(`- **Package manager:** ${autopsy.packageManager}`);
  lines.push('');

  lines.push('| Phase   | Exit code |');
  lines.push('|---------|-----------|');
  lines.push(`| install | ${exitCodeCell(autopsy.install.exitCode)} |`);
  lines.push(`| build   | ${exitCodeCell(autopsy.build.exitCode)} |`);
  if (autopsy.test !== undefined) {
    lines.push(`| test    | ${exitCodeCell(autopsy.test.exitCode)} |`);
  }
  lines.push('');

  // Show the first failing phase snippet
  const firstFailing = [autopsy.install, autopsy.build, autopsy.test].find(
    (r) => r !== undefined && r.exitCode !== 0,
  );
  if (firstFailing !== undefined) {
    const snippet = redactOutput(truncate(firstFailing.stderr || firstFailing.stdout));
    if (snippet) {
      lines.push('**First failing output:**');
      lines.push('```');
      lines.push(snippet);
      lines.push('```');
      lines.push('');
    }
  }

  const issueCount = autopsy.dependencyIssues.length;
  if (issueCount > 0) {
    lines.push(`**Dependency issues found:** ${issueCount}`);
    lines.push('');
  }

  // ── § What changed ─────────────────────────────────────────────────────────
  lines.push('## What changed');
  lines.push('');

  if (rite.stepsExecuted.length === 0) {
    lines.push('No upgrade steps were executed.');
  } else {
    for (const outcome of rite.stepsExecuted) {
      lines.push(formatStep(outcome));
      lines.push('');
    }
  }

  // ── § What still needs a human ─────────────────────────────────────────────
  lines.push('## What still needs a human');
  lines.push('');

  if (rite.status === 'green' && rite.finalBuildStatus === 'green') {
    lines.push('Nothing — the build is green.');
  } else {
    lines.push(`**Final build status:** \`${rite.finalBuildStatus}\``);
    lines.push('');

    const failedSteps = rite.stepsExecuted.filter(
      (s) => s.build.exitCode !== 0 || (s.test !== undefined && s.test.exitCode !== 0),
    );
    if (failedSteps.length > 0) {
      lines.push('**Steps that did not reach green:**');
      for (const s of failedSteps) {
        const pkg = `${s.step.package} (${s.step.fromVersion} → ${s.step.toVersion})`;
        const buildStatus = s.build.exitCode !== 0 ? 'build failed' : '';
        const testStatus = s.test !== undefined && s.test.exitCode !== 0 ? 'tests failed' : '';
        const issues = [buildStatus, testStatus].filter(Boolean).join(', ');
        lines.push(`- ${pkg}: ${issues || 'timed out'}`);
      }
      lines.push('');
    }

    if (rite.stepsPlanned.length > rite.stepsExecuted.length) {
      const skipped = rite.stepsPlanned.length - rite.stepsExecuted.length;
      lines.push(`**${skipped} planned step(s) were not executed** (budget exhausted or early stop).`);
      lines.push('');
    }

    if (rite.errorMessage !== undefined) {
      lines.push(`**Error:** ${redactOutput(rite.errorMessage)}`);
      lines.push('');
    }

    lines.push('A human should review the remaining failures and apply manual fixes.');
  }

  // ── § Verdict ──────────────────────────────────────────────────────────────
  lines.push('');
  lines.push('## Verdict');
  lines.push('');
  lines.push(verdictLine(verdict));
  lines.push('');

  return lines.join('\n');
}

/** Build the PR body Markdown. Pure function — no I/O. */
export function buildPrBody(
  autopsy: AutopsyReport,
  rite: RiteResult,
  reportRelPath: string,
): string {
  const repoName = autopsy.repoUrl.replace(/\.git$/, '').split('/').pop() ?? 'repo';

  const lines: string[] = [];
  lines.push(`## chore: resurrect ${repoName}`);
  lines.push('');
  lines.push('Automated resurrection by [Necromancer](https://github.com/wmalachy/necromancer).');
  lines.push('');

  lines.push('### Applied upgrades');
  lines.push('');
  if (rite.stepsExecuted.length === 0) {
    lines.push('No upgrade steps were applied.');
  } else {
    for (const outcome of rite.stepsExecuted) {
      const { step } = outcome;
      const reasonLabel = step.reason === 'advisory' && step.advisorySeverity
        ? `advisory: ${step.advisorySeverity}`
        : step.reason;
      const status = outcome.build.exitCode === 0 ? '✅' : '❌';
      lines.push(`- ${status} \`${step.package}\`: ${step.fromVersion} → ${step.toVersion} (${reasonLabel})`);
    }
  }
  lines.push('');

  lines.push('### Full report');
  lines.push('');
  lines.push(`See [report.md](${reportRelPath}).`);
  lines.push('');

  lines.push('### Reviewer checklist');
  lines.push('');
  lines.push('- [ ] Review the diff in `patch.diff`');
  lines.push('- [ ] Run `npm test` locally on the patched branch');
  lines.push('- [ ] Confirm no unintended changes were introduced');
  lines.push('- [ ] Approve and merge only if satisfied');
  lines.push('');

  return lines.join('\n');
}
