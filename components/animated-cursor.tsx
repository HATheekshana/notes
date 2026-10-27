'use client';

import { useEffect, useRef } from 'react';

export default function AnimatedCursor() {
  const ring = useRef<HTMLSpanElement>(null);
  const robot = useRef<HTMLSpanElement>(null);
  const actionTimeout = useRef<number | null>(null);
  const movementTimeout = useRef<number | null>(null);
  const lastPosition = useRef<{ x: number; y: number } | null>(null);

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
      robot.current?.style.setProperty('left', `${event.clientX}px`);
      robot.current?.style.setProperty('top', `${event.clientY}px`);
      ring.current?.style.setProperty('left', `${event.clientX}px`);
      ring.current?.style.setProperty('top', `${event.clientY}px`);

      const previous = lastPosition.current;
      if (previous) {
        const tilt = Math.max(-12, Math.min(12, (event.clientX - previous.x) * 0.7));
        robot.current?.style.setProperty('--robot-tilt', `${tilt}deg`);
        root.dataset.cursorMotion = 'move';
        if (movementTimeout.current !== null) window.clearTimeout(movementTimeout.current);
        movementTimeout.current = window.setTimeout(() => {
          delete root.dataset.cursorMotion;
          robot.current?.style.setProperty('--robot-tilt', '0deg');
        }, 130);
      }
      lastPosition.current = { x: event.clientX, y: event.clientY };

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

    const activate = (action: string) => {
      if (!motionQuery.matches) return;
      root.dataset.customCursor = 'true';
      root.dataset.cursorVisible = 'true';
      root.dataset.cursorAction = '';
      if (actionTimeout.current !== null) window.clearTimeout(actionTimeout.current);
      window.requestAnimationFrame(() => {
        root.dataset.cursorAction = action;
        actionTimeout.current = window.setTimeout(() => {
          delete root.dataset.cursorAction;
        }, 500);
      });
    };

    const press = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') activate(event.button === 2 ? 'right-click' : 'left-click');
    };

    const scroll = (event: WheelEvent) => {
      activate(event.deltaY < 0 ? 'scroll-up' : 'scroll-down');
    };

    const leave = () => {
      delete root.dataset.customCursor;
      delete root.dataset.cursorVisible;
      delete root.dataset.cursorHover;
      delete root.dataset.cursorNative;
      delete root.dataset.cursorAction;
      delete root.dataset.cursorMotion;
      lastPosition.current = null;
      if (actionTimeout.current !== null) window.clearTimeout(actionTimeout.current);
      if (movementTimeout.current !== null) window.clearTimeout(movementTimeout.current);
    };
    const motionChange = (event: MediaQueryListEvent) => {
      if (!event.matches) leave();
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerdown', press);
    window.addEventListener('wheel', scroll, { passive: true });
    window.addEventListener('pointerleave', leave);
    motionQuery.addEventListener('change', motionChange);

    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', press);
      window.removeEventListener('wheel', scroll);
      window.removeEventListener('pointerleave', leave);
      motionQuery.removeEventListener('change', motionChange);
      leave();
    };
  }, []);

  return (
    <span className="animated-cursor" aria-hidden="true">
      <span className="animated-cursor__ring" ref={ring} />
      <span className="animated-cursor__robot" ref={robot}>
        <span className="animated-cursor__antenna" />
        <span className="animated-cursor__head">
          <span className="animated-cursor__eye" />
          <span className="animated-cursor__eye" />
          <span className="animated-cursor__mouth" />
        </span>
        <span className="animated-cursor__ear animated-cursor__ear--left" />
        <span className="animated-cursor__ear animated-cursor__ear--right" />
      </span>
    </span>
  );
}
