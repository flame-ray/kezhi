import { describe, expect, it } from "vitest";
import { parseConfirmedPortalWeeks, resolvePortalWeekReview, type PortalWeekReview } from "./portalWeekReview";

describe("explicit portal week review", () => {
  it.each(["", "单周", "双周", "A101", "1-", "1-16,", "0-16", "16-1", "1-31", "2026-09-17", "1-16周abc", "1-16;bad"])("rejects missing or partial expression %s", text => {
    expect(parseConfirmedPortalWeeks(text)).toEqual([]);
  });
  it("accepts bounded ranges, lists and parity only with explicit numeric weeks", () => {
    expect(parseConfirmedPortalWeeks("第1～8周（单）")).toEqual([1,3,5,7]);
    expect(parseConfirmedPortalWeeks("周次：2、4、6、6")).toEqual([2,4,6]);
    expect(parseConfirmedPortalWeeks("1-3,5-7")).toEqual([1,2,3,5,6,7]);
    expect(parseConfirmedPortalWeeks("第30周")).toEqual([30]);
  });
  it("retains known parity without inventing weeks or modifying the pending record", () => {
    const review: PortalWeekReview = { course: { id: "test", courseCode: "TEST", title: "数学", teacher: "", location: "", day: 1, startPeriod: 1, endPeriod: 2, color: "blue" }, sourceText: "数学\n单周", parity: "odd" };
    expect(resolvePortalWeekReview(review, "")).toBeUndefined();
    expect(resolvePortalWeekReview(review, "2,4")).toBeUndefined();
    expect(resolvePortalWeekReview(review, "1-8")?.weeks).toEqual([1,3,5,7]);
    expect(review.course).not.toHaveProperty("weeks");
  });
});
