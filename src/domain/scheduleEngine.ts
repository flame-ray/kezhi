import type {
  CourseMeeting,
  DayOfWeek,
  ScheduleSnapshot,
  TimetablePreset,
  WeekView,
} from "./schedule";
import { dateForCourse, isTeachingDate, type ResolvedAcademicCalendar } from "./academicCalendar";

export function buildWeekView(
  courses: CourseMeeting[],
  calendar: ResolvedAcademicCalendar,
  week: number,
): WeekView {
  const startsOn = dateForCourse(calendar, week, 1);

  return {
    week,
    startsOn,
    days: Array.from({ length: 7 }, (_, index) => {
      const day = (index + 1) as DayOfWeek;
      const date = dateForCourse(calendar, week, day);
      return {
        day,
        date,
        meetings: courses
          .filter((course) => isTeachingDate(calendar, date) && course.day === day && course.weeks.includes(week))
          .sort((a, b) => a.startPeriod - b.startPeriod),
      };
    }),
  };
}

export function moveMeeting(
  courses: CourseMeeting[],
  meetingId: string,
  day: DayOfWeek,
  startPeriod: number,
  maxPeriod?: number,
): CourseMeeting[] {
  return courses.map((course) => {
    if (course.id !== meetingId) return course;
    const span = Math.max(0, course.endPeriod - course.startPeriod);
    const requestedStart = Number.isFinite(startPeriod) ? Math.round(startPeriod) : course.startPeriod;
    const lastStart = Number.isFinite(maxPeriod)
      ? Math.max(1, Math.floor(maxPeriod as number) - span)
      : Number.POSITIVE_INFINITY;
    const safeStart = Math.max(1, Math.min(requestedStart, lastStart));
    return {
      ...course,
      day,
      startPeriod: safeStart,
      endPeriod: safeStart + span,
      status: "changed",
    };
  });
}

export function activePreset(snapshot: ScheduleSnapshot): TimetablePreset {
  return (
    snapshot.presets.find((preset) => preset.id === snapshot.activePresetId) ??
    snapshot.presets[0]
  );
}

export function formatWeekRange(view: WeekView): string {
  const lastDate = view.days[6].date;
  const startMonth = view.startsOn.getMonth() + 1;
  const endMonth = lastDate.getMonth() + 1;
  if (startMonth === endMonth) {
    return `${view.startsOn.getFullYear()}年${startMonth}月${view.startsOn.getDate()}–${lastDate.getDate()}日`;
  }
  return `${startMonth}月${view.startsOn.getDate()}日–${endMonth}月${lastDate.getDate()}日`;
}
