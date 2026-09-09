import { describe, expect, it } from "vitest";
import { defaultPresets } from "../data/demo";
import { appendTimetablePeriod, validateTimetablePreset } from "./timetable";

describe("timetable presets", () => {
  it("validates sequential periods and time ranges", () => {
    expect(validateTimetablePreset(defaultPresets[0])).toBeUndefined();
    expect(validateTimetablePreset({ ...defaultPresets[0], periods: [{ index: 2, start: "08:20", end: "09:05" }] })).toContain("连续排列");
    expect(validateTimetablePreset({ ...defaultPresets[0], periods: [{ index: 1, start: "09:05", end: "08:20" }] })).toContain("结束时间");
  });

  it("adds a 45-minute period after a five-minute break", () => {
    const next = appendTimetablePeriod(defaultPresets[0]);
    expect(next?.periods.at(-1)).toEqual({ index: 12, start: "21:30", end: "22:15" });
    expect(validateTimetablePreset(next!)).toBeUndefined();
  });
});
