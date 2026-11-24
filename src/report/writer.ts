import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AutopsyReport } from '../autopsy/types.js';
import type { RiteResult } from '../rite/types.js';
import { buildReport, buildPrBody, deriveVerdict } from './render.js';
import { collectPatch } from './patch.js';
import type { ReportResult } from './types.js';

/**
 * Write all three report artefacts to outDir:
 *   report.md   — human-readable resurrection report
 *   patch.diff  — git diff of the sandbox
 *   pr-body.md  — PR description ready to paste
 *
 * Returns a ReportResult with absolute paths to each file and the verdict.
 */
export async function writeReport(
  autopsy: AutopsyReport,
  rite: RiteResult,
  outDir: string,
): Promise<ReportResult> {
  // Ensure the output directory exists
  await mkdir(outDir, { recursive: true });

  const reportPath = join(outDir, 'report.md');
  const patchPath  = join(outDir, 'patch.diff');
  const prBodyPath = join(outDir, 'pr-body.md');

  // Relative path from outDir to report.md (for the PR body link)
  const reportRelPath = 'report.md';

  const verdict = deriveVerdict(rite);

  // Build content (pure, no I/O)
  const reportContent = buildReport(autopsy, rite);
  const prBodyContent = buildPrBody(autopsy, rite, reportRelPath);

  // Collect patch (may be empty)
  const patchContent = await collectPatch(rite.sandboxPath);
  const patchLines   = patchContent ? patchContent.split('\n').length : 0;

  // Write files
  await Promise.all([
    writeFile(reportPath,  reportContent,  'utf-8'),
    writeFile(patchPath,   patchContent,   'utf-8'),
    writeFile(prBodyPath,  prBodyContent,  'utf-8'),
  ]);

  return {
    reportPath,
    patchPath,
    prBodyPath,
    verdict,
    patchLines,
  };
}
