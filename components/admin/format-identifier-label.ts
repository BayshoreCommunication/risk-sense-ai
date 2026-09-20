const IDENTIFIER_ACRONYMS = new Set(['ai', 'api', 'hr', 'id', 'it', 'mfa', 'pdf', 'pii', 'sso', 'tac', 'usd', 'xlsx']);

/** Keep machine identifiers available to APIs while presenting readable labels in Administrator views. */
export function formatIdentifierLabel(value: string) {
  return value
    .trim()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase();
      return IDENTIFIER_ACRONYMS.has(lower) ? lower.toUpperCase() : `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
    })
    .join(' ');
}
