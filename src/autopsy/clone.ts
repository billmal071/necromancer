import { execa } from 'execa';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Only github.com HTTPS URLs are accepted. */
export function isValidGithubUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname === 'github.com' &&
      parsed.pathname.length > 1
    );
  } catch {
    return false;
  }
}

export interface CloneResult {
  sandboxPath: string;
  clonedAt: string;
  error?: string;
}

/**
 * Clone a GitHub repository into a temporary sandbox directory.
 * Returns the sandbox path and cloned-at timestamp on success.
 * Returns an error string without throwing on failure.
 */
export async function cloneRepo(
  url: string,
  sandboxRoot?: string,
): Promise<CloneResult> {
  if (!isValidGithubUrl(url)) {
    return {
      sandboxPath: '',
      clonedAt: new Date().toISOString(),
      error: `Invalid URL: only https://github.com/* URLs are accepted. Got: ${url}`,
    };
  }

  const root = sandboxRoot ?? tmpdir();
  let sandboxPath: string;
  try {
    sandboxPath = await mkdtemp(join(root, 'necromancer-'));
  } catch (err) {
    return {
      sandboxPath: '',
      clonedAt: new Date().toISOString(),
      error: `Failed to create sandbox directory: ${String(err)}`,
    };
  }

  const clonedAt = new Date().toISOString();
  try {
    await execa('git', ['clone', '--depth', '50', url, sandboxPath], {
      timeout: 60_000,
    });
    return { sandboxPath, clonedAt };
  } catch (err) {
    return {
      sandboxPath,
      clonedAt,
      error: `git clone failed: ${String(err)}`,
    };
  }
}
