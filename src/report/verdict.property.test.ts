import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { deriveVerdict } from './render.ts';
import type { RiteResult } from '../rite/types.ts';

// Arbitrary for AutopsyReport status
const autopsyStatusArb = fc.constantFrom(
  'green', 'install-failed', 'build-failed', 'test-failed', 'unsupported',
) as fc.Arbitrary<RiteResult['finalBuildStatus']>;

// Arbitrary for RiteResult status
const riteStatusArb = fc.constantFrom(
  'green', 'budget-exhausted', 'nothing-to-do', 'unsupported', 'error',
) as fc.Arbitrary<RiteResult['status']>;

// Minimal StepOutcome-like object for the property test
const stepOutcomeArb = fc.record({
  build: fc.record({
    exitCode: fc.integer({ min: 0, max: 1 }),
    command: fc.constant('npm run build'),
    stdout: fc.constant(''),
    stderr: fc.constant(''),
    durationMs: fc.nat(),
  }),
  install: fc.record({
    exitCode: fc.integer({ min: 0, max: 1 }),
    command: fc.constant('npm install'),
    stdout: fc.constant(''),
    stderr: fc.constant(''),
    durationMs: fc.nat(),
  }),
  step: fc.record({
    package: fc.string({ minLength: 1, maxLength: 20 }),
    fromVersion: fc.constant('1.0.0'),
    toVersion: fc.constant('2.0.0'),
    reason: fc.constantFrom('outdated', 'advisory', 'deprecated') as fc.Arbitrary<'outdated' | 'advisory' | 'deprecated'>,
  }),
  durationMs: fc.nat(),
  timedOut: fc.boolean(),
});

function makeRite(
  status: RiteResult['status'],
  finalBuildStatus: RiteResult['finalBuildStatus'],
  stepsExecuted: RiteResult['stepsExecuted'] = [],
): RiteResult {
  return {
    sandboxPath: '/tmp/test',
    stepsPlanned: [],
    stepsExecuted,
    status,
    finalBuildStatus,
    durationMs: 0,
  };
}

describe('deriveVerdict — property-based', () => {
  it('verdict is "resurrected" if and only if status=green AND finalBuildStatus=green', () => {
    fc.assert(
      fc.property(riteStatusArb, autopsyStatusArb, (status, finalBuildStatus) => {
        const rite = makeRite(status, finalBuildStatus);
        const verdict = deriveVerdict(rite);
        const shouldBeResurrected = status === 'green' && finalBuildStatus === 'green';
        if (shouldBeResurrected) {
          expect(verdict).toBe('resurrected');
        } else {
          expect(verdict).not.toBe('resurrected');
        }
      }),
      { numRuns: 500 },
    );
  });

  it('verdict is never "resurrected" when finalBuildStatus is not green', () => {
    fc.assert(
      fc.property(
        riteStatusArb,
        fc.constantFrom('install-failed', 'build-failed', 'test-failed', 'unsupported') as fc.Arbitrary<RiteResult['finalBuildStatus']>,
        (status, finalBuildStatus) => {
          const rite = makeRite(status, finalBuildStatus);
          expect(deriveVerdict(rite)).not.toBe('resurrected');
        },
      ),
      { numRuns: 300 },
    );
  });

  it('verdict is never "resurrected" when status is not green', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('budget-exhausted', 'nothing-to-do', 'unsupported', 'error') as fc.Arbitrary<RiteResult['status']>,
        autopsyStatusArb,
        (status, finalBuildStatus) => {
          const rite = makeRite(status, finalBuildStatus);
          expect(deriveVerdict(rite)).not.toBe('resurrected');
        },
      ),
      { numRuns: 300 },
    );
  });

  it('verdict is always one of the three valid values', () => {
    const validVerdicts = new Set(['resurrected', 'partial', 'still-dead']);
    fc.assert(
      fc.property(
        riteStatusArb,
        autopsyStatusArb,
        fc.array(stepOutcomeArb, { maxLength: 5 }),
        (status, finalBuildStatus, stepsExecuted) => {
          const rite = makeRite(status, finalBuildStatus, stepsExecuted as RiteResult['stepsExecuted']);
          const verdict = deriveVerdict(rite);
          expect(validVerdicts.has(verdict)).toBe(true);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('partial requires at least one executed step with build.exitCode === 0', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('budget-exhausted', 'nothing-to-do', 'error') as fc.Arbitrary<RiteResult['status']>,
        autopsyStatusArb,
        fc.array(stepOutcomeArb, { maxLength: 5 }),
        (status, finalBuildStatus, stepsExecuted) => {
          const rite = makeRite(status, finalBuildStatus, stepsExecuted as RiteResult['stepsExecuted']);
          const verdict = deriveVerdict(rite);
          if (verdict === 'partial') {
            const hasGreenStep = (stepsExecuted as RiteResult['stepsExecuted']).some(
              (s) => s.build.exitCode === 0,
            );
            expect(hasGreenStep).toBe(true);
          }
        },
      ),
      { numRuns: 500 },
    );
  });
});
