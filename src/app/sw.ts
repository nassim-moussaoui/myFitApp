import { store } from './store';

/**
 * Registers the Workbox service worker. A new version waits until the user
 * taps "Recharger" in the banner, then takes over and the page reloads.
 */
export function registerSW(): void {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  const base = import.meta.env.BASE_URL;
  let userAccepted = false;

  const offer = (worker: ServiceWorker) => {
    store.set({
      applyUpdate: () => {
        userAccepted = true;
        worker.postMessage({ type: 'SKIP_WAITING' });
      },
    });
  };

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (userAccepted) window.location.reload();
  });

  const register = () =>
    navigator.serviceWorker
      .register(`${base}sw.js`, { scope: base })
      .then((reg) => {
        if (!reg) return;
        if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          w?.addEventListener('statechange', () => {
            if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w);
          });
        });
        // Check for a new version each time the app comes back to the foreground.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => {});
        });
      })
      .catch((e) => console.warn('SW registration failed', e));

  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
