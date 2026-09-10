import { describe, expect, it } from "vitest";
import { defaultPresets, demoCourses } from "../data/demo";
import type { CourseException, CourseMeeting } from "./schedule";
import { findOccurrenceConflicts, normalizeCourseExceptions, resolveCourseOccurrences, validateCourseException } from "./courseExceptions";
import { buildWeekView } from "./scheduleEngine";
import { agendaCourseState, coursesForAcademicDate } from "./dayAgenda";
import { buildScheduleCsv, buildScheduleIcs, buildScheduleJson, buildWeekSvg, type ExportContext } from "../exporting/scheduleExport";
import { buildPhoneCalendarEvents } from "../exporting/phoneCalendar";
import { parseScheduleBackup } from "../importing/backupImport";
import { buildReminderSchedule } from "../reminders/reminderSchedule";

const calendar = { weekOneStartsOn: new Date(2026, 8, 14, 12), teachingStartsOn: new Date(2026, 8, 14, 12) };
const course: CourseMeeting = { ...demoCourses[0], id: "math", title: "单次测试课", day: 1, weeks: [1, 2, 3], startPeriod: 1, endPeriod: 2 };
const cancel: CourseException = { courseId: course.id, originalDate: "2026-09-14", kind: "cancel" };
const move: CourseException = { ...cancel, kind: "move", targetDate: "2026-09-23", startPeriod: 3, endPeriod: 4, location: "B202" };
function context(changes: CourseException[] = []): ExportContext {
  return { snapshot: { courses: [course], courseExceptions: changes, presets: defaultPresets, activePresetId: "summer", reminderSettings: { enabled: true, defaultMinutes: 15 } }, preset: defaultPresets[0], calendar, termName: "测试学期" };
}

describe("single occurrence changes", () => {
  it("detects partial overlaps but not adjacent periods or other weeks", () => {
    const other: CourseMeeting = { ...course, id: "other", day: 3, weeks: [2], startPeriod: 4, endPeriod: 5 };
    expect(findOccurrenceConflicts([course, other], [], move, calendar)).toEqual([other]);
    expect(findOccurrenceConflicts([course, { ...other, startPeriod: 5 }], [], move, calendar)).toEqual([]);
    expect(findOccurrenceConflicts([course, { ...other, weeks: [1, 3] }], [], move, calendar)).toEqual([]);
  });
  it("does not conflict with itself while editing but catches another week of the same course", () => {
    expect(findOccurrenceConflicts([course], [move], move, calendar)).toEqual([]);
    expect(findOccurrenceConflicts([course], [], { ...move, targetDate: "2026-09-14", startPeriod: 1, endPeriod: 2 }, calendar)).toEqual([]);
    expect(findOccurrenceConflicts([course], [], { ...move, targetDate: "2026-09-21", startPeriod: 1, endPeriod: 2 }, calendar)).toHaveLength(1);
  });
  it("uses other single-date moves and cancellations in conflict checks", () => {
    const other: CourseMeeting = { ...course, id: "other", day: 3, weeks: [2], startPeriod: 3, endPeriod: 4 };
    const stopped: CourseException = { courseId: "other", originalDate: "2026-09-23", kind: "cancel" };
    expect(findOccurrenceConflicts([course, other], [stopped], move, calendar)).toEqual([]);
    const otherMove: CourseException = { ...move, originalDate: "2026-09-21" };
    expect(findOccurrenceConflicts([course], [otherMove], move, calendar)[0].occurrence?.originalDate).toBe("2026-09-21");
  });
  it("ignores cancellations, invalid destinations and unknown sources", () => {
    expect(findOccurrenceConflicts([course], [], cancel, calendar)).toEqual([]);
    expect(findOccurrenceConflicts([course], [], { ...move, targetDate: "invalid" }, calendar)).toEqual([]);
    expect(findOccurrenceConflicts([], [], move, calendar)).toEqual([]);
  });
  it("cancels only one date without mutating the recurring course and undo restores it", () => {
    const resolved = resolveCourseOccurrences([course], [cancel], calendar);
    expect(course.weeks).toEqual([1, 2, 3]);
    expect(resolved[0].weeks).toEqual([2, 3]);
    expect(resolved[1]).toMatchObject({ status: "cancelled", weeks: [1], occurrence: { marker: true } });
    expect(resolveCourseOccurrences([course], [], calendar)).toEqual([course]);
  });
  it("moves across weeks without altering other occurrences", () => {
    const result = resolveCourseOccurrences([course], [move], calendar);
    expect(result.find(c => c.occurrence && !c.occurrence.marker)).toMatchObject({ day: 3, weeks: [2], startPeriod: 3, endPeriod: 4, location: "B202" });
    expect(coursesForAcademicDate(result, calendar, new Date(2026, 8, 21, 12))).toHaveLength(1);
    expect(coursesForAcademicDate(result, calendar, new Date(2026, 8, 23, 12))[0].location).toBe("B202");
  });
  it("location-only changes do not create an overlapping cancellation marker", () => {
    const result = resolveCourseOccurrences([course], [{ ...move, targetDate: cancel.originalDate, startPeriod: 1, endPeriod: 2 }], calendar);
    expect(result).toHaveLength(2);
    expect(result.some(c => c.status === "cancelled")).toBe(false);
  });
  it("suppresses original inactive shadows and never projects derived courses into other weeks", () => {
    const resolved = resolveCourseOccurrences([course], [move], calendar);
    const week = buildWeekView(resolved, calendar, 1);
    expect(week.days[0].meetings).toHaveLength(1);
    expect(week.days[0].inactiveMeetings).toHaveLength(0);
    expect(week.days[2].inactiveMeetings).toHaveLength(0);
    expect(buildWeekView(resolved, calendar, 4).days[0].inactiveMeetings).toHaveLength(1);
  });
  it("shows cancellations as cancelled even when the current time falls in that class", () => {
    const marker = resolveCourseOccurrences([course], [cancel], calendar)[1];
    expect(agendaCourseState(marker, defaultPresets[0], new Date(2026, 8, 14), new Date(2026, 8, 14, 8, 30))).toBe("cancelled");
  });
  it("normalizes duplicates with last change winning and rejects malformed records", () => {
    expect(normalizeCourseExceptions([cancel, move])).toEqual([move]);
    expect(normalizeCourseExceptions(undefined)).toEqual([]);
    for (const invalid of [null, {}, [{ ...cancel, originalDate: "2026-02-30" }], [{ ...move, endPeriod: 2 }], [{ ...move, location: " " }], [{ ...cancel, kind: "unknown" }]]) {
      expect(() => normalizeCourseExceptions(invalid)).toThrow();
    }
  });
  it("rejects nonexistent sources, before-opening dates, and outside-term destinations", () => {
    expect(validateCourseException(course, { ...cancel, originalDate: "2026-09-15" }, calendar)).toBeTruthy();
    expect(validateCourseException(course, { ...cancel, originalDate: "2026-10-05" }, calendar)).toBeTruthy();
    expect(validateCourseException(course, cancel, { ...calendar, teachingStartsOn: new Date(2026, 8, 17) })).toBeTruthy();
    expect(validateCourseException(course, { ...move, targetDate: "2027-09-23" }, calendar)).toBeTruthy();
    expect(validateCourseException(course, { ...move, targetDate: "2026-09-13" }, calendar)).toBeTruthy();
  });
  it("ignores orphaned and obsolete overrides", () => {
    expect(resolveCourseOccurrences([course], [{ ...cancel, courseId: "absent" }], calendar)).toEqual([course]);
    expect(resolveCourseOccurrences([course], [{ ...cancel, originalDate: "2026-10-05" }], calendar)).toEqual([course]);
  });
  it("keeps raw originals plus overrides in backup round trips", () => {
    const restored = parseScheduleBackup(buildScheduleJson(context([move])));
    expect(restored.courses[0].weeks).toEqual([1, 2, 3]);
    expect(restored.courseExceptions).toEqual([move]);
  });
  it("exports changed dates and stable event identities without stopped events", () => {
    const original = buildPhoneCalendarEvents(context());
    const moved = buildPhoneCalendarEvents(context([move]));
    expect(moved).toHaveLength(3);
    const target = moved.find(event => event.location === "B202")!;
    expect(target.key).toBe(original[0].key);
    expect(target.startMs).toBe(Date.parse("2026-09-23T10:15:00+08:00"));
    expect(buildPhoneCalendarEvents(context([cancel]))).toHaveLength(2);
    const ics = buildScheduleIcs(context([move]));
    expect(ics).toContain("UID:math-1@kezhi.local");
    expect(ics).toContain("20260923T101500");
    expect(ics).not.toContain("20260914T082000");
    expect(buildWeekSvg(context([cancel]), 1)).not.toContain(course.title);
    const one = context([cancel]);
    one.snapshot.courses = [{ ...course, weeks: [1] }];
    expect(buildScheduleCsv(one)).not.toContain(course.title);
  });
  it("omits cancelled reminders and schedules moved reminders at the new time", () => {
    const make = (change: CourseException) => buildReminderSchedule(resolveCourseOccurrences([course], [change], calendar), defaultPresets[0], calendar, { enabled: true, defaultMinutes: 15 }, new Date(2026, 8, 13));
    expect(make(cancel)).toHaveLength(2);
    const reminders = make(move);
    expect(reminders).toHaveLength(3);
    expect(reminders.find(r => r.body.includes("B202"))?.at).toEqual(new Date(2026, 8, 23, 10, 0));
  });
});
