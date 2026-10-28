export const THEME_COOKIE = 'rs_theme';

export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_PREFERENCES = ['system', ...THEMES] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value);
}

export function normalizeThemePreference(value: unknown): ThemePreference {
  return isThemePreference(value) ? value : 'system';
}

export function resolveTheme(preference: ThemePreference, prefersDark = false): Theme {
  return preference === 'system' ? (prefersDark ? 'dark' : 'light') : preference;
}

/** Apply the resolved palette immediately; the server reads the preference cookie next request. */
export function applyTheme(theme: Theme, preference?: ThemePreference) {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.dataset.theme = theme;
  if (preference) root.dataset.themePreference = preference;
  root.style.colorScheme = theme;
}

export function persistTheme(theme: ThemePreference) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${THEME_COOKIE}=${theme}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax${secure}`;
}
