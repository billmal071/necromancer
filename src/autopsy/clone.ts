import { execa } from 'execa';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Only github.com HTTPS URLs in the form https://github.com/<owner>/<repo>
 * are accepted. Rejects:
 *  - non-HTTPS protocols
 *  - non-github.com hostnames (including subdomains)
 *  - credentials in the authority (user:pass@)
 *  - query strings or hash fragments
 *  - paths that are not exactly /<owner>/<repo> (two non-empty segments)
 *  - owner or repo names that contain path-traversal characters
 */
export function isValidGithubUrl(url: string): boolean {
  // Reject path traversal sequences before URL parsing normalises them away
  if (url.includes('..')) return false;

  try {
    const parsed = new URL(url);

    // Must be HTTPS
    if (parsed.protocol !== 'https:') return false;

    // Exact hostname: github.com (no subdomains)
    if (parsed.hostname !== 'github.com') return false;

    // No credentials in the URL
    if (parsed.username !== '' || parsed.password !== '') return false;

    // No query string or fragment
    if (parsed.search !== '' || parsed.hash !== '') return false;

    // Path must match exactly /<owner>/<repo> or /<owner>/<repo>.git
    // Strip trailing .git for validation
    const rawPath = parsed.pathname.replace(/\.git$/, '');

    // Split and filter empty segments
    const segments = rawPath.split('/').filter(Boolean);

    // Exactly two segments: owner and repo
    if (segments.length !== 2) return false;

    const [owner, repo] = segments;

    // Each segment must be non-empty and contain only safe characters
    // GitHub usernames/org names: alphanumeric and hyphens, 1-39 chars, no leading/trailing hyphen
    // Repo names: alphanumeric, hyphens, underscores, dots
    const ownerPattern = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
    const repoPattern = /^[a-zA-Z0-9._-]{1,100}$/;

    if (!ownerPattern.test(owner ?? '')) return false;
    if (!repoPattern.test(repo ?? '')) return false;

    return true;
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
