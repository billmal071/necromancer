/**
 * redact.ts – sanitise stdout/stderr before storing in a report.
 *
 * Patterns redacted:
 *  - Home directory paths: /Users/<name>/... or /home/<name>/...  → ~/<rest>
 *  - GitHub PATs:  ghp_<alphanum>+
 *  - npm tokens:   npm_<alphanum>+
 *  - Bearer tokens: Bearer <token>
 *  - Email addresses (simple RFC-5321 approximation)
 */

/** Replace all occurrences of a regex in text with a fixed string. */
function replaceAll(text: string, pattern: RegExp, replacement: string): string {
  return text.replace(pattern, replacement);
}

// Patterns compiled once at module load
const HOME_PATH_RE = /\/(Users|home)\/([^/\s]+)(\/[^\s]*)?/g;
const GITHUB_PAT_RE = /ghp_[A-Za-z0-9]{10,}/g;
const NPM_TOKEN_RE  = /npm_[A-Za-z0-9]{10,}/g;
const BEARER_RE     = /Bearer\s+[A-Za-z0-9._\-]{10,}/g;
// Simple email pattern: local@domain.tld (no spaces)
const EMAIL_RE      = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

/**
 * Redact sensitive patterns from a string.
 *
 * The function is idempotent: `redactOutput(redactOutput(s)) === redactOutput(s)`.
 */
export function redactOutput(text: string): string {
  if (!text) return text;

  let result = text;

  // Home directory paths: /Users/alice/projects/foo → ~/projects/foo
  result = result.replace(HOME_PATH_RE, (_match, _kind, _name, rest) => {
    return rest ? `~${rest}` : '~';
  });

  result = replaceAll(result, GITHUB_PAT_RE, '[REDACTED_TOKEN]');
  result = replaceAll(result, NPM_TOKEN_RE,  '[REDACTED_TOKEN]');
  result = replaceAll(result, BEARER_RE,     'Bearer [REDACTED_TOKEN]');
  result = replaceAll(result, EMAIL_RE,      '[REDACTED_EMAIL]');

  return result;
}
