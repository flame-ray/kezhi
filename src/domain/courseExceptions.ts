import type { CourseException, CourseMeeting } from "./schedule";
import type { ResolvedAcademicCalendar } from "./academicCalendar";
import { isTeachingDate } from "./academicCalendar";
import { academicPositionForDate } from "./dayAgenda";
import { isDateKey } from "./termDate";

export function occurrenceDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function dateFromOccurrenceKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export function normalizeCourseExceptions(value: unknown): CourseException[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 3000) throw new Error("单次调课记录格式或数量无效");
  const records = new Map<string, CourseException>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object") throw new Error("单次调课记录格式无效");
    const row = entry as CourseException;
    if (typeof row.courseId !== "string" || !row.courseId.trim() || row.courseId.length > 200 || !isDateKey(row.originalDate) || !["move", "cancel"].includes(row.kind)) throw new Error("单次调课课程或日期无效");
    if (row.kind === "move" && (!isDateKey(row.targetDate) || !Number.isInteger(row.startPeriod) || !Number.isInteger(row.endPeriod) || row.startPeriod! < 1 || row.endPeriod! < row.startPeriod! || row.endPeriod! > 30 || typeof row.location !== "string" || !row.location.trim() || row.location.length > 200)) throw new Error("单次调课的目标时间或教室无效");
    const normalized: CourseException = row.kind === "cancel" ? { courseId: row.courseId, originalDate: row.originalDate, kind: "cancel" }
      : { courseId: row.courseId, originalDate: row.originalDate, kind: "move", targetDate: row.targetDate, startPeriod: row.startPeriod, endPeriod: row.endPeriod, location: row.location!.trim() };
    records.set(`${row.courseId}|${row.originalDate}`, normalized);
  }
  return [...records.values()];
}

export function validateCourseException(course: CourseMeeting, change: CourseException, calendar: ResolvedAcademicCalendar): string | undefined {
  try { normalizeCourseExceptions([change]); } catch (error) { return String(error instanceof Error ? error.message : error); }
  const original = dateFromOccurrenceKey(change.originalDate);
  const source = academicPositionForDate(original, calendar);
  if (course.id !== change.courseId || course.day !== source.day || !course.weeks.includes(source.week) || !isTeachingDate(calendar, original) || course.status === "cancelled") return "所选日期没有这门课程，请选择实际上课日期";
  if (change.kind === "move") {
    const target = dateFromOccurrenceKey(change.targetDate!);
    const position = academicPositionForDate(target, calendar);
    if (position.week < 1 || position.week > 30 || !isTeachingDate(calendar, target)) return "调课日期必须在正式开课后的当前学期内（第 1–30 周）";
  }
  return undefined;
}

/** Check the destination against actual occurrences, excluding only the occurrence being edited. */
export function findOccurrenceConflicts(courses: CourseMeeting[], changes: CourseException[] | undefined, change: CourseException, calendar: ResolvedAcademicCalendar): CourseMeeting[] {
  const source = courses.find(course => course.id === change.courseId);
  if (change.kind !== "move" || !source || validateCourseException(source, change, calendar)) return [];
  const others = (changes ?? []).filter(entry => entry.courseId !== change.courseId || entry.originalDate !== change.originalDate);
  const position = academicPositionForDate(dateFromOccurrenceKey(change.targetDate!), calendar);
  return resolveCourseOccurrences(courses, others, calendar).filter(course => {
    if (course.status === "cancelled" || course.day !== position.day || !course.weeks.includes(position.week)) return false;
    if (!course.occurrence && course.id === change.courseId && change.targetDate === change.originalDate) return false;
    return course.startPeriod <= change.endPeriod! && course.endPeriod >= change.startPeriod!;
  }).sort((a, b) => a.startPeriod - b.startPeriod || a.id.localeCompare(b.id));
}

/** Expand date-specific overrides into the existing scheduling model without mutating originals. */
export function resolveCourseOccurrences(courses: CourseMeeting[], changes: CourseException[] | undefined, calendar: ResolvedAcademicCalendar): CourseMeeting[] {
  if (!changes?.length) return courses;
  const byCourse = new Map<string, CourseException[]>();
  for (const change of normalizeCourseExceptions(changes)) byCourse.set(change.courseId, [...(byCourse.get(change.courseId) ?? []), change]);
  return courses.flatMap(course => {
    if (course.occurrence) return [course];
    const active = (byCourse.get(course.id) ?? []).filter(change => !validateCourseException(course, change, calendar));
    if (!active.length) return [course];
    const remaining = new Set(course.weeks);
    const extra: CourseMeeting[] = [];
    for (const change of active) {
      const source = academicPositionForDate(dateFromOccurrenceKey(change.originalDate), calendar);
      remaining.delete(source.week);
      const occurrence = { courseId: course.id, originalDate: change.originalDate, originalWeek: source.week, kind: change.kind };
      const id = `${course.id}@${change.originalDate}`;
      const sameSlot = change.kind === "move" && change.targetDate === change.originalDate && change.startPeriod === course.startPeriod && change.endPeriod === course.endPeriod;
      if (!sameSlot) extra.push({ ...course, id: `${id}:from`, weeks: [source.week], status: "cancelled", occurrence: { ...occurrence, marker: true }, note: change.kind === "move" ? `本次已调至 ${change.targetDate} 第${change.startPeriod}–${change.endPeriod}节` : "仅本次停课" });
      if (change.kind === "move") {
        const target = academicPositionForDate(dateFromOccurrenceKey(change.targetDate!), calendar);
        extra.push({ ...course, id: `${id}:to`, day: target.day, weeks: [target.week], startPeriod: change.startPeriod!, endPeriod: change.endPeriod!, location: change.location!, status: "changed", occurrence, note: `由 ${change.originalDate} 单次调课${course.note ? ` · ${course.note}` : ""}` });
      }
    }
    return [{ ...course, weeks: [...remaining], suppressedWeeks: course.weeks.filter(week => !remaining.has(week)) }, ...extra];
  });
}
