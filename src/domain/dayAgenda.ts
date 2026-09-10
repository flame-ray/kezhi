import { isTeachingDate, type ResolvedAcademicCalendar } from "./academicCalendar";
import type { CourseMeeting, DayOfWeek, TimetablePreset } from "./schedule";

export interface AcademicDatePosition {
  week: number;
  day: DayOfWeek;
}

export type AgendaCourseState = "upcoming" | "active" | "finished" | "scheduled" | "cancelled";

export function academicPositionForDate(date: Date, calendar: ResolvedAcademicCalendar): AcademicDatePosition {
  const target = localNoon(date);
  const weekOne = localNoon(calendar.weekOneStartsOn);
  return {
    week: Math.floor((target.getTime() - weekOne.getTime()) / (7 * 86_400_000)) + 1,
    day: (((target.getDay() + 6) % 7) + 1) as DayOfWeek,
  };
}

export function coursesForAcademicDate(courses: CourseMeeting[], calendar: ResolvedAcademicCalendar, date: Date): CourseMeeting[] {
  if (!isTeachingDate(calendar, date)) return [];
  const { week, day } = academicPositionForDate(date, calendar);
  if (week < 1 || week > 30) return [];
  return courses
    .filter((course) => course.day === day && course.weeks.includes(week))
    .sort((left, right) => left.startPeriod - right.startPeriod || left.endPeriod - right.endPeriod);
}

export function agendaCourseState(course: CourseMeeting, preset: TimetablePreset, selectedDate: Date, now = new Date()): AgendaCourseState {
  if (course.status === "cancelled") return "cancelled";
  if (!sameLocalDate(selectedDate, now)) return "scheduled";
  const start = preset.periods.find((period) => period.index === course.startPeriod)?.start;
  const end = preset.periods.find((period) => period.index === course.endPeriod)?.end;
  if (!start || !end) return "scheduled";
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  if (currentMinutes < minutes(start)) return "upcoming";
  if (currentMinutes <= minutes(end)) return "active";
  return "finished";
}

export function sameLocalDate(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

function minutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function localNoon(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12);
}
