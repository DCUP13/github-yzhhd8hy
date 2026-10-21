import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';

const HOLD_MS = 450;
const MOVE_TOLERANCE = 8;
const EDGE_ZONE = 72;
const MAX_SCROLL_SPEED = 18;
export const DAY_BAR_HEIGHT = 96;

export interface TouchDragState {
  id: string;
  x: number;
  y: number;
  overDay: number | null;
}

function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node && node !== document.body) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return null;
}

function dayAtPoint(x: number, y: number): number | null {
  const el = document.elementFromPoint(x, y)?.closest('[data-drop-day]');
  if (!el) return null;
  const day = Number(el.getAttribute('data-drop-day'));
  return Number.isNaN(day) ? null : day;
}

export function useTouchDrag(onDrop: (id: string, day: number) => void) {
  const [drag, setDrag] = useState<TouchDragState | null>(null);
  const timer = useRef<number | null>(null);
  const start = useRef<{ id: string; x: number; y: number; el: HTMLElement } | null>(null);
  const pos = useRef({ x: 0, y: 0 });
  const scroller = useRef<HTMLElement | null>(null);
  const lastDragEnd = useRef(0);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  const clearTimer = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };

  const bind = useCallback(
    (id: string) => ({
      onTouchStart: (e: React.TouchEvent<HTMLElement>) => {
        if (e.touches.length !== 1) return;
        const t = e.touches[0];
        start.current = { id, x: t.clientX, y: t.clientY, el: e.currentTarget };
        pos.current = { x: t.clientX, y: t.clientY };
        clearTimer();
        timer.current = window.setTimeout(() => {
          if (!start.current) return;
          scroller.current = findScrollParent(start.current.el);
          navigator.vibrate?.(15);
          setDrag({ id, x: pos.current.x, y: pos.current.y, overDay: null });
        }, HOLD_MS);
      },
      onTouchMove: (e: React.TouchEvent<HTMLElement>) => {
        const t = e.touches[0];
        if (!start.current || !t) return;
        pos.current = { x: t.clientX, y: t.clientY };
        if (timer.current !== null && Math.hypot(t.clientX - start.current.x, t.clientY - start.current.y) > MOVE_TOLERANCE) {
          clearTimer();
          start.current = null;
        }
      },
      onTouchEnd: () => {
        clearTimer();
        if (!drag) start.current = null;
      },
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    }),
    [drag],
  );

  const dragging = drag !== null;

  useEffect(() => {
    if (!dragging) return;
    let frame = 0;

    const autoScroll = () => {
      const { y } = pos.current;
      const h = window.innerHeight;
      const bottomEdge = h - DAY_BAR_HEIGHT;
      let speed = 0;
      if (y < EDGE_ZONE) speed = -MAX_SCROLL_SPEED * (1 - y / EDGE_ZONE);
      else if (y > bottomEdge - EDGE_ZONE && y < bottomEdge) speed = MAX_SCROLL_SPEED * (1 - (bottomEdge - y) / EDGE_ZONE);
      if (speed !== 0) {
        if (scroller.current) scroller.current.scrollTop += speed;
        else window.scrollBy(0, speed);
        const overDay = dayAtPoint(pos.current.x, pos.current.y);
        setDrag((d) => (d && d.overDay !== overDay ? { ...d, overDay } : d));
      }
      frame = requestAnimationFrame(autoScroll);
    };
    frame = requestAnimationFrame(autoScroll);

    const move = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches[0];
      if (!t) return;
      pos.current = { x: t.clientX, y: t.clientY };
      const overDay = dayAtPoint(t.clientX, t.clientY);
      setDrag((d) => (d ? { ...d, x: t.clientX, y: t.clientY, overDay } : d));
    };

    const finish = (e: TouchEvent, drop: boolean) => {
      e.preventDefault();
      const id = start.current?.id;
      const day = dayAtPoint(pos.current.x, pos.current.y);
      start.current = null;
      lastDragEnd.current = Date.now();
      setDrag(null);
      if (drop && id && day !== null) onDropRef.current(id, day);
    };
    const end = (e: TouchEvent) => finish(e, true);
    const cancel = (e: TouchEvent) => finish(e, false);

    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', end, { passive: false });
    document.addEventListener('touchcancel', cancel);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', end);
      document.removeEventListener('touchcancel', cancel);
    };
  }, [dragging]);

  useEffect(() => clearTimer, []);

  const justDragged = useCallback(() => Date.now() - lastDragEnd.current < 600, []);

  return { drag, bind, justDragged };
}
