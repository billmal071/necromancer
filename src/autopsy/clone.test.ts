import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isValidGithubUrl, cloneRepo } from './clone.ts';

// Mock execa module
vi.mock('execa');

describe('isValidGithubUrl', () => {
  it('accepts a valid github.com https URL', () => {
    expect(isValidGithubUrl('https://github.com/owner/repo')).toBe(true);
  });

  it('accepts a URL with trailing .git', () => {
    expect(isValidGithubUrl('https://github.com/owner/repo.git')).toBe(true);
  });

  it('rejects http (non-https)', () => {
    expect(isValidGithubUrl('http://github.com/owner/repo')).toBe(false);
  });

  it('rejects non-github domains', () => {
    expect(isValidGithubUrl('https://gitlab.com/owner/repo')).toBe(false);
  });

  it('rejects bare github.com with no path', () => {
    expect(isValidGithubUrl('https://github.com/')).toBe(false);
    expect(isValidGithubUrl('https://github.com')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidGithubUrl('')).toBe(false);
  });

  it('rejects random strings', () => {
    expect(isValidGithubUrl('not-a-url')).toBe(false);
  });
});

describe('cloneRepo', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns an error result for an invalid URL without calling git', async () => {
    // We import execa after the mock, so we can intercept calls
    const { execa } = await import('execa');
    const mockExeca = vi.mocked(execa);

    const result = await cloneRepo('https://gitlab.com/owner/repo');

    expect(result.error).toMatch(/Invalid URL/);
    expect(result.sandboxPath).toBe('');
    expect(mockExeca).not.toHaveBeenCalled();
  });

  it('returns an error result for http URL without calling git', async () => {
    const { execa } = await import('execa');
    const mockExeca = vi.mocked(execa);

    const result = await cloneRepo('http://github.com/owner/repo');

    expect(result.error).toMatch(/Invalid URL/);
    expect(mockExeca).not.toHaveBeenCalled();
  });
});
