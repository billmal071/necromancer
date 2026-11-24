#!/usr/bin/env node
/**
 * necromancer <github-url> [--budget N]
 *
 * Runs the full pipeline (autopsy → rite → report) for a GitHub repository
 * and writes outputs to ./out/<repo-slug>/.
 *
 * Exit codes:
 *   0 — resurrected (build and tests green)
 *   1 — partial, still-dead, or error
 */
import { isValidGithubUrl, runAutopsy } from './autopsy/index.js';
import { runRite } from './rite/index.js';
import { writeReport } from './report/index.js';
import { join, resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';

function parseArgs(argv: string[]): { url: string; budget: number } | null {
  // argv[0] = node, argv[1] = script path
  const args = argv.slice(2);

  if (args.length === 0) {
    return null;
  }

  let url = '';
  let budget = 10;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--budget' || arg === '-b') {
      const val = Number(args[i + 1]);
      if (!Number.isInteger(val) || val < 1) {
        process.stderr.write(`Error: --budget must be a positive integer\n`);
        return null;
      }
      budget = val;
      i++; // skip next arg
    } else if (!arg.startsWith('-')) {
      url = arg;
    } else {
      process.stderr.write(`Error: unknown flag: ${arg}\n`);
      return null;
    }
  }

  if (!url) {
    return null;
  }

  return { url, budget };
}

function usage(): void {
  process.stderr.write(
    'Usage: necromancer <github-url> [--budget N]\n' +
    '\n' +
    '  github-url   HTTPS URL of a public GitHub repository\n' +
    '  --budget N   Maximum upgrade steps (default: 10)\n' +
    '\n' +
    'Output is written to ./out/<repo-slug>/\n',
  );
}

/** Derive a filesystem-safe slug from a GitHub URL. */
function repoSlug(url: string): string {
  const clean = url.replace(/\.git$/, '');
  const parts = clean.split('/').filter(Boolean);
  // Last two parts: owner/repo
  return parts.slice(-2).join('--');
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv);

  if (parsed === null) {
    usage();
    process.exitCode = 1;
    return;
  }

  const { url, budget } = parsed;

  // Validate URL early
  if (!isValidGithubUrl(url)) {
    process.stderr.write(
      `Error: "${url}" is not a valid public GitHub HTTPS URL.\n` +
      'Expected form: https://github.com/<owner>/<repo>\n',
    );
    process.exitCode = 1;
    return;
  }

  const slug = repoSlug(url);
  const outDir = resolve(join('out', slug));

  process.stdout.write(`\n🔬 Autopsy: ${url}\n`);

  let autopsy;
  try {
    autopsy = await runAutopsy(url);
  } catch (err) {
    process.stderr.write(`Error during autopsy: ${String(err)}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`   Status: ${autopsy.status}\n`);
  process.stdout.write(`\n⚗️  Rite (budget: ${budget} steps)...\n`);

  let rite;
  try {
    rite = await runRite(autopsy, { budget: { maxSteps: budget } });
  } catch (err) {
    process.stderr.write(`Error during rite: ${String(err)}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`   Status: ${rite.status} (${rite.stepsExecuted.length} step(s) executed)\n`);
  process.stdout.write(`\n📄 Writing report to ${outDir}...\n`);

  let result;
  try {
    await mkdir(outDir, { recursive: true });
    result = await writeReport(autopsy, rite, outDir);
  } catch (err) {
    process.stderr.write(`Error writing report: ${String(err)}\n`);
    process.exitCode = 1;
    return;
  }

  // One-line summary
  const icon = result.verdict === 'resurrected' ? '✅' : result.verdict === 'partial' ? '⚠️' : '❌';
  process.stdout.write(
    `\n${icon} [${result.verdict}] ${slug} — report at ${result.reportPath}\n`,
  );

  process.exitCode = result.verdict === 'resurrected' ? 0 : 1;
}

main().catch((err: unknown) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exitCode = 1;
});
