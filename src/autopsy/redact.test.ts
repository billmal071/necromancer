import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { redactOutput } from './redact.ts';

describe('redactOutput', () => {
  it('leaves plain text unchanged', () => {
    const text = 'npm install finished successfully';
    expect(redactOutput(text)).toBe(text);
  });

  it('redacts macOS home directory paths', () => {
    const result = redactOutput('error in /Users/alice/projects/myapp/index.js');
    expect(result).not.toContain('/Users/alice');
    expect(result).toContain('~/projects/myapp/index.js');
  });

  it('redacts Linux home directory paths', () => {
    const result = redactOutput('loading /home/bob/.config/app/settings.json');
    expect(result).not.toContain('/home/bob');
    expect(result).toContain('~/.config/app/settings.json');
  });

  it('redacts GitHub PATs', () => {
    const result = redactOutput('Authorization: ghp_AbcDef1234567890XYZ');
    expect(result).not.toContain('ghp_AbcDef1234567890XYZ');
    expect(result).toContain('[REDACTED_TOKEN]');
  });

  it('redacts npm tokens', () => {
    const result = redactOutput('//registry.npmjs.org/:_authToken=npm_AbcDef1234567890');
    expect(result).not.toContain('npm_AbcDef1234567890');
    expect(result).toContain('[REDACTED_TOKEN]');
  });

  it('redacts Bearer tokens', () => {
    const result = redactOutput('Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9abcdef');
    expect(result).not.toMatch(/Bearer eyJ/);
    expect(result).toContain('Bearer [REDACTED_TOKEN]');
  });

  it('redacts email addresses', () => {
    const result = redactOutput('Contact admin@example.com for help');
    expect(result).not.toContain('admin@example.com');
    expect(result).toContain('[REDACTED_EMAIL]');
  });

  it('redacts multiple sensitive items in one string', () => {
    const result = redactOutput(
      'token ghp_Token12345678901234 from /Users/dave/project and email dave@test.com',
    );
    expect(result).not.toContain('ghp_Token12345678901234');
    expect(result).not.toContain('/Users/dave');
    expect(result).not.toContain('dave@test.com');
  });

  it('returns empty string unchanged', () => {
    expect(redactOutput('')).toBe('');
  });

  it('does not redact safe paths outside home directories', () => {
    const text = '/usr/local/bin/node --version';
    expect(redactOutput(text)).toBe(text);
  });

  it('does not alter version numbers that look like tokens', () => {
    // Short tokens (< 10 chars) are not matched
    const text = 'npm version 1.2.3';
    expect(redactOutput(text)).toBe(text);
  });

  it('home path with no trailing segments becomes ~', () => {
    const result = redactOutput('path: /Users/carol');
    expect(result).not.toContain('/Users/carol');
    expect(result).toContain('~');
  });
});

describe('redactOutput property-based tests', () => {
  it('is idempotent: applying twice gives the same result as applying once', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 500 }),
        (text) => {
          const once = redactOutput(text);
          const twice = redactOutput(once);
          expect(twice).toBe(once);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('never introduces [REDACTED_TOKEN] inside [REDACTED_TOKEN] (no double-wrapping)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 500 }),
        (text) => {
          const result = redactOutput(text);
          // After redaction, the placeholder itself should not be re-redacted
          expect(result).not.toContain('[REDACTED_TOKEN][REDACTED_TOKEN]');
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('never leaves a raw GitHub PAT in the output', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/ghp_[A-Za-z0-9]{10,}/),
        (token) => {
          const result = redactOutput(`token: ${token}`);
          expect(result).not.toContain(token);
        },
      ),
      { numRuns: 500 },
    );
  });
});
