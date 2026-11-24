import { execa } from 'execa';

export interface CommitMeta {
  sha: string;
  date: string;
  repoAgeMonths: number;
}

/** Fetch last commit metadata and compute repo age. Never throws. */
export async function fetchCommitMeta(sandboxPath: string): Promise<CommitMeta> {
  const fallback: CommitMeta = { sha: 'unknown', date: 'unknown', repoAgeMonths: 0 };

  // Get last commit SHA and date
  try {
    const logResult = await execa(
      'git',
      ['log', '-1', '--format=%H%n%aI'],
      { cwd: sandboxPath, timeout: 15_000, reject: false },
    );

    if (logResult.exitCode !== 0 || !logResult.stdout) {
      return fallback;
    }

    const lines = logResult.stdout.trim().split('\n');
    const sha = lines[0]?.trim() ?? 'unknown';
    const date = lines[1]?.trim() ?? 'unknown';

    // Get first commit date to compute age
    let repoAgeMonths = 0;
    try {
      const firstCommitResult = await execa(
        'git',
        ['log', '--reverse', '--format=%aI', '--max-count=1'],
        { cwd: sandboxPath, timeout: 15_000, reject: false },
      );

      if (firstCommitResult.stdout) {
        const firstDate = new Date(firstCommitResult.stdout.trim());
        const now = new Date();
        const diffMs = now.getTime() - firstDate.getTime();
        repoAgeMonths = Math.round(diffMs / (1000 * 60 * 60 * 24 * 30));
      }
    } catch {
      // best-effort
    }

    return { sha, date, repoAgeMonths };
  } catch {
    return fallback;
  }
}
