import type { ComponentChildren, ComponentType, JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';

type Loader<P> = () => Promise<{ default: ComponentType<P> }>;

export interface LazyComponent<P> {
  (props: P): JSX.Element | null;
  preload: () => Promise<void>;
}

/** Code-split component without preact/compat. `fallback` renders while loading. */
export function lazy<P extends object>(
  loader: Loader<P>,
  fallback: () => ComponentChildren = () => null,
): LazyComponent<P> {
  let Comp: ComponentType<P> | null = null;
  let promise: Promise<void> | null = null;
  let failed = false;
  const preload = () =>
    (promise ??= loader().then(
      (m) => {
        Comp = m.default;
      },
      (e) => {
        console.error(e);
        failed = true;
        promise = null;
      },
    ));

  function Lazy(props: P): JSX.Element | null {
    const [, setLoaded] = useState(0);
    useEffect(() => {
      if (!Comp) void preload().then(() => setLoaded((n) => n + 1));
    }, []);
    if (Comp) {
      const C = Comp;
      return <C {...props} />;
    }
    if (failed) {
      return (
        <p class="empty" role="alert">
          Impossible de charger cet écran. Vérifie ta connexion puis réessaie.
        </p>
      );
    }
    return <>{fallback()}</>;
  }
  Lazy.preload = preload;
  return Lazy;
}

/** Runs `fn` when the browser is idle (Safari has no requestIdleCallback). */
export function whenIdle(fn: () => void, timeout = 1500): void {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(fn, { timeout });
  else setTimeout(fn, 600);
}
