export type Theme = 'auto' | 'light' | 'dark';

const KEY = 'myfit-theme';
export const THEME_COLORS = { light: '#f2f2f7', dark: '#000000' } as const;

export function getTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'light' || t === 'dark' ? t : 'auto';
  } catch {
    return 'auto';
  }
}

export function setTheme(t: Theme): void {
  try {
    if (t === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, t);
  } catch {
    /* storage blocked: theme still applies for this session */
  }
  applyTheme(t);
}

/** Applies the theme to <html> and keeps the status bar colour in sync. */
export function applyTheme(t: Theme): void {
  const root = document.documentElement;
  if (t === 'auto') delete root.dataset.theme;
  else root.dataset.theme = t;
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    const scheme = m.media.includes('dark') ? 'dark' : 'light';
    m.content = THEME_COLORS[t === 'auto' ? scheme : t];
  });
}
