import type { ComponentChildren } from 'preact';
import { useEffect, useId, useRef } from 'preact/hooks';
import { Icon } from './Icon';

interface Props {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  /** Full-screen panel instead of a bottom sheet. */
  full?: boolean;
  /** Hide the visual title (still announced). */
  hideTitle?: boolean;
  class?: string;
  headerExtra?: ComponentChildren;
}

/**
 * Modal built on <dialog>: focus trap, inert background, Escape to close.
 * Mount it to open, unmount it to close.
 */
export function Sheet({ title, onClose, children, full, hideTitle, class: cls = '', headerExtra }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const opener = document.activeElement as HTMLElement | null;
    if (!d.open) d.showModal();
    const onCancel = (e: Event) => {
      e.preventDefault();
      closeRef.current();
    };
    d.addEventListener('cancel', onCancel);
    return () => {
      d.removeEventListener('cancel', onCancel);
      if (d.open) d.close();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog
      ref={ref}
      class={`sheet ${full ? 'sheet--full' : ''} ${cls}`}
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === ref.current) closeRef.current();
      }}
    >
      <div class="sheet__panel">
        <header class={`sheet__header ${hideTitle ? 'sheet__header--bare' : ''}`}>
          <h2 id={titleId} class={hideTitle ? 'sr-only' : 'sheet__title'}>
            {title}
          </h2>
          {headerExtra}
          <button type="button" class="icon-btn" onClick={() => closeRef.current()} aria-label="Fermer">
            <Icon name="close" />
          </button>
        </header>
        <div class="sheet__body">{children}</div>
      </div>
    </dialog>
  );
}
