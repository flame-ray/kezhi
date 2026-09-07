import { describe, expect, it } from "vitest";
import { defaultPresets } from "../data/demo";
import { mergeIcsCourses, parseIcsSchedule } from "./icsImport";

const calendar = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:math@example.test",
  "DTSTART;TZID=Asia/Shanghai:20260914T082000",
  "DTEND;TZID=Asia/Shanghai:20260914T095500",
  "RRULE:FREQ=WEEKLY;COUNT=4;BYDAY=MO",
  "SUMMARY:高等数学",
  "LOCATION:教学楼 101",
  "DESCRIPTION:林老师 · 第1-2节",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("ICS calendar import", () => {
  it("maps recurring events to course weeks and timetable periods", () => {
    const result = parseIcsSchedule(calendar, { preset: defaultPresets[0], weekOneStartsOn: "2026-09-14" });
    expect(result.courses).toHaveLength(1);
    expect(result.occurrenceCount).toBe(4);
    expect(result.courses[0]).toMatchObject({ title: "高等数学", teacher: "林老师", day: 1, startPeriod: 1, endPeriod: 2, weeks: [1, 2, 3, 4] });
  });

  it("infers the first week Monday when importing into an empty schedule", () => {
    expect(parseIcsSchedule(calendar, { preset: defaultPresets[0] }).weekOneStartsOn).toBe("2026-09-14");
  });

  it("merges an identical imported course without duplicating it", () => {
    const course = parseIcsSchedule(calendar, { preset: defaultPresets[0] }).courses[0];
    const merged = mergeIcsCourses([{ ...course, weeks: [1] }], [{ ...course, weeks: [1, 2, 3] }]);
    expect(merged).toHaveLength(1);
    expect(merged[0].weeks).toEqual([1, 2, 3]);
  });

  it("rejects files that are not ICS calendars", () => {
    expect(() => parseIcsSchedule("hello", { preset: defaultPresets[0] })).toThrow("ICS");
  });
});
