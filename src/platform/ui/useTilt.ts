import { useCallback, useRef } from 'react';

const MAX_TILT = 8;

/**
 * Balatro-style pointer tilt. Writes CSS variables straight onto the element so moving the
 * pointer never re-renders React: --rx/--ry (degrees) and --mx/--my (sheen position, 0–100%).
 */
export function useTilt<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const frame = useRef(0);

  const onPointerMove = useCallback((e: React.PointerEvent<T>) => {
    const el = ref.current;
    if (!el || e.pointerType === 'touch') return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      el.style.setProperty('--ry', `${(x - 0.5) * 2 * MAX_TILT}deg`);
      el.style.setProperty('--rx', `${(0.5 - y) * 2 * MAX_TILT}deg`);
      el.style.setProperty('--mx', `${x * 100}%`);
      el.style.setProperty('--my', `${y * 100}%`);
      el.dataset.tilting = '';
    });
  }, []);

  const onPointerLeave = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    cancelAnimationFrame(frame.current);
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
    delete el.dataset.tilting;
  }, []);

  return { ref, onPointerMove, onPointerLeave };
}
