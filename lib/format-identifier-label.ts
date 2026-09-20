const IDENTIFIER_ACRONYMS = new Set([
  'ai',
  'aml',
  'api',
  'hr',
  'id',
  'it',
  'kyc',
  'mcq',
  'mfa',
  'pdf',
  'pii',
  'sso',
  'tac',
  'usd',
  'xlsx',
]);

const IDENTIFIER_EXPANSIONS: Record<string, string> = {
  fin: 'Financial',
  hc: 'Healthcare',
};

/** Convert a persisted identifier into a readable label without changing the stored value. */
export function formatIdentifierLabel(value: string) {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => {
      const normalized = word.toLowerCase();
      if (IDENTIFIER_EXPANSIONS[normalized]) return IDENTIFIER_EXPANSIONS[normalized];
      if (IDENTIFIER_ACRONYMS.has(normalized)) return normalized.toUpperCase();
      return normalized.charAt(0).toUpperCase() + normalized.slice(1);
    })
    .join(' ');
}

/** Expand machine-like identifiers embedded in otherwise human-readable audit/result copy. */
export function formatIdentifierTokensInText(value: string) {
  return value.replace(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/gi, (token) => formatIdentifierLabel(token));
}

/** Format a stored evidence value for display without mutating its persisted representation. */
export function formatDisplayValue(value: unknown, yesLabel = 'Yes', noLabel = 'No') {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? yesLabel : noLabel;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Normalize the system-authored scenario line found in seeded or reconstructed transcripts. */
export function formatSystemDisplayText(value: string) {
  const scenario = /^(Scenario:\s*)(.+)$/i.exec(value.trim());
  const scenarioValue = scenario?.[2]?.trim();
  if (scenario?.[1] && scenarioValue && (/^(?:fin|hc|it)(?:[\s_-]|$)/i.test(scenarioValue) || scenarioValue.includes('_'))) {
    return `${scenario[1]}${formatIdentifierLabel(scenarioValue)}`;
  }
  return value;
}
