'use client';

import { useEffect, useRef } from 'react';

export default function AnimatedCursor() {
  const cursor = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      root.dataset.customCursor = 'true';
      root.dataset.cursorVisible = 'true';
      cursor.current?.style.setProperty('left', `${event.clientX}px`);
      cursor.current?.style.setProperty('top', `${event.clientY}px`);
      const target = event.target;
      root.dataset.cursorHover = target instanceof Element && !!target.closest('a, button, [role="button"], input, textarea, select') ? 'true' : 'false';
    };
    const leave = () => {
      delete root.dataset.customCursor;
      delete root.dataset.cursorVisible;
      delete root.dataset.cursorHover;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerleave', leave);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerleave', leave);
      leave();
    };
  }, []);

  return (
    <span ref={cursor} className="animated-cursor" aria-hidden="true">
      <svg viewBox="0 0 28 28" width="28" height="28" focusable="false">
        <path d="M3 2.5 3.2 23.1l5.8-5.2 3.7 7.3 4.1-2.1-3.7-7.1 7.4-1.2L3 2.5Z" fill="#ffffff" stroke="#4c78ff" strokeWidth="2.2" strokeLinejoin="round" />
        <path d="M7 7.2 16.8 15l-5.4.9 3.4 6.5-1.7.9-3.4-6.6-3.1 2.8L7 7.2Z" fill="#4c78ff" opacity=".95" />
      </svg>
    </span>
  );
}
