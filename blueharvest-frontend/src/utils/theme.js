/**
 * BlueHarvest Theme Management Utility
 * Handles Light, Dark (OLED), and System Appearance preference tracking.
 */

export const THEME_STORAGE_KEY = 'blueharvest_theme_mode';

export function getResolvedSystemTheme() {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

export function applyTheme(themeChoice) {
  if (typeof document === 'undefined') return 'light';

  const root = document.documentElement;
  let effectiveTheme = 'light';

  if (themeChoice === 'Dark (OLED)' || themeChoice === 'dark') {
    effectiveTheme = 'dark';
  } else if (themeChoice === 'Light (Default)' || themeChoice === 'light') {
    effectiveTheme = 'light';
  } else {
    // 'System Appearance' or unset
    effectiveTheme = getResolvedSystemTheme();
  }

  root.setAttribute('data-theme', effectiveTheme);
  if (effectiveTheme === 'dark') {
    root.classList.add('dark-theme');
  } else {
    root.classList.remove('dark-theme');
  }

  return effectiveTheme;
}

export function setupSystemThemeListener(getThemeChoice, onThemeChanged) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  const handler = (e) => {
    const currentChoice = typeof getThemeChoice === 'function' ? getThemeChoice() : getThemeChoice;
    if (currentChoice === 'System Appearance') {
      const effectiveTheme = e.matches ? 'dark' : 'light';
      applyTheme('System Appearance');
      if (typeof onThemeChanged === 'function') {
        onThemeChanged(effectiveTheme);
      }
    }
  };

  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  } else if (mediaQuery.addListener) {
    mediaQuery.addListener(handler);
    return () => mediaQuery.removeListener(handler);
  }

  return () => {};
}
