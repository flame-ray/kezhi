import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { reducedMotion } from "./Motion";

/** One shared pill: compositor-only slide + damped squash, interruptible at its current position. */
export function NavigationIndicator({ active, container }: { active: string; container: RefObject<HTMLElement | null> }) {
  const ref = useRef<HTMLDivElement>(null);
  const animation = useRef<Animation | undefined>(undefined);
  const initialized = useRef(false);
  useEffect(() => {
    const nav = container.current, pill = ref.current;
    if (!nav || !pill) return;
    const place = (animate: boolean) => {
      const button = nav.querySelector<HTMLElement>(".nav-item.active");
      if (!button || !window.matchMedia("(max-width: 760px)").matches) {
        animation.current?.cancel(); initialized.current = false; pill.style.opacity = "0"; return;
      }
      const x = button.offsetLeft + button.offsetWidth / 2 - 30;
      const current = getComputedStyle(pill).transform;
      const from = current === "none" ? x : new DOMMatrixReadOnly(current).m41;
      animation.current?.cancel();
      pill.style.transform = `translate3d(${x}px, 0, 0)`;
      pill.style.opacity = "1";
      if (animate && initialized.current && !reducedMotion() && Math.abs(x - from) > 1) {
        const distance = x - from;
        animation.current = pill.animate([
          { transform: `translate3d(${from}px,0,0) scale(1,1)`, offset: 0 },
          { transform: `translate3d(${from + distance * .68}px,0,0) scale(1.18,.88)`, offset: .4 },
          { transform: `translate3d(${x + Math.sign(distance) * 5}px,0,0) scale(.93,1.06)`, offset: .7 },
          { transform: `translate3d(${x - Math.sign(distance) * 1.5}px,0,0) scale(1.025,.98)`, offset: .86 },
          { transform: `translate3d(${x}px,0,0) scale(1,1)`, offset: 1 },
        ], { duration: 480, easing: "cubic-bezier(.2,.65,.3,1)" });
      }
      initialized.current = true;
    };
    place(true);
    let width = nav.clientWidth;
    const observer = new ResizeObserver(() => {
      if (nav.clientWidth !== width) { width = nav.clientWidth; place(false); }
    });
    observer.observe(nav);
    return () => observer.disconnect();
  }, [active, container]);
  useLayoutEffect(() => () => animation.current?.cancel(), []);
  return <div ref={ref} className="navigation-indicator" aria-hidden="true" />;
}
