import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runTests } from './test-runner.ts';

vi.mock('execa');

describe('runTests', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns undefined when no test script is present', async () => {
    const result = await runTests('/sandbox', undefined);
    expect(result).toBeUndefined();
  });

  it('returns undefined when test script is empty string', async () => {
    const result = await runTests('/sandbox', '');
    expect(result).toBeUndefined();
  });

  it('returns a StepResult when test script is present', async () => {
    const { execa } = await import('execa');
    const mockExeca = vi.mocked(execa);

    mockExeca.mockResolvedValueOnce({
      exitCode: 0,
      stdout: 'All tests passed',
      stderr: '',
    } as never);

    const result = await runTests('/sandbox', 'vitest run');
    expect(result).toBeDefined();
    expect(result?.exitCode).toBe(0);
    expect(result?.stdout).toContain('All tests passed');
  });

  it('returns non-zero exitCode on test failure', async () => {
    const { execa } = await import('execa');
    const mockExeca = vi.mocked(execa);

    mockExeca.mockResolvedValueOnce({
      exitCode: 1,
      stdout: '1 test failed',
      stderr: '',
    } as never);

    const result = await runTests('/sandbox', 'jest');
    expect(result).toBeDefined();
    expect(result?.exitCode).not.toBe(0);
  });
});
