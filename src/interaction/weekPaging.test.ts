import { describe, expect, it } from "vitest";
import { resistedWeekOffset, resolveWeekSwipe, releaseVelocity, weekSettleDuration } from "./weekPaging";

describe("week paging gesture", () => {
  it("forgets flick velocity after the finger pauses", () => {
    expect(releaseVelocity(-1, 120)).toBe(0);
    expect(releaseVelocity(-1, 16)).toBe(-1);
  });
  it("shortens settling for a flick without making reverse snap-back abrupt", () => {
    expect(weekSettleDuration(-250, 390, -1.2)).toBeLessThan(weekSettleDuration(-250, 390, 0));
    expect(weekSettleDuration(20, 390, -1)).toBe(weekSettleDuration(20, 390, 0));
    expect(weekSettleDuration(-390, 390, -100)).toBeGreaterThanOrEqual(140);
  });
  it("commits a page after crossing the distance threshold", () => {
    expect(resolveWeekSwipe({ offset: -90, velocity: -0.1, width: 390, canPrevious: true, canNext: true })).toBe(1);
    expect(resolveWeekSwipe({ offset: 90, velocity: 0.1, width: 390, canPrevious: true, canNext: true })).toBe(-1);
  });

  it("uses a quick flick and snaps back for a short slow drag", () => {
    expect(resolveWeekSwipe({ offset: -24, velocity: -0.8, width: 390, canPrevious: true, canNext: true })).toBe(1);
    expect(resolveWeekSwipe({ offset: -24, velocity: -0.2, width: 390, canPrevious: true, canNext: true })).toBe(0);
  });

  it("does not move beyond the available semester weeks", () => {
    expect(resolveWeekSwipe({ offset: 120, velocity: 0.8, width: 390, canPrevious: false, canNext: true })).toBe(0);
    expect(resolveWeekSwipe({ offset: -120, velocity: -0.8, width: 390, canPrevious: true, canNext: false })).toBe(0);
  });

  it("adds rubber-band resistance at the first and last week", () => {
    expect(resistedWeekOffset(100, 400, false, true)).toBe(18);
    expect(resistedWeekOffset(-100, 400, true, false)).toBe(-18);
    expect(resistedWeekOffset(-100, 400, true, true)).toBe(-100);
  });
});
