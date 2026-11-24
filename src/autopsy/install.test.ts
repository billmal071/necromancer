import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runInstall } from './install.ts';

vi.mock('execa');

describe('runInstall', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns non-zero exitCode when install fails', async () => {
    const { execa } = await import('execa');
    const mockExeca = vi.mocked(execa);

    // Simulate a failed install
    mockExeca.mockResolvedValueOnce({
      exitCode: 1,
      stdout: '',
      stderr: 'npm ERR! peer dep conflict',
      command: 'npm install',
      all: 'npm ERR! peer dep conflict',
    } as never);

    const result = await runInstall('/some/sandbox', 'npm');
    expect(result.exitCode).not.toBe(0);
  });

  it('returns exitCode 0 on success', async () => {
    const { execa } = await import('execa');
    const mockExeca = vi.mocked(execa);

    mockExeca.mockResolvedValueOnce({
      exitCode: 0,
      stdout: 'added 100 packages',
      stderr: '',
      command: 'npm install',
      all: 'added 100 packages',
    } as never);

    const result = await runInstall('/some/sandbox', 'npm');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('100 packages');
  });

  it('uses pnpm command for pnpm package manager', async () => {
    const { execa } = await import('execa');
    const mockExeca = vi.mocked(execa);

    mockExeca.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: '',
    } as never);

    await runInstall('/some/sandbox', 'pnpm');
    expect(mockExeca).toHaveBeenCalledWith(
      'pnpm',
      expect.arrayContaining(['install']),
      expect.any(Object),
    );
  });

  it('records durationMs', async () => {
    const { execa } = await import('execa');
    const mockExeca = vi.mocked(execa);

    mockExeca.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: '',
    } as never);

    const result = await runInstall('/some/sandbox', 'npm');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
