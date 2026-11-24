import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import type { PackageManager } from './types.js';

export interface StackInfo {
  hasPackageJson: boolean;
  packageManager: PackageManager;
  nodeEngineField?: string;
  buildScript?: string;
  testScript?: string;
  packageJson?: Record<string, unknown>;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Detect the Node.js stack from a sandbox directory. */
export async function detectStack(sandboxPath: string): Promise<StackInfo> {
  const pkgPath = join(sandboxPath, 'package.json');
  if (!(await fileExists(pkgPath))) {
    return { hasPackageJson: false, packageManager: 'unknown' };
  }

  let pkgJson: Record<string, unknown> = {};
  try {
    const raw = await readFile(pkgPath, 'utf-8');
    pkgJson = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { hasPackageJson: true, packageManager: 'unknown' };
  }

  // Detect package manager from lock files (priority order)
  let packageManager: PackageManager = 'npm';
  if (await fileExists(join(sandboxPath, 'pnpm-lock.yaml'))) {
    packageManager = 'pnpm';
  } else if (await fileExists(join(sandboxPath, 'yarn.lock'))) {
    packageManager = 'yarn';
  } else if (await fileExists(join(sandboxPath, 'package-lock.json'))) {
    packageManager = 'npm';
  }

  const engines = pkgJson['engines'] as Record<string, string> | undefined;
  const nodeEngineField = engines?.['node'];

  const scripts = pkgJson['scripts'] as Record<string, string> | undefined;
  const buildScript = scripts?.['build'];
  const testScript = scripts?.['test'];

  return {
    hasPackageJson: true,
    packageManager,
    nodeEngineField,
    buildScript,
    testScript,
    packageJson: pkgJson,
  };
}
