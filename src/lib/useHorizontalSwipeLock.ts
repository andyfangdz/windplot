import { useEffect, useRef, type RefObject } from 'react';

/**
 * Prevents vertical scrolling when the user is swiping horizontally
 * on the referenced element. Once enough movement is detected to
 * determine intent (horizontal vs vertical), the decision is locked
 * for the rest of that touch gesture.
 */
export function useHorizontalSwipeLock<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let startX = 0;
    let startY = 0;
    let direction: 'horizontal' | 'vertical' | null = null;

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      direction = null;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!direction) {
        const touch = e.touches[0];
        const dx = Math.abs(touch.clientX - startX);
        const dy = Math.abs(touch.clientY - startY);

        // Wait for enough movement to confidently determine direction
        if (dx + dy < 8) return;

        direction = dx >= dy ? 'horizontal' : 'vertical';
      }

      if (direction === 'horizontal') {
        e.preventDefault();
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
    };
  }, []);

  return ref;
}
