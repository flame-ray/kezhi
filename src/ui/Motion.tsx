import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export const MOTION = { enter: 320, exit: 200, standard: 260, easing: "cubic-bezier(0.2, 0, 0, 1)" };
export function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
const PresenceContext = createContext(false);
export const useExiting = () => useContext(PresenceContext);

export function useCompactLayout() {
  const [compact, setCompact] = useState(() => window.matchMedia("(max-width: 760px)").matches);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return compact;
}

/** Retain the actual component through its exit, including Android back/save paths. */
export function Presence({ children }: { children: ReactNode }) {
  const visible = children !== null && children !== undefined && children !== false;
  const [retained, setRetained] = useState(visible);
  const latest = useRef(children);
  useLayoutEffect(() => {
    if (visible) {
      latest.current = children;
      setRetained(true);
    }
  }, [children, visible]);
  useLayoutEffect(() => {
    if (visible) return;
    const timer = window.setTimeout(() => setRetained(false), reducedMotion() ? 0 : MOTION.exit);
    return () => window.clearTimeout(timer);
  }, [visible]);
  if (!visible && !retained) return null;
  return <PresenceContext.Provider value={!visible}>{visible ? children : latest.current}</PresenceContext.Provider>;
}

/** Animate a changed region without remounting form fields or animating layout. */
export function MotionRegion({ motionKey, className = "", children }: { motionKey: string | number; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const previous = useRef(motionKey);
  useLayoutEffect(() => {
    if (previous.current === motionKey) return;
    const direction = typeof motionKey === "number" && typeof previous.current === "number" && motionKey < previous.current ? -1 : 1;
    previous.current = motionKey;
    const element = ref.current;
    if (element) element.scrollTop = 0;
    if (!element || reducedMotion() || !element.animate) return;
    const animation = element.animate(
      [{ opacity: 0.35, transform: `translate3d(${direction * 14}px, 0, 0)` }, { opacity: 1, transform: "translate3d(0, 0, 0)" }],
      { duration: MOTION.standard, easing: MOTION.easing },
    );
    return () => animation.cancel();
  }, [motionKey]);
  return <div ref={ref} className={className}>{children}</div>;
}
