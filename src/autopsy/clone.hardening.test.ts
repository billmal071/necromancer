import { describe, it, expect } from 'vitest';
import { isValidGithubUrl } from './clone.ts';

describe('isValidGithubUrl – hardened', () => {
  // Valid URLs
  it('accepts basic owner/repo', () => {
    expect(isValidGithubUrl('https://github.com/owner/repo')).toBe(true);
  });

  it('accepts owner/repo with .git suffix', () => {
    expect(isValidGithubUrl('https://github.com/owner/repo.git')).toBe(true);
  });

  it('accepts repo names with hyphens and underscores', () => {
    expect(isValidGithubUrl('https://github.com/my-org/my_repo')).toBe(true);
  });

  it('accepts repo names with dots', () => {
    expect(isValidGithubUrl('https://github.com/owner/repo.js')).toBe(true);
  });

  it('accepts single-character owner and repo', () => {
    expect(isValidGithubUrl('https://github.com/a/b')).toBe(true);
  });

  it('accepts numeric owner', () => {
    expect(isValidGithubUrl('https://github.com/owner123/repo456')).toBe(true);
  });

  // Protocol rejections
  it('rejects http protocol', () => {
    expect(isValidGithubUrl('http://github.com/owner/repo')).toBe(false);
  });

  it('rejects git:// protocol', () => {
    expect(isValidGithubUrl('git://github.com/owner/repo')).toBe(false);
  });

  it('rejects ssh:// protocol', () => {
    expect(isValidGithubUrl('ssh://github.com/owner/repo')).toBe(false);
  });

  // Hostname rejections
  it('rejects gitlab.com', () => {
    expect(isValidGithubUrl('https://gitlab.com/owner/repo')).toBe(false);
  });

  it('rejects raw.githubusercontent.com', () => {
    expect(isValidGithubUrl('https://raw.githubusercontent.com/owner/repo')).toBe(false);
  });

  it('rejects subdomain of github.com', () => {
    expect(isValidGithubUrl('https://api.github.com/owner/repo')).toBe(false);
  });

  it('rejects evil-github.com', () => {
    expect(isValidGithubUrl('https://evil-github.com/owner/repo')).toBe(false);
  });

  // Path rejections
  it('rejects bare github.com with no path', () => {
    expect(isValidGithubUrl('https://github.com')).toBe(false);
  });

  it('rejects path with only owner', () => {
    expect(isValidGithubUrl('https://github.com/owner')).toBe(false);
  });

  it('rejects path with owner/repo/extra', () => {
    expect(isValidGithubUrl('https://github.com/owner/repo/extra')).toBe(false);
  });

  it('rejects path with owner/repo/tree/main', () => {
    expect(isValidGithubUrl('https://github.com/owner/repo/tree/main')).toBe(false);
  });

  it('rejects path with four segments', () => {
    expect(isValidGithubUrl('https://github.com/a/b/c/d')).toBe(false);
  });

  // Credential rejections
  it('rejects URL with username in authority', () => {
    expect(isValidGithubUrl('https://user@github.com/owner/repo')).toBe(false);
  });

  it('rejects URL with user:pass in authority', () => {
    expect(isValidGithubUrl('https://user:pass@github.com/owner/repo')).toBe(false);
  });

  // Query/fragment rejections
  it('rejects URL with query string', () => {
    expect(isValidGithubUrl('https://github.com/owner/repo?tab=readme')).toBe(false);
  });

  it('rejects URL with hash fragment', () => {
    expect(isValidGithubUrl('https://github.com/owner/repo#readme')).toBe(false);
  });

  // Malformed
  it('rejects empty string', () => {
    expect(isValidGithubUrl('')).toBe(false);
  });

  it('rejects plain text', () => {
    expect(isValidGithubUrl('not-a-url')).toBe(false);
  });

  it('rejects owner starting with hyphen', () => {
    // GitHub doesn't allow it, and our regex requires starting with alnum
    expect(isValidGithubUrl('https://github.com/-owner/repo')).toBe(false);
  });

  it('rejects repo with path-traversal characters', () => {
    expect(isValidGithubUrl('https://github.com/owner/../../etc/passwd')).toBe(false);
  });
});
