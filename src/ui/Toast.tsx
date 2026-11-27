import { useEffect } from 'preact/hooks';
import { store, useStore } from '../app/store';
import { Icon } from './Icon';

export function ToastHost() {
  const toast = useStore((s) => s.toast);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(
      () => {
        if (store.get().toast?.id === toast.id) store.set({ toast: null });
      },
      toast.action ? 5000 : 3000,
    );
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <div class="toast-host" role="status" aria-live="polite">
      {toast && (
        <div class="toast" key={toast.id}>
          <span class="toast__icon" aria-hidden="true">
            <Icon name="check" size={20} stroke={2.4} />
          </span>
          <span class="toast__text">{toast.text}</span>
          {toast.action && (
            <button
              type="button"
              class="toast__action"
              onClick={() => {
                toast.action?.run();
                store.set({ toast: null });
              }}
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function UpdateBanner() {
  const apply = useStore((s) => s.applyUpdate);
  if (!apply) return null;
  return (
    <div class="update-banner" role="alert">
      <span>Nouvelle version disponible</span>
      <button type="button" class="btn btn--sm btn--primary" onClick={apply}>
        Recharger
      </button>
    </div>
  );
}
