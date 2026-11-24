import { execa } from 'execa';
import type { DependencyIssue, Severity } from './types.js';

interface NpmOutdatedEntry {
  current?: string;
  wanted?: string;
  latest?: string;
  dependent?: string;
  location?: string;
}

interface NpmAuditAdvisory {
  id?: number | string;
  title?: string;
  severity?: string;
  url?: string;
}

interface NpmAuditVulnerability {
  name?: string;
  range?: string;
  severity?: string;
  via?: Array<string | NpmAuditAdvisory>;
  fixAvailable?: boolean;
}

interface NpmAuditResult {
  vulnerabilities?: Record<string, NpmAuditVulnerability>;
}

function toSeverity(raw: string | undefined): Severity {
  switch (raw?.toLowerCase()) {
    case 'critical': return 'critical';
    case 'high': return 'high';
    case 'moderate': return 'moderate';
    case 'low': return 'low';
    default: return 'none';
  }
}

/** Run npm outdated and npm audit to build DependencyIssue list. Never throws. */
export async function auditDependencies(
  sandboxPath: string,
): Promise<DependencyIssue[]> {
  const issues: Map<string, DependencyIssue> = new Map();

  // --- npm outdated --json ---
  try {
    const outdatedResult = await execa(
      'npm',
      ['outdated', '--json', '--long'],
      { cwd: sandboxPath, timeout: 60_000, reject: false },
    );

    if (outdatedResult.stdout) {
      const outdated = JSON.parse(outdatedResult.stdout) as Record<
        string,
        NpmOutdatedEntry
      >;

      for (const [name, entry] of Object.entries(outdated)) {
        const pinned = entry.current ?? entry.wanted ?? '0.0.0';
        const latest = entry.latest ?? pinned;
        // deprecated packages show up with wanted < latest sometimes
        const deprecated = entry.wanted != null && entry.latest != null
          && entry.wanted !== entry.latest
          && pinned === entry.wanted;

        issues.set(name, {
          name,
          pinned,
          latest,
          deprecated,
        });
      }
    }
  } catch {
    // best-effort: ignore errors
  }

  // --- npm audit --json ---
  try {
    const auditResult = await execa(
      'npm',
      ['audit', '--json'],
      { cwd: sandboxPath, timeout: 60_000, reject: false },
    );

    const raw = auditResult.stdout || auditResult.stderr || '{}';
    if (raw) {
      let audit: NpmAuditResult = {};
      try {
        audit = JSON.parse(raw) as NpmAuditResult;
      } catch {
        // malformed output: skip
      }

      const vulns = audit.vulnerabilities ?? {};
      for (const [name, vuln] of Object.entries(vulns)) {
        // Find the first real advisory (not a string ref)
        const advisoryEntry = vuln.via?.find(
          (v): v is NpmAuditAdvisory => typeof v === 'object',
        );

        const existing = issues.get(name);
        const base: DependencyIssue = existing ?? {
          name,
          pinned: vuln.range ?? 'unknown',
          latest: 'unknown',
          deprecated: false,
        };

        if (advisoryEntry) {
          base.advisory = {
            id: String(advisoryEntry.id ?? ''),
            severity: toSeverity(vuln.severity),
            title: advisoryEntry.title ?? 'Unknown advisory',
          };
        }
        issues.set(name, base);
      }
    }
  } catch {
    // best-effort: ignore errors
  }

  return Array.from(issues.values());
}
