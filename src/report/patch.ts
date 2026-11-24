import { execa } from 'execa';

const GIT_DIFF_TIMEOUT_MS = 10_000;

/**
 * Collect the git diff of the sandbox after the rite.
 * Returns the raw diff text, or '' if the command fails or times out.
 * Never throws.
 */
export async function collectPatch(sandboxPath: string): Promise<string> {
  if (!sandboxPath) return '';
  try {
    const result = await execa('git', ['-C', sandboxPath, 'diff', 'HEAD'], {
      timeout: GIT_DIFF_TIMEOUT_MS,
      reject: false,
    });
    return result.stdout ?? '';
  } catch {
    return '';
  }
}
