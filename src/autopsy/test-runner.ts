import { execa } from 'execa';
import type { StepResult } from './types.js';

/** Run the test step. Returns undefined if no test script. Never throws. */
export async function runTests(
  sandboxPath: string,
  testScript?: string,
): Promise<StepResult | undefined> {
  // Skip gracefully if no test script
  if (testScript == null || testScript.length === 0) {
    return undefined;
  }

  const command = 'npm run test';
  const start = Date.now();

  try {
    const result = await execa('npm', ['run', 'test', '--', '--ci'], {
      cwd: sandboxPath,
      timeout: 120_000,
      all: true,
      reject: false,
      env: {
        ...process.env,
        CI: 'true',
      },
    });
    return {
      command,
      exitCode: result.exitCode ?? 0,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      command,
      exitCode: 1,
      stdout: '',
      stderr: String(err),
      durationMs: Date.now() - start,
    };
  }
}
