import { describe, expect, it } from "vitest";
import { LONG_PRESS_DELAY_MS, shouldCancelLongPress } from "./longPress";

describe("calendar long press", () => {
  it("requires an intentional hold", () => {
    expect(LONG_PRESS_DELAY_MS).toBeGreaterThanOrEqual(750);
  });

  it("cancels as soon as the finger starts a scroll or week swipe", () => {
    expect(shouldCancelLongPress({ x: 10, y: 10 }, { x: 18, y: 18 })).toBe(false);
    expect(shouldCancelLongPress({ x: 10, y: 10 }, { x: 23, y: 10 })).toBe(true);
    expect(shouldCancelLongPress({ x: 10, y: 10 }, { x: 10, y: 23 })).toBe(true);
  });
});
