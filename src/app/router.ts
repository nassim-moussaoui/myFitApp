import { useEffect, useState } from 'preact/hooks';

export type Tab = 'journal' | 'poids' | 'stats' | 'reglages';
const TABS: Tab[] = ['journal', 'poids', 'stats', 'reglages'];

export function tabFromHash(hash: string): Tab {
  const t = hash.replace(/^#\/?/, '') as Tab;
  return TABS.includes(t) ? t : 'journal';
}

export const hrefFor = (t: Tab) => `#/${t}`;

export function useTab(): Tab {
  const [tab, setTab] = useState<Tab>(() => tabFromHash(location.hash));
  useEffect(() => {
    const on = () => {
      setTab(tabFromHash(location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return tab;
}
