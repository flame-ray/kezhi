export const LONG_PRESS_DELAY_MS = 820;
export const LONG_PRESS_FEEDBACK_MS = 220;
export const LONG_PRESS_MOVE_TOLERANCE_PX = 12;

interface Point {
  x: number;
  y: number;
}

export function shouldCancelLongPress(
  origin: Point,
  current: Point,
  tolerance = LONG_PRESS_MOVE_TOLERANCE_PX,
): boolean {
  return Math.hypot(current.x - origin.x, current.y - origin.y) > tolerance;
}
