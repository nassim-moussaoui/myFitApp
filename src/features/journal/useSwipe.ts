import type { RefObject } from 'preact';
import { useEffect } from 'preact/hooks';

/**
 * Horizontal swipe on an element. Follows the finger with a transform only
 * (no layout work), and lets vertical scrolling and pinch-zoom through.
 */
export function useSwipe(ref: RefObject<HTMLElement | null>, onSwipe: (dir: 'left' | 'right') => void): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let x0 = 0;
    let y0 = 0;
    let dx = 0;
    let mode: 'idle' | 'h' | 'v' = 'idle';
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0]!;
      x0 = t.clientX;
      y0 = t.clientY;
      dx = 0;
      mode = 'idle';
    };
    const move = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0]!;
      const mx = t.clientX - x0;
      const my = t.clientY - y0;
      if (mode === 'idle' && Math.abs(mx) + Math.abs(my) > 12) {
        mode = Math.abs(mx) > Math.abs(my) * 1.4 ? 'h' : 'v';
      }
      if (mode === 'h') {
        dx = mx;
        if (!reduce) el.style.transform = `translate3d(${dx * 0.35}px,0,0)`;
      }
    };
    const end = () => {
      if (mode === 'h') {
        el.style.transform = '';
        if (Math.abs(dx) > 70) onSwipe(dx < 0 ? 'left' : 'right');
      }
      mode = 'idle';
    };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: true });
    el.addEventListener('touchend', end, { passive: true });
    el.addEventListener('touchcancel', end, { passive: true });
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
    };
  }, [ref, onSwipe]);
}
