'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { applyTheme, persistTheme, type Theme } from '@/lib/theme';

type TransitionOrigin = { x: number; y: number };
type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme, origin?: TransitionOrigin) => void;
};

type ViewTransition = { finished: Promise<void> };
type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => ViewTransition;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const FALLBACK_TRANSITION_MS = 450;

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function transitionRadius(origin: TransitionOrigin) {
  return Math.hypot(Math.max(origin.x, window.innerWidth - origin.x), Math.max(origin.y, window.innerHeight - origin.y));
}

/** NFR-08: a persisted, no-flash theme with motion-safe animated user switching. */
export function ThemeProvider({ initialTheme, children }: { initialTheme: Theme; children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);
  const cleanupTimer = useRef<number | null>(null);
  const transitionSequence = useRef(0);

  const clearTransitionState = useCallback(() => {
    if (cleanupTimer.current !== null) {
      window.clearTimeout(cleanupTimer.current);
      cleanupTimer.current = null;
    }
    document.documentElement.classList.remove('theme-transitioning', 'theme-view-transition');
  }, []);

  useEffect(() => clearTransitionState, [clearTransitionState]);

  const setTheme = useCallback(
    (nextTheme: Theme, origin?: TransitionOrigin) => {
      if (nextTheme === theme) return;

      const root = document.documentElement;
      const commit = () => {
        applyTheme(nextTheme);
        persistTheme(nextTheme);
        setThemeState(nextTheme);
      };

      clearTransitionState();
      const sequence = ++transitionSequence.current;
      if (prefersReducedMotion()) {
        commit();
        return;
      }

      const startViewTransition = (document as ViewTransitionDocument).startViewTransition;
      if (startViewTransition && origin) {
        root.style.setProperty('--theme-transition-x', `${origin.x}px`);
        root.style.setProperty('--theme-transition-y', `${origin.y}px`);
        root.style.setProperty('--theme-transition-radius', `${transitionRadius(origin)}px`);
        root.classList.add('theme-view-transition');
        const transition = startViewTransition.call(document, commit);
        void transition.finished.finally(() => {
          if (transitionSequence.current === sequence) root.classList.remove('theme-view-transition');
        });
        return;
      }

      root.classList.add('theme-transitioning');
      commit();
      cleanupTimer.current = window.setTimeout(clearTransitionState, FALLBACK_TRANSITION_MS);
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
