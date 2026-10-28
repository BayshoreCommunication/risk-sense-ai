'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { applyTheme, persistTheme, resolveTheme, type ThemePreference } from '@/lib/theme';

type ThemeContextValue = {
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const THEME_TRANSITION_MS = 240;

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function currentSystemPrefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** NFR-08: a persisted, no-flash theme preference with motion-safe user switching. */
export function ThemeProvider({ initialTheme, children }: { initialTheme: ThemePreference; children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(initialTheme);
  const cleanupTimer = useRef<number | null>(null);

  const clearTransitionState = useCallback(() => {
    if (cleanupTimer.current !== null) {
      window.clearTimeout(cleanupTimer.current);
      cleanupTimer.current = null;
    }
    document.documentElement.classList.remove('theme-transitioning', 'theme-view-transition');
  }, []);

  useEffect(() => clearTransitionState, [clearTransitionState]);

  useEffect(() => {
    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const syncSystemTheme = () => applyTheme(resolveTheme('system', media.matches), 'system');
    syncSystemTheme();
    media.addEventListener('change', syncSystemTheme);
    return () => media.removeEventListener('change', syncSystemTheme);
  }, [theme]);

  const setTheme = useCallback(
    (nextTheme: ThemePreference) => {
      if (nextTheme === theme) return;

      const root = document.documentElement;
      const currentResolvedTheme = root.dataset.theme === 'dark' ? 'dark' : 'light';
      const nextResolvedTheme = resolveTheme(nextTheme, currentSystemPrefersDark());
      const commit = () => {
        applyTheme(nextResolvedTheme, nextTheme);
        persistTheme(nextTheme);
        setThemeState(nextTheme);
      };

      clearTransitionState();
      if (prefersReducedMotion() || currentResolvedTheme === nextResolvedTheme) {
        commit();
        return;
      }

      root.classList.add('theme-transitioning');
      commit();
      cleanupTimer.current = window.setTimeout(clearTransitionState, THEME_TRANSITION_MS);
    },
    [clearTransitionState, theme],
  );

  const value = useMemo(() => ({ theme, setTheme }), [setTheme, theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside ThemeProvider.');
  return context;
}
