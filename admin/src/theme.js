// App theme (section 61): the person's choice is kept on this device;
// "system" follows the device's light/dark setting, live. index.html applies
// the saved theme before first paint (same logic, inline) so there is no flash.
export const THEMES = ['system', 'light', 'dark', 'ocean', 'sunset'];
const KEY = 'leadratTheme';
const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export function getThemeChoice() {
  try {
    const saved = localStorage.getItem(KEY);
    return THEMES.includes(saved) ? saved : 'system';
  } catch {
    return 'system';
  }
}

const resolve = (choice) => (choice === 'system' ? (media?.matches ? 'dark' : 'light') : choice);

export function applyTheme(choice = getThemeChoice()) {
  document.documentElement.dataset.theme = resolve(choice);
}

export function setThemeChoice(choice) {
  if (!THEMES.includes(choice)) return;
  try { localStorage.setItem(KEY, choice); } catch { /* private mode: applies for this visit only */ }
  applyTheme(choice);
}

media?.addEventListener?.('change', () => {
  if (getThemeChoice() === 'system') applyTheme('system');
});
