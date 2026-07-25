// Night mode: the light/dark/system preference, its persistence, and applying
// it to the document. Imports nothing; app.js is the only consumer.
//
// The `dark:` Tailwind variant is class-based (see src/input.css), so the
// resolved theme is expressed as a `dark` class on <html>. index.html applies
// the same class from an inline script before first paint; that snippet and the
// key below must stay in sync.

const THEME_KEY = 'flashcard.theme.v1';

/** Selectable preferences. "system" follows the OS setting as it changes. */
export const THEMES = ['light', 'dark', 'system'];

// Matches the page background in each theme, so the mobile browser chrome
// blends with the app instead of framing it in the wrong colour.
const THEME_COLORS = { light: '#f8fafc', dark: '#0b1120' };

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

/** Subscribers notified after the applied theme may have changed. */
const listeners = new Set();

let preference = readPreference();

/**
 * Notified on every apply, including OS changes while the preference is
 * "system" — which is the case app.js cannot detect on its own.
 */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function readPreference() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return THEMES.includes(saved) ? saved : 'system';
  } catch {
    // Safari private mode throws on access; falling back to the OS is fine.
    return 'system';
  }
}

/** The stored preference: 'light', 'dark', or 'system'. */
export function getTheme() {
  return preference;
}

/** What the preference currently resolves to: 'light' or 'dark'. */
export function resolvedTheme() {
  if (preference === 'system') return darkQuery.matches ? 'dark' : 'light';
  return preference;
}

function apply() {
  const dark = resolvedTheme() === 'dark';
  document.documentElement.classList.toggle('dark', dark);

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? THEME_COLORS.dark : THEME_COLORS.light;

  for (const fn of listeners) fn();
}

export function setTheme(next) {
  preference = THEMES.includes(next) ? next : 'system';
  try {
    localStorage.setItem(THEME_KEY, preference);
  } catch {
    /* preference is non-essential */
  }
  apply();
}

export function initTheme() {
  apply();
  // Only matters while the preference is "system", but keeping the listener
  // attached means switching back to it is immediately live.
  darkQuery.addEventListener('change', apply);
}
