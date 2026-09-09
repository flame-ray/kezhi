import { dateForCourse, isTeachingDate } from "../domain/academicCalendar";
import { effectiveReminderMinutes, normalizeReminderSettings } from "../reminders/reminderSchedule";
import type { ExportContext } from "./scheduleExport";

export interface PhoneCalendarEvent {
  key: string;
  title: string;
  location: string;
  description: string;
  startMs: number;
  endMs: number;
  reminderMinutes: number;
}

export function buildPhoneCalendarEvents(context: ExportContext): PhoneCalendarEvent[] {
  const { snapshot, preset, calendar } = context;
  const settings = normalizeReminderSettings(snapshot.reminderSettings);
  const dayKey = (date: Date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  // Correcting the opening date must update existing entries, not create duplicates.
  const scope = [snapshot.schoolId ?? snapshot.schoolName ?? "local", snapshot.academicYear ?? calendar.weekOneStartsOn.getFullYear(), snapshot.semester ?? 1];
  const events = new Map<string, PhoneCalendarEvent>();
  for (const course of snapshot.courses) {
    const start = preset.periods.find(p => p.index === course.startPeriod)?.start;
    const end = preset.periods.find(p => p.index === course.endPeriod)?.end;
    if (!start || !end || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) throw new Error("课程作息时间不完整，请先检查节次设置");
    for (const week of new Set(course.weeks)) {
      const date = dateForCourse(calendar, week, course.day);
      if (!isTeachingDate(calendar, date)) continue;
      // School timetable time is Asia/Shanghai, independent of phone timezone.
      const startMs = Date.parse(dayKey(date) + "T" + start + ":00+08:00");
      const endMs = Date.parse(dayKey(date) + "T" + end + ":00+08:00");
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) throw new Error("课程结束时间必须晚于开始时间");
      const key = JSON.stringify([...scope, course.id, week]);
      events.set(key, {
        key, title: course.title, location: course.location,
        description: [context.termName, course.teacher, "第" + week + "周 · 第" + course.startPeriod + "-" + course.endPeriod + "节", course.note].filter(Boolean).join("\n"),
        startMs, endMs, reminderMinutes: settings.enabled ? effectiveReminderMinutes(course, settings) : 0,
      });
    }
  }
  if (events.size > 3000) throw new Error("一次最多导入 3000 节课程，请先缩小课表范围");
  return [...events.values()].sort((a, b) => a.startMs - b.startMs || a.key.localeCompare(b.key));
}
