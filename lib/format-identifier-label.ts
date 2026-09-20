const IDENTIFIER_ACRONYMS = new Set([
  'ai',
  'aml',
  'api',
  'hr',
  'id',
  'it',
  'kyc',
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
};

/** Convert a persisted identifier into a readable label without changing the stored value. */
export function formatIdentifierLabel(value: string) {
  return value
    .trim()
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

/** Normalize the system-authored scenario line found in seeded or reconstructed transcripts. */
export function formatSystemDisplayText(value: string) {
  const scenario = /^(Scenario:\s*)(.+)$/i.exec(value.trim());
  const scenarioValue = scenario?.[2]?.trim();
  if (scenario?.[1] && scenarioValue && (/^fin(?:[\s_-]|$)/i.test(scenarioValue) || scenarioValue.includes('_'))) {
    return `${scenario[1]}${formatIdentifierLabel(scenarioValue)}`;
  }
  return value;
}
