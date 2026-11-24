import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runBuild } from './build.ts';

vi.mock('execa');

describe('runBuild', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('runs npm run build when a build script exists', async () => {
    const { execa } = await import('execa');
    const mockExeca = vi.mocked(execa);

    mockExeca.mockResolvedValueOnce({
      exitCode: 0,
      stdout: 'build complete',
      stderr: '',
    } as never);

    const result = await runBuild('/sandbox', 'tsc');
    expect(result.command).toBe('npm run build');
    expect(mockExeca).toHaveBeenCalledWith(
      'npm',
      ['run', 'build'],
      expect.any(Object),
    );
  });

  it('falls back to tsc --noEmit when no build script', async () => {
    const { execa } = await import('execa');
    const mockExeca = vi.mocked(execa);

    mockExeca.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: '',
    } as never);

    const result = await runBuild('/sandbox', undefined);
    expect(result.command).toBe('tsc --noEmit');
    expect(mockExeca).toHaveBeenCalledWith(
      'tsc',
      ['--noEmit'],
      expect.any(Object),
    );
  });

  it('falls back to tsc --noEmit when build script is empty string', async () => {
    const { execa } = await import('execa');
    const mockExeca = vi.mocked(execa);

    mockExeca.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: '',
    } as never);

    const result = await runBuild('/sandbox', '');
    expect(result.command).toBe('tsc --noEmit');
  });
});
