import type {
  CourseMeeting,
  DayOfWeek,
  ScheduleSnapshot,
  TimetablePreset,
  WeekView,
} from "./schedule";

const DAY_IN_MS = 86_400_000;

export function buildWeekView(
  courses: CourseMeeting[],
  termStartsOn: Date,
  week: number,
): WeekView {
  const startsOn = new Date(termStartsOn.getTime() + (week - 1) * 7 * DAY_IN_MS);

  return {
    week,
    startsOn,
    days: Array.from({ length: 7 }, (_, index) => {
      const day = (index + 1) as DayOfWeek;
      return {
        day,
        date: new Date(startsOn.getTime() + index * DAY_IN_MS),
        meetings: courses
          .filter((course) => course.day === day && course.weeks.includes(week))
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
): CourseMeeting[] {
  return courses.map((course) => {
    if (course.id !== meetingId) return course;
    const span = course.endPeriod - course.startPeriod;
    return {
      ...course,
      day,
      startPeriod,
      endPeriod: startPeriod + span,
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
