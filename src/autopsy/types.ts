export type Severity = 'critical' | 'high' | 'moderate' | 'low' | 'none';

export interface DependencyIssue {
  name: string;
  pinned: string;
  latest: string;
  deprecated: boolean;
  advisory?: { id: string; severity: Severity; title: string };
}

export interface StepResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'unknown';

export interface AutopsyReport {
  repoUrl: string;
  clonedAt: string; // ISO-8601
  nodeVersion: string;
  packageManager: PackageManager;
  install: StepResult;
  build: StepResult;
  test?: StepResult;
  dependencyIssues: DependencyIssue[];
  lastCommit: { sha: string; date: string };
  repoAgeMonths: number;
  status: 'green' | 'install-failed' | 'build-failed' | 'test-failed' | 'unsupported';
  sandboxPath: string;
}
