import { describe, expect, it } from "vitest";
import { alternatingWeekLabel } from "./weekPattern";

describe("alternating week label", () => {
  it("recognizes odd and even week schedules", () => {
    expect(alternatingWeekLabel([1, 3, 5, 7])).toBe("单周");
    expect(alternatingWeekLabel([2, 4, 6, 8])).toBe("双周");
  });

  it("does not mislabel continuous or one-off courses", () => {
    expect(alternatingWeekLabel([1, 2, 3, 4])).toBeUndefined();
    expect(alternatingWeekLabel([3])).toBeUndefined();
  });
});
