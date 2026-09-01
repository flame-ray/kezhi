import type { CourseMeeting, ReminderSettings, TimetablePreset } from "../domain/schedule";

const MINUTE_MS = 60_000;
const COURSE_NOTIFICATION_ID_MIN = 1_000_000_000;
const COURSE_NOTIFICATION_ID_MAX = 1_999_999_999;

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: false,
  defaultMinutes: 15,
};

export interface ScheduledCourseReminder {
  id: number;
  key: string;
  courseId: string;
  week: number;
  minutesBefore: number;
  at: Date;
  title: string;
  body: string;
}

export function normalizeReminderSettings(value: unknown): ReminderSettings {
  if (!isRecord(value)) return { ...DEFAULT_REMINDER_SETTINGS };
  const defaultMinutes = validReminderMinutes(value.defaultMinutes)
    ? value.defaultMinutes
    : DEFAULT_REMINDER_SETTINGS.defaultMinutes;
  return { enabled: value.enabled === true, defaultMinutes };
}

export function effectiveReminderMinutes(course: CourseMeeting, settings: ReminderSettings): number {
  if (course.reminderMinutes === 0) return 0;
  if (validReminderMinutes(course.reminderMinutes)) return course.reminderMinutes;
  return settings.defaultMinutes;
}

export function buildReminderSchedule(
  courses: CourseMeeting[],
  preset: TimetablePreset,
  termStartsOn: Date,
  settings: ReminderSettings,
  now = new Date(),
  limit = 128,
): ScheduledCourseReminder[] {
  if (!settings.enabled || limit <= 0) return [];
  const startsByPeriod = new Map(preset.periods.map((period) => [period.index, period.start]));
  const candidates = courses.flatMap((course) => {
    if (course.status === "cancelled") return [];
    const minutesBefore = effectiveReminderMinutes(course, settings);
    const startTime = startsByPeriod.get(course.startPeriod);
    if (minutesBefore <= 0 || !startTime) return [];

    return course.weeks.flatMap((week) => {
      const startsAt = occurrenceDate(termStartsOn, week, course.day, startTime);
      const at = new Date(startsAt.getTime() - minutesBefore * MINUTE_MS);
      if (at.getTime() <= now.getTime()) return [];
      const key = `${course.id}:${week}:${course.day}:${startTime}:${minutesBefore}`;
      return [{
        id: stableNotificationId(key),
        key,
        courseId: course.id,
        week,
        minutesBefore,
        at,
        title: `${minutesBefore} 分钟后上课 · ${course.title}`,
        body: `${course.location} · ${course.teacher} · 第${course.startPeriod}–${course.endPeriod}节`,
      }];
    });
  }).sort((left, right) => left.at.getTime() - right.at.getTime());

  const usedIds = new Set<number>();
  return candidates.slice(0, limit).map((candidate) => {
    let id = candidate.id;
    while (usedIds.has(id)) id = id === COURSE_NOTIFICATION_ID_MAX ? COURSE_NOTIFICATION_ID_MIN : id + 1;
    usedIds.add(id);
    return id === candidate.id ? candidate : { ...candidate, id };
  });
}

function occurrenceDate(termStartsOn: Date, week: number, day: number, time: string): Date {
  const [hour, minute] = time.split(":").map(Number);
  const date = new Date(
    termStartsOn.getFullYear(),
    termStartsOn.getMonth(),
    termStartsOn.getDate(),
    hour,
    minute,
    0,
    0,
  );
  date.setDate(date.getDate() + (week - 1) * 7 + day - 1);
  return date;
}

function stableNotificationId(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return COURSE_NOTIFICATION_ID_MIN + ((hash >>> 0) % (COURSE_NOTIFICATION_ID_MAX - COURSE_NOTIFICATION_ID_MIN + 1));
}

export function isCourseReminderNotificationId(id: number): boolean {
  return Number.isInteger(id) && id >= COURSE_NOTIFICATION_ID_MIN && id <= COURSE_NOTIFICATION_ID_MAX;
}

function validReminderMinutes(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 180;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
