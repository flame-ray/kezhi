import { dateForCourse, isTeachingDate, type ResolvedAcademicCalendar } from '../domain/academicCalendar';
import { occurrenceDateKey } from '../domain/courseExceptions';
import type { CourseMeeting, TimetablePreset } from '../domain/schedule';

export interface WidgetEvent { date: string; start: string; end: string; title: string; location: string }
export interface WidgetSnapshot { version: 1; events: WidgetEvent[] }

// Only display data crosses into the widget cache: no credentials, accounts or grades.
// Store the whole supported semester, not a rolling window requiring the WebView.
export function buildWidgetSnapshot(courses: CourseMeeting[], calendar: ResolvedAcademicCalendar, preset: TimetablePreset): WidgetSnapshot {
  const events: WidgetEvent[] = [];
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  for (const course of courses) {
    if (course.status === 'cancelled') continue;
    const start = preset.periods.find(p => p.index === course.startPeriod)?.start;
    const end = preset.periods.find(p => p.index === course.endPeriod)?.end;
    if (!start || !end || !time.test(start) || !time.test(end) || end <= start) continue;
    for (const week of new Set(course.weeks)) {
      if (!Number.isInteger(week) || week < 1 || week > 30) continue;
      const date = dateForCourse(calendar, week, course.day);
      if (!isTeachingDate(calendar, date)) continue;
      events.push({date: occurrenceDateKey(date), start, end, title: course.title.slice(0,120), location: course.location.slice(0,120)});
    }
  }
  if (events.length > 10000) throw new Error('课程场次过多，桌面小组件暂未更新');
  events.sort((a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start)||a.title.localeCompare(b.title));
  return {version:1,events};
}
