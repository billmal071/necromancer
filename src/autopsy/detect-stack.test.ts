import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectStack } from './detect-stack.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const fixturesDir = join(__dirname, '../../test/fixtures');

describe('detectStack', () => {
  it('returns unsupported when package.json is absent', async () => {
    // Use a path that certainly has no package.json
    const result = await detectStack('/nonexistent-path-xyz');
    expect(result.hasPackageJson).toBe(false);
    expect(result.packageManager).toBe('unknown');
  });

  it('detects pnpm from pnpm-lock.yaml', async () => {
    const result = await detectStack(join(fixturesDir, 'pnpm-app'));
    expect(result.hasPackageJson).toBe(true);
    expect(result.packageManager).toBe('pnpm');
  });

  it('detects npm when only package.json is present', async () => {
    const result = await detectStack(join(fixturesDir, 'minimal-node-app'));
    expect(result.hasPackageJson).toBe(true);
    expect(result.packageManager).toBe('npm');
  });

  it('extracts build and test scripts', async () => {
    const result = await detectStack(join(fixturesDir, 'minimal-node-app'));
    expect(result.buildScript).toBe('echo build-ok');
    expect(result.testScript).toBeUndefined();
  });

  it('extracts build and test scripts from broken-node-app', async () => {
    const result = await detectStack(join(fixturesDir, 'broken-node-app'));
    expect(result.buildScript).toBe('tsc --noEmit');
    expect(result.testScript).toBe('node --test');
  });
});
