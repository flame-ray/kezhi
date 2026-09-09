import { useLayoutEffect, useRef, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MOTION, reducedMotion, useExiting } from "./Motion";

const stack: HTMLElement[] = [];
const focusable = 'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]';

function syncModalStack() {
  stack.forEach((element, index) => { element.inert = index !== stack.length - 1; });
  const app = document.querySelector<HTMLElement>(".app-shell");
  if (app) app.inert = stack.length > 0;
}

interface DialogSurfaceProps {
  children: ReactNode;
  className?: string;
  labelledBy: string;
  onClose: () => void;
  onBack?: () => void;
}

export function DialogSurface({ children, className = "", labelledBy, onClose, onBack }: DialogSurfaceProps) {
  const exiting = useExiting();
  const overlay = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  const backRef = useRef(onBack ?? onClose);
  const drag = useRef<{ id: number; y: number; offset: number } | undefined>(undefined);
  const backdropStart = useRef<{ id: number; x: number; y: number } | undefined>(undefined);
  const settleAnimation = useRef<Animation | undefined>(undefined);
  closeRef.current = onClose;
  backRef.current = onBack ?? onClose;

  useLayoutEffect(() => {
    const layer = overlay.current;
    const surface = panel.current;
    if (!layer || !surface) return;
    const restore = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    stack.push(layer);
    syncModalStack();
    surface.focus({ preventScroll: true });
    const keyboard = (event: KeyboardEvent) => {
      if (stack.at(-1) !== layer) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (layer.dataset.phase !== "exit") backRef.current();
      }
      if (event.key !== "Tab") return;
      const items = [...surface.querySelectorAll<HTMLElement>(focusable)].filter((item) => item.getClientRects().length && !item.closest("[inert]"));
      const first = items[0], last = items.at(-1);
      if (!first) { event.preventDefault(); surface.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === surface)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === surface)) {
        event.preventDefault(); first.focus();
      }
    };
    // Visual viewport follows the IME: the actions stay above the keyboard.
    const viewport = window.visualViewport;
    const resize = () => {
      const height = viewport?.height ?? window.innerHeight;
      layer.style.setProperty("--dialog-viewport", `${height}px`);
      layer.style.setProperty("--dialog-top", `${viewport?.offsetTop ?? 0}px`);
      layer.dataset.keyboard = String(window.innerHeight - height > 120);
    };
    resize();
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    window.addEventListener("resize", resize);
    document.addEventListener("keydown", keyboard, true);
    return () => {
      const index = stack.indexOf(layer);
      if (index >= 0) stack.splice(index, 1);
      syncModalStack();
      document.removeEventListener("keydown", keyboard, true);
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
      window.removeEventListener("resize", resize);
      settleAnimation.current?.cancel();
      if (restore?.isConnected && !restore.closest("[inert]")) restore.focus({ preventScroll: true });
      else stack.at(-1)?.querySelector<HTMLElement>('[role="dialog"]')?.focus({ preventScroll: true });
    };
  }, []);

  const beginDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (exiting || !event.isPrimary || event.button !== 0) return;
    settleAnimation.current?.cancel();
    panel.current?.setAttribute("data-entered", "true");
    drag.current = { id: event.pointerId, y: event.clientY, offset: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
    panel.current?.setAttribute("data-dragging", "true");
  };
  const moveDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const gesture = drag.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    gesture.offset = Math.max(0, event.clientY - gesture.y);
    panel.current?.style.setProperty("--sheet-drag", `${gesture.offset}px`);
  };
  const endDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const gesture = drag.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    drag.current = undefined;
    const surface = panel.current;
    surface?.removeAttribute("data-dragging");
    if (event.type !== "pointercancel" && gesture.offset > Math.min(120, (surface?.clientHeight ?? 600) * 0.22)) {
      closeRef.current();
      return;
    }
    if (surface?.animate && !reducedMotion()) {
      settleAnimation.current = surface.animate(
        [{ transform: `translate3d(0, ${gesture.offset}px, 0)` }, { transform: "translate3d(0, 0, 0)" }],
        { duration: MOTION.standard, easing: MOTION.easing },
      );
    }
    surface?.style.setProperty("--sheet-drag", "0px");
  };

  return createPortal(
    <div ref={overlay} className="dialog-backdrop material-backdrop" data-phase={exiting ? "exit" : "enter"}
      onPointerDown={(event) => {
        backdropStart.current = event.target === event.currentTarget && event.isPrimary
          ? { id: event.pointerId, x: event.clientX, y: event.clientY } : undefined;
      }}
      onPointerUp={(event) => {
        const start = backdropStart.current;
        backdropStart.current = undefined;
        if (!exiting && start?.id === event.pointerId && event.target === event.currentTarget && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 8) closeRef.current();
      }}
      onPointerCancel={() => { backdropStart.current = undefined; }}>
      <section ref={panel} className={`dialog material-dialog ${className}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1}
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget && (event.animationName === "material-dialog-in" || event.animationName === "material-sheet-in")) event.currentTarget.dataset.entered = "true";
        }}>
        <button className="sheet-handle" aria-label="收起弹窗" onPointerDown={beginDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
          onClick={(event) => { if (event.detail === 0) closeRef.current(); }}><span /></button>
        {children}
      </section>
    </div>,
    document.body,
  );
}
