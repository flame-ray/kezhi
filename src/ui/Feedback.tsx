import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";
import { reducedMotion, useExiting } from "./Motion";

/** A bounded, compositor-only state layer. It never updates the React tree. */
export function InteractionFeedback() {
  useEffect(() => {
    const active = new Map<number, { node: HTMLSpanElement; animation: Animation }>();
    const finish = (id: number) => {
      const entry = active.get(id);
      if (!entry) return;
      active.delete(id);
      const remove = () => entry.node.remove();
      if (entry.node.animate) {
        const fade = entry.node.animate([{ opacity: 0.12 }, { opacity: 0 }], { duration: 180 });
        fade.onfinish = remove;
        fade.oncancel = remove;
      } else remove();
    };
    const press = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0 || reducedMotion()) return;
      const button = (event.target as Element).closest<HTMLElement>("button");
      if (!button || button.hasAttribute("disabled") || button.closest("[inert]") || !button.matches(".primary-button, .soft-button, .cancel-button, .nav-item, .icon-button, .export-card, .calendar-import-shortcut")) return;
      finish(event.pointerId);
      const rect = button.getBoundingClientRect();
      const size = Math.hypot(rect.width, rect.height) * 2;
      const dot = document.createElement("span");
      dot.className = "touch-ripple";
      dot.setAttribute("aria-hidden", "true");
      Object.assign(dot.style, { width: `${size}px`, height: `${size}px`, left: `${event.clientX - rect.left - size / 2}px`, top: `${event.clientY - rect.top - size / 2}px` });
      button.append(dot);
      const animation = dot.animate([{ transform: "scale(0)", opacity: 0.12 }, { transform: "scale(1)", opacity: 0.12 }], { duration: 420, easing: "cubic-bezier(0.2,0,0,1)", fill: "forwards" });
      active.set(event.pointerId, { node: dot, animation });
    };
    const release = (event: PointerEvent) => finish(event.pointerId);
    const clear = () => { active.forEach(({ node, animation }) => { animation.cancel(); node.remove(); }); active.clear(); };
    document.addEventListener("pointerdown", press, { passive: true });
    document.addEventListener("pointerup", release, { passive: true });
    document.addEventListener("pointercancel", release, { passive: true });
    window.addEventListener("blur", clear);
    return () => {
      document.removeEventListener("pointerdown", press);
      document.removeEventListener("pointerup", release);
      document.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", clear);
      clear();
    };
  }, []);
  return null;
}

export function Snackbar({ message, onClose }: { message: string; onClose: () => void }) {
  const exiting = useExiting();
  return createPortal(<div className="toast material-snackbar" data-phase={exiting ? "exit" : "enter"} role="status"><span>{message}</span><button aria-label="关闭提示" onClick={onClose}><Icon name="close" /></button></div>, document.body);
}
