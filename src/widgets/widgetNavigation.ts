import { dateForCourse, type ResolvedAcademicCalendar } from '../domain/academicCalendar';
import { occurrenceDateKey, dateFromOccurrenceKey } from '../domain/courseExceptions';
import type { CourseMeeting } from '../domain/schedule';

export interface WidgetTarget { id: string; date: string; token: string }
export function parseWidgetTarget(value: unknown): WidgetTarget | undefined {
  if (!value || typeof value !== 'object') return;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || !row.id || row.id.length > 512 || typeof row.token !== 'string' || !row.token || row.token.length > 128 || typeof row.date !== 'string') return;
  try { if (occurrenceDateKey(dateFromOccurrenceKey(row.date)) !== row.date) return; } catch { return; }
  return {id:row.id,date:row.date,token:row.token};
}
export function resolveWidgetCourse(target: WidgetTarget, courses: CourseMeeting[], calendar: ResolvedAcademicCalendar): CourseMeeting | undefined {
  return courses.find(course => course.id === target.id && course.status !== 'cancelled'
    && course.weeks.some(week => occurrenceDateKey(dateForCourse(calendar, week, course.day)) === target.date));
}
