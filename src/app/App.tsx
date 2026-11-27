import { useEffect } from 'preact/hooks';
import { JournalScreen } from '../features/journal/JournalScreen';
import { Onboarding } from '../features/settings/Onboarding';
import { mealForHour } from '../lib/nutrition/types';
import { Icon, type IconName } from '../ui/Icon';
import { ToastHost, UpdateBanner } from '../ui/Toast';
import { lazy, whenIdle } from './lazy';
import { hrefFor, useTab, type Tab } from './router';
import { store, useStore } from './store';

const screenFallback = () => (
  <main class="page" id="main" aria-busy="true">
    <div class="skeleton skeleton--block" />
  </main>
);

const WeightScreen = lazy(() => import('../features/weight/WeightScreen'), screenFallback);
const StatsScreen = lazy(() => import('../features/stats/StatsScreen'), screenFallback);
const SettingsScreen = lazy(() => import('../features/settings/SettingsScreen'), screenFallback);
const AddFood = lazy(() => import('../features/foods/AddFood'));
const EntrySheet = lazy(() => import('../features/foods/EntrySheet'));
const SaveMealSheet = lazy(() => import('../features/foods/MealSheets'));

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'journal', label: 'Journal', icon: 'journal' },
  { id: 'poids', label: 'Poids', icon: 'weight' },
  { id: 'stats', label: 'Stats', icon: 'stats' },
  { id: 'reglages', label: 'Réglages', icon: 'settings' },
];

function TabLink({ t, active }: { t: (typeof TABS)[number]; active: boolean }) {
  return (
    <a href={hrefFor(t.id)} class="tabbar__item" aria-current={active ? 'page' : undefined}>
      <Icon name={t.icon} size={25} stroke={active ? 2.2 : 1.8} />
      <span>{t.label}</span>
    </a>
  );
}

export function App() {
  const ready = useStore((s) => s.ready);
  const profile = useStore((s) => s.profile);
  const overlay = useStore((s) => s.overlay);
  const tab = useTab();

  // Prefetch the other screens once the first one is on screen, so tab switches are instant.
  useEffect(() => {
    if (!profile) return;
    whenIdle(() => {
      void AddFood.preload();
      void EntrySheet.preload();
      void WeightScreen.preload();
      void StatsScreen.preload();
      void SettingsScreen.preload();
      // Weekly adjustment of the targets from real data, when enabled.
      if (store.get().profile?.adaptive) void import('./adaptive').then((m) => m.refreshAdaptive());
    });
  }, [!!profile]);

  if (!ready) return <div class="boot" aria-hidden="true" />;
  if (!profile) {
    return (
      <div class="app">
        <Onboarding />
        <ToastHost />
      </div>
    );
  }

  const close = () => store.set({ overlay: null });
  const openAdd = () =>
    store.set({ overlay: { kind: 'add', meal: mealForHour(new Date().getHours()), date: store.get().date } });

  return (
    <div class="app">
      <a class="skip-link" href="#main">
        Aller au contenu
      </a>
      <UpdateBanner />
      {tab === 'journal' && <JournalScreen profile={profile} />}
      {tab === 'poids' && <WeightScreen profile={profile} />}
      {tab === 'stats' && <StatsScreen profile={profile} />}
      {tab === 'reglages' && <SettingsScreen profile={profile} />}

      <nav class="tabbar" aria-label="Navigation principale">
        <TabLink t={TABS[0]!} active={tab === 'journal'} />
        <TabLink t={TABS[1]!} active={tab === 'poids'} />
        <button type="button" class="tabbar__add" aria-label="Ajouter un aliment" onClick={openAdd}>
          <Icon name="plus" size={28} stroke={2.6} />
        </button>
        <TabLink t={TABS[2]!} active={tab === 'stats'} />
        <TabLink t={TABS[3]!} active={tab === 'reglages'} />
      </nav>

      {overlay?.kind === 'add' && <AddFood meal={overlay.meal} date={overlay.date} onClose={close} />}
      {overlay?.kind === 'entry' && <EntrySheet entry={overlay.entry} onClose={close} />}
      {overlay?.kind === 'save-meal' && <SaveMealSheet meal={overlay.meal} date={overlay.date} onClose={close} />}
      <ToastHost />
    </div>
  );
}
