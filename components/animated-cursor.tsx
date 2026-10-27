'use client';

import { useEffect, useRef } from 'react';

export default function AnimatedCursor() {
  const dot = useRef<HTMLSpanElement>(null);
  const ring = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    const motionQuery = window.matchMedia(
      '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)',
    );

    const move = (event: PointerEvent) => {
      if (!motionQuery.matches) {
        leave();
        return;
      }

      if (event.pointerType !== 'mouse') return;

      root.dataset.customCursor = 'true';
      root.dataset.cursorVisible = 'true';
      dot.current?.style.setProperty('left', `${event.clientX}px`);
      dot.current?.style.setProperty('top', `${event.clientY}px`);
      ring.current?.style.setProperty('left', `${event.clientX}px`);
      ring.current?.style.setProperty('top', `${event.clientY}px`);

      const target = event.target;
      const textEntry =
        target instanceof Element &&
        target.closest('input, textarea, select, [contenteditable="true"]');
      const interactive =
        target instanceof Element &&
        target.closest('a, button, [role="button"], input, textarea, select');

      if (textEntry) {
        root.dataset.cursorNative = 'true';
      } else {
        root.dataset.cursorNative = 'false';
      }

      root.dataset.cursorHover = interactive && !textEntry ? 'true' : 'false';
    };

    const leave = () => {
      delete root.dataset.customCursor;
      delete root.dataset.cursorVisible;
      delete root.dataset.cursorHover;
      delete root.dataset.cursorNative;
    };
    const motionChange = (event: MediaQueryListEvent) => {
      if (!event.matches) leave();
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerleave', leave);
    motionQuery.addEventListener('change', motionChange);

    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerleave', leave);
      motionQuery.removeEventListener('change', motionChange);
      delete root.dataset.customCursor;
      delete root.dataset.cursorVisible;
      delete root.dataset.cursorHover;
      delete root.dataset.cursorNative;
    };
  }, []);

  return (
    <span className="animated-cursor" aria-hidden="true">
      <span className="animated-cursor__ring" ref={ring} />
      <span className="animated-cursor__dot" ref={dot} />
    </span>
  );
}
