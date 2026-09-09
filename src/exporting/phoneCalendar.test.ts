import { describe, expect, it } from "vitest";
import { defaultPresets, demoCourses } from "../data/demo";
import type { ExportContext } from "./scheduleExport";
import { buildPhoneCalendarEvents } from "./phoneCalendar";

const context: ExportContext = {
  snapshot: { courses: [{ ...demoCourses[0], day: 4, weeks: [1, 3, 5] }], presets: defaultPresets, activePresetId: "summer", reminderSettings: { enabled: true, defaultMinutes: 15 } },
  preset: defaultPresets[0],
  calendar: { weekOneStartsOn: new Date(2026, 8, 14, 12), teachingStartsOn: new Date(2026, 8, 17, 12) },
  termName: "2026 秋",
};
describe("phone calendar export", () => {
  it("keeps Thursday opening day in week one and expands odd weeks", () => {
    const events = buildPhoneCalendarEvents(context);
    expect(events).toHaveLength(3);
    expect(events[0].startMs).toBe(Date.parse("2026-09-17T08:20:00+08:00"));
    expect(events[1].startMs).toBe(Date.parse("2026-10-01T08:20:00+08:00"));
    expect(events[0].endMs).toBe(Date.parse("2026-09-17T09:55:00+08:00"));
    expect(events[0].reminderMinutes).toBe(15);
  });
  it("omits courses before teaching begins", () => {
    const adjusted = { ...context, snapshot: { ...context.snapshot, courses: [{ ...context.snapshot.courses[0], day: 1 as const }] } };
    expect(buildPhoneCalendarEvents(adjusted)).toHaveLength(2);
  });
  it("deduplicates repeated weeks and keeps keys stable for edits", () => {
    const original = buildPhoneCalendarEvents(context);
    const edited = buildPhoneCalendarEvents({ ...context, snapshot: { ...context.snapshot, courses: [{ ...context.snapshot.courses[0], weeks: [1, 1, 3, 5], title: "新名称", location: "B301" }] } });
    expect(edited.map(e => e.key)).toEqual(original.map(e => e.key));
    expect(edited[0].title).toBe("新名称");
  });
  it("uses updated presets and respects reminders off", () => {
    const events = buildPhoneCalendarEvents({ ...context, snapshot: { ...context.snapshot, reminderSettings: { enabled: false, defaultMinutes: 15 } }, preset: { ...context.preset, periods: context.preset.periods.map(p => p.index === 1 ? { ...p, start: "08:00" } : p) } });
    expect(events[0].startMs).toBe(Date.parse("2026-09-17T08:00:00+08:00"));
    expect(events[0].reminderMinutes).toBe(0);
  });
  it("rejects missing or reversed period times", () => {
    expect(() => buildPhoneCalendarEvents({ ...context, preset: { ...context.preset, periods: [] } })).toThrow();
    expect(() => buildPhoneCalendarEvents({ ...context, preset: { ...context.preset, periods: context.preset.periods.map(p => ({ ...p, start: "12:00", end: "08:00" })) } })).toThrow();
  });
  it("returns no events for an empty timetable", () => {
    expect(buildPhoneCalendarEvents({ ...context, snapshot: { ...context.snapshot, courses: [] } })).toEqual([]);
  });
  it("keeps event identity when the opening date is corrected", () => {
    const corrected = buildPhoneCalendarEvents({ ...context, calendar: { weekOneStartsOn: new Date(2026,8,21,12), teachingStartsOn: new Date(2026,8,24,12) } });
    expect(corrected.map(e => e.key)).toEqual(buildPhoneCalendarEvents(context).map(e => e.key));
    expect(corrected[0].startMs).toBe(Date.parse("2026-09-24T08:20:00+08:00"));
  });
});
