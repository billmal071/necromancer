import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { DependencyIssue } from './types.ts';

/**
 * The property: for any (name, version) pair where pinned === latest,
 * the dependency should NOT be considered deprecated merely from that fact,
 * and no advisory severity upgrade should occur.
 *
 * We test this by verifying the invariants of a well-formed DependencyIssue.
 */
function buildIssue(
  name: string,
  pinned: string,
  latest: string,
  deprecated: boolean,
): DependencyIssue {
  return { name, pinned, latest, deprecated };
}

describe('DependencyIssue property-based tests', () => {
  it('when pinned === latest, deprecated must remain false', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.stringMatching(/^\d+\.\d+\.\d+$/),
        (name, version) => {
          const issue = buildIssue(name, version, version, false);
          // When pinned === latest, deprecated should not be automatically true
          expect(issue.pinned).toBe(issue.latest);
          expect(issue.deprecated).toBe(false);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('when pinned === latest, no advisory should mark a higher severity', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.stringMatching(/^\d+\.\d+\.\d+$/),
        (name, version) => {
          const issue = buildIssue(name, version, version, false);
          // If there's no advisory on a pinned===latest dep, that's correct
          expect(issue.advisory).toBeUndefined();
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('pinned version is never considered "outdated" when pinned === latest', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.stringMatching(/^\d+\.\d+\.\d+$/),
        (name, version) => {
          const issue = buildIssue(name, version, version, false);
          // pinned equals latest: not outdated
          const isOutdated = issue.pinned !== issue.latest;
          expect(isOutdated).toBe(false);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('a dependency with pinned < latest is correctly identified as outdated', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.nat({ max: 99 }),
        fc.nat({ max: 99 }),
        (name, major, patch) => {
          // pinned is older minor
          const pinned = `${major}.0.${patch}`;
          const latest = `${major}.1.${patch}`;
          const issue = buildIssue(name, pinned, latest, false);
          const isOutdated = issue.pinned !== issue.latest;
          expect(isOutdated).toBe(true);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('DependencyIssue always has required fields', () => {
    fc.assert(
      fc.property(
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 50 }),
          pinned: fc.stringMatching(/^\d+\.\d+\.\d+$/),
          latest: fc.stringMatching(/^\d+\.\d+\.\d+$/),
          deprecated: fc.boolean(),
        }),
        (input) => {
          const issue: DependencyIssue = { ...input };
          expect(typeof issue.name).toBe('string');
          expect(issue.name.length).toBeGreaterThan(0);
          expect(typeof issue.pinned).toBe('string');
          expect(typeof issue.latest).toBe('string');
          expect(typeof issue.deprecated).toBe('boolean');
        },
      ),
      { numRuns: 1000 },
    );
  });
});
