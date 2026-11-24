import { execa } from 'execa';
import type { StepResult } from './types.js';

/** Run the build step. Falls back to `tsc --noEmit` if no build script. Never throws. */
export async function runBuild(
  sandboxPath: string,
  buildScript?: string,
): Promise<StepResult> {
  const start = Date.now();

  // If a build script exists, run it via npm run
  if (buildScript != null && buildScript.length > 0) {
    const command = 'npm run build';
    try {
      const result = await execa('npm', ['run', 'build'], {
        cwd: sandboxPath,
        timeout: 120_000,
        all: true,
        reject: false,
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

  // Fallback: tsc --noEmit
  const command = 'tsc --noEmit';
  try {
    const result = await execa('tsc', ['--noEmit'], {
      cwd: sandboxPath,
      timeout: 120_000,
      all: true,
      reject: false,
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
