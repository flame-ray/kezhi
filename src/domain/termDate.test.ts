import { describe, expect, it } from "vitest";
import { buildWeekView } from "./scheduleEngine";
import { DEFAULT_TERM_START_KEY, normalizeTermStartKey, resolveTermStartDate, suggestTermStartKey } from "./termDate";

describe("term date", () => {
  it("uses the reference timetable's first Monday by default", () => {
    expect(DEFAULT_TERM_START_KEY).toBe("2026-09-14");
    expect(suggestTermStartKey(2026, 1)).toBe("2026-09-14");
    const weekFive = buildWeekView([], resolveTermStartDate(DEFAULT_TERM_START_KEY), 5);
    expect(weekFive.startsOn.getMonth() + 1).toBe(10);
    expect(weekFive.startsOn.getDate()).toBe(12);
  });

  it("normalizes any selected day to the Monday of that week", () => {
    expect(normalizeTermStartKey("2026-09-17")).toBe("2026-09-14");
    expect(normalizeTermStartKey("2026-09-13")).toBe("2026-09-07");
  });

  it("falls back safely for invalid dates", () => {
    const date = resolveTermStartDate("2026-02-31");
    expect(`${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`).toBe("2026-9-14");
  });
});
