import { useLayoutEffect, useRef, type PointerEvent, type ReactNode, type TransitionEvent } from "react";
import { resistedWeekOffset, resolveWeekSwipe } from "../interaction/weekPaging";
import { reducedMotion } from "./Motion";

interface SwipePagerProps {
  pageKey: string;
  pages: [ReactNode, ReactNode, ReactNode];
  onPage: (delta: -1 | 1) => void;
}

/** Three real pages keep the destination visible while a finger is moving. */
export function SwipePager({ pageKey, pages, onPage }: SwipePagerProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: number; x: number; y: number; width: number; lastX: number; lastAt: number; velocity: number; horizontal: boolean } | undefined>(undefined);
  const offset = useRef(0);
  const pending = useRef<-1 | 0 | 1>(0);
  const moving = useRef(false);
  const frame = useRef(0);
  const timer = useRef(0);
  const suppressClick = useRef(0);
  const onPageRef = useRef(onPage);
  onPageRef.current = onPage;

  const write = () => track.current?.style.setProperty("--day-drag", `${offset.current}px`);
  const clear = () => { window.cancelAnimationFrame(frame.current); window.clearTimeout(timer.current); frame.current = 0; timer.current = 0; };
  const complete = () => {
    if (!moving.current) return;
    clear();
    const delta = pending.current;
    moving.current = false;
    if (delta) onPageRef.current(delta);
    else {
      track.current?.classList.remove("settling");
      offset.current = 0;
      write();
      viewport.current?.setAttribute("data-moving", "false");
    }
  };

  useLayoutEffect(() => {
    clear();
    pending.current = 0;
    moving.current = false;
    gesture.current = undefined;
    offset.current = 0;
    track.current?.classList.remove("settling");
    write();
    viewport.current?.setAttribute("data-moving", "false");
    viewport.current?.querySelectorAll(".day-pager-page").forEach((element) => { element.scrollTop = 0; });
  }, [pageKey]);
  useLayoutEffect(() => clear, []);

  const begin = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.button !== 0 || event.pointerType === "mouse" || moving.current) return;
    // Leave the system back-gesture zone to Android.
    if (event.clientX < 24 || event.clientX > window.innerWidth - 24) return;
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, width: event.currentTarget.clientWidth, lastX: event.clientX, lastAt: event.timeStamp, velocity: 0, horizontal: false };
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    const x = event.clientX - current.x, y = event.clientY - current.y;
    if (!current.horizontal) {
      if (Math.abs(y) > 8 && Math.abs(y) >= Math.abs(x)) { gesture.current = undefined; return; }
      if (Math.abs(x) < 10) return;
      current.horizontal = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      viewport.current?.setAttribute("data-moving", "true");
    }
    event.preventDefault();
    const velocity = (event.clientX - current.lastX) / Math.max(1, event.timeStamp - current.lastAt);
    current.velocity = current.velocity * .55 + velocity * .45;
    current.lastX = event.clientX;
    current.lastAt = event.timeStamp;
    offset.current = resistedWeekOffset(x, current.width, true, true);
    if (!frame.current) frame.current = window.requestAnimationFrame(() => { frame.current = 0; write(); });
  };
  const end = (event: PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    gesture.current = undefined;
    if (!current.horizontal) return;
    suppressClick.current = performance.now() + 400;
    clear();
    write();
    const velocity = event.timeStamp - current.lastAt > 100 ? 0 : current.velocity;
    pending.current = event.type === "pointercancel" ? 0 : resolveWeekSwipe({ offset: offset.current, velocity, width: current.width, canPrevious: true, canNext: true });
    moving.current = true;
    const destination = -pending.current * current.width;
    if (reducedMotion()) { offset.current = destination; write(); complete(); return; }
    const duration = Math.round(180 + Math.min(1, Math.abs(destination - offset.current) / current.width) * 120);
    track.current?.style.setProperty("--day-duration", `${duration}ms`);
    track.current?.classList.add("settling");
    void track.current?.offsetWidth;
    frame.current = window.requestAnimationFrame(() => { frame.current = 0; offset.current = destination; write(); });
    timer.current = window.setTimeout(complete, duration + 64);
  };
  const transitionEnd = (event: TransitionEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && event.propertyName === "transform") complete();
  };

  return <div className="day-pager" ref={viewport} onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
    onClickCapture={(event) => { if (performance.now() < suppressClick.current) { event.preventDefault(); event.stopPropagation(); } }}>
    <div ref={track} className="day-pager-track" onTransitionEnd={transitionEnd}>
      {pages.map((page, index) => <div className="day-pager-page" key={index} aria-hidden={index !== 1 ? true : undefined} inert={index !== 1}>{page}</div>)}
    </div>
  </div>;
}
