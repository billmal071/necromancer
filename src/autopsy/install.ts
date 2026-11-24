import { execa } from 'execa';
import type { PackageManager, StepResult } from './types.js';

function pmInstallCommand(pm: PackageManager): [string, string[]] {
  switch (pm) {
    case 'pnpm':
      return ['pnpm', ['install', '--frozen-lockfile']];
    case 'yarn':
      return ['yarn', ['install', '--frozen-lockfile']];
    case 'npm':
    default:
      return ['npm', ['install', '--legacy-peer-deps']];
  }
}

/** Run the package manager install step. Never throws. */
export async function runInstall(
  sandboxPath: string,
  pm: PackageManager,
): Promise<StepResult> {
  const [cmd, args] = pmInstallCommand(pm);
  const command = `${cmd} ${args.join(' ')}`;
  const start = Date.now();

  try {
    const result = await execa(cmd, args, {
      cwd: sandboxPath,
      timeout: 90_000,
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
