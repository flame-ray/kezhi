export const ROOT_BACK_WINDOW_MS = 2000;
export const ROOT_BACK_HINT = '再返回一次回到桌面（2 秒内）';

/** Only call press after all in-app back destinations have been consumed. */
export function createRootBackGate() {
  let previous: number | undefined;
  return {
    reset() { previous = undefined; },
    press(now: number): 'hint' | 'home' {
      const elapsed = previous === undefined ? Infinity : now - previous;
      if (elapsed >= 0 && elapsed <= ROOT_BACK_WINDOW_MS) { previous = undefined; return 'home'; }
      previous = now;
      return 'hint';
    },
  };
}
