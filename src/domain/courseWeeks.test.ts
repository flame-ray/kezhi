import { describe, expect, it } from "vitest";
import { detectCourseWeekRule, parseWeekExpression, resolveCourseWeeks } from "./courseWeeks";

describe("course weeks", () => {
  it("parses mixed custom week expressions", () => {
    expect(parseWeekExpression("1-3, 6，9至10")).toEqual([1, 2, 3, 6, 9, 10]);
    expect(parseWeekExpression("0, 31, x")).toEqual([]);
  });

  it("clips partially overlapping ranges and rejects fully out-of-range ranges", () => {
    expect(parseWeekExpression("0-2, 29-40")).toEqual([1, 2, 29, 30]);
    expect(parseWeekExpression("0-0, 40-50")).toEqual([]);
  });

  it("normalizes reversed numeric ranges and invalid numeric input", () => {
    expect(resolveCourseWeeks("continuous", 40, -2, "")).toHaveLength(30);
    expect(resolveCourseWeeks("odd", 6, 1, "")).toEqual([1, 3, 5]);
    expect(resolveCourseWeeks("continuous", Number.NaN, 18, "")).toEqual([]);
  });

  it("detects single, double and discontinuous week rules", () => {
    expect(detectCourseWeekRule([1, 3, 5])).toBe("odd");
    expect(detectCourseWeekRule([2, 4, 6])).toBe("even");
    expect(detectCourseWeekRule([1, 2, 4])).toBe("custom");
  });
});
