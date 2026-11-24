/** Verdict classification for the resurrection report. */
export type Verdict = 'resurrected' | 'partial' | 'still-dead';

/** Summary returned by writeReport. */
export interface ReportResult {
  /** Absolute path to report.md */
  reportPath: string;
  /** Absolute path to patch.diff */
  patchPath: string;
  /** Absolute path to pr-body.md */
  prBodyPath: string;
  /** Overall verdict derived from the rite result. */
  verdict: Verdict;
  /** Number of lines in the git diff (0 if empty or failed). */
  patchLines: number;
}
