import { describe, expect, test } from "vitest";
import type { CourseMeeting, TimetablePreset } from "../domain/schedule";
import { buildReminderSchedule, effectiveReminderMinutes, isCourseReminderNotificationId, normalizeReminderSettings } from "./reminderSchedule";

const preset: TimetablePreset = {
  id: "test",
  name: "测试作息",
  periods: [
    { index: 1, start: "08:20", end: "09:05" },
    { index: 2, start: "09:10", end: "09:55" },
  ],
};

const course: CourseMeeting = {
  id: "math",
  courseCode: "MATH101",
  title: "高等数学",
  teacher: "林老师",
  location: "A101",
  day: 1,
  startPeriod: 1,
  endPeriod: 2,
  weeks: [1, 2, 3],
  color: "blue",
};

const calendar = {
  weekOneStartsOn: new Date(2026, 8, 14, 12),
  teachingStartsOn: new Date(2026, 8, 14, 12),
};

describe("course reminder schedule", () => {
  test("normalizes old snapshots and resolves per-course overrides", () => {
    const settings = normalizeReminderSettings({ enabled: true, defaultMinutes: 15 });
    expect(effectiveReminderMinutes(course, settings)).toBe(15);
    expect(effectiveReminderMinutes({ ...course, reminderMinutes: 30 }, settings)).toBe(30);
    expect(effectiveReminderMinutes({ ...course, reminderMinutes: 0 }, settings)).toBe(0);
    expect(normalizeReminderSettings({ enabled: true, defaultMinutes: 999 })).toEqual({ enabled: true, defaultMinutes: 15 });
  });

  test("uses the actual term date, week and active timetable start time", () => {
    const reminders = buildReminderSchedule(
      [course],
      preset,
      calendar,
      { enabled: true, defaultMinutes: 15 },
      new Date(2026, 8, 13, 12),
    );
    expect(reminders).toHaveLength(3);
    expect(reminders[0].at).toEqual(new Date(2026, 8, 14, 8, 5));
    expect(reminders[1].at).toEqual(new Date(2026, 8, 21, 8, 5));
    expect(reminders[0].body).toContain("A101");
    expect(reminders.every((reminder) => isCourseReminderNotificationId(reminder.id))).toBe(true);
    expect(new Set(reminders.map((reminder) => reminder.id)).size).toBe(reminders.length);
  });

  test("skips disabled, cancelled and past occurrences and caps the queue", () => {
    const now = new Date(2026, 8, 20, 12);
    expect(buildReminderSchedule([course], preset, calendar, { enabled: false, defaultMinutes: 15 }, now)).toEqual([]);
    expect(buildReminderSchedule([{ ...course, reminderMinutes: 0 }], preset, calendar, { enabled: true, defaultMinutes: 15 }, now)).toEqual([]);
    expect(buildReminderSchedule([{ ...course, status: "cancelled" }], preset, calendar, { enabled: true, defaultMinutes: 15 }, now)).toEqual([]);
    expect(buildReminderSchedule([course], preset, calendar, { enabled: true, defaultMinutes: 15 }, now, 1)).toHaveLength(1);
  });

  test("does not schedule freshman classes before the Thursday teaching start", () => {
    const reminders = buildReminderSchedule(
      [course],
      preset,
      { ...calendar, teachingStartsOn: new Date(2026, 8, 17, 12) },
      { enabled: true, defaultMinutes: 15 },
      new Date(2026, 8, 13, 12),
    );
    expect(reminders).toHaveLength(2);
    expect(reminders[0].at).toEqual(new Date(2026, 8, 21, 8, 5));
  });
});
