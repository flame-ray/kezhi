import type { CourseMeeting, ScheduleSnapshot, StudentGrade } from "./schedule";
import {
  normalizeTeachingStartKey,
  normalizeTermStartKey,
  resolveTeachingStartDate,
  resolveTermStartDate,
  suggestTermStartKey,
} from "./termDate";

export interface AcademicCalendarSettings {
  studentGrade: StudentGrade;
  termStartsOn: string;
  teachingStartsOn: string;
}

export interface ResolvedAcademicCalendar {
  weekOneStartsOn: Date;
  teachingStartsOn: Date;
}

export interface AcademicCalendarSuggestion extends AcademicCalendarSettings {
  inferredFromAccount: boolean;
  importWeekOffset: number;
  source: "official" | "estimated";
  description: string;
}

interface SuggestionInput {
  schoolId?: string;
  academicYear: number;
  semester: 1 | 2;
  loginName?: string;
  studentGrade?: number;
}

interface KnownCalendar {
  continuingWeekOne: string;
  continuingTeaching: string;
  freshmanWeekOne: string;
  freshmanTeaching: string;
}

const NDNU_CALENDARS: Record<string, KnownCalendar> = {
  "2025-1": {
    continuingWeekOne: "2025-09-08",
    continuingTeaching: "2025-09-08",
    freshmanWeekOne: "2025-09-15",
    freshmanTeaching: "2025-09-18",
  },
  "2026-1": {
    continuingWeekOne: "2026-08-31",
    continuingTeaching: "2026-08-31",
    freshmanWeekOne: "2026-09-14",
    freshmanTeaching: "2026-09-17",
  },
  "2026-2": {
    continuingWeekOne: "2027-02-22",
    continuingTeaching: "2027-02-23",
    freshmanWeekOne: "2027-02-22",
    freshmanTeaching: "2027-02-23",
  },
};

export function inferStudentGrade(academicYear: number, loginName?: string): StudentGrade | undefined {
  const match = /^(20\d{2})/.exec(loginName?.trim() ?? "");
  if (!match) return undefined;
  const grade = academicYear - Number(match[1]) + 1;
  return normalizeStudentGrade(grade);
}

export function suggestAcademicCalendar(input: SuggestionInput): AcademicCalendarSuggestion {
  const inferredGrade = inferStudentGrade(input.academicYear, input.loginName);
  const explicitGrade = normalizeStudentGrade(input.studentGrade);
  const studentGrade = explicitGrade ?? inferredGrade ?? 1;
  const known = input.schoolId === "ndnu"
    ? NDNU_CALENDARS[`${input.academicYear}-${input.semester}`]
    : undefined;

  if (known) {
    const freshman = studentGrade === 1;
    return {
      studentGrade,
      termStartsOn: freshman ? known.freshmanWeekOne : known.continuingWeekOne,
      teachingStartsOn: freshman ? known.freshmanTeaching : known.continuingTeaching,
      importWeekOffset: freshman ? weeksBetween(known.continuingWeekOne, known.freshmanWeekOne) : 0,
      inferredFromAccount: explicitGrade === undefined && inferredGrade !== undefined,
      source: "official",
      description: freshman && input.academicYear === 2026 && input.semester === 1
        ? "大一第 1 周从 9 月 14 日周一计，9 月 17 日周四正式上课"
        : `已按${gradeLabel(studentGrade)}校历设置`,
    };
  }

  const termStartsOn = suggestTermStartKey(input.academicYear, input.semester);
  return {
    studentGrade,
    termStartsOn,
    teachingStartsOn: termStartsOn,
    importWeekOffset: 0,
    inferredFromAccount: explicitGrade === undefined && inferredGrade !== undefined,
    source: "estimated",
    description: `已按${gradeLabel(studentGrade)}生成建议，请对照学校校历确认`,
  };
}

export function normalizeAcademicCalendar(snapshot: Pick<
  ScheduleSnapshot,
  "schoolId" | "academicYear" | "semester" | "studentGrade" | "termStartsOn" | "teachingStartsOn"
>): AcademicCalendarSettings {
  const academicYear = snapshot.academicYear ?? 2026;
  const semester = snapshot.semester ?? 1;
  const normalizedTerm = normalizeTermStartKey(snapshot.termStartsOn);
  const known = snapshot.schoolId === "ndnu" ? NDNU_CALENDARS[`${academicYear}-${semester}`] : undefined;
  const legacyGrade = known && normalizedTerm === known.freshmanWeekOne ? 1 : undefined;
  const studentGrade = normalizeStudentGrade(snapshot.studentGrade) ?? legacyGrade ?? 1;
  const suggestion = suggestAcademicCalendar({
    schoolId: snapshot.schoolId,
    academicYear,
    semester,
    studentGrade,
  });
  const suggestedTeaching = suggestion.termStartsOn === normalizedTerm
    ? suggestion.teachingStartsOn
    : normalizedTerm;
  return {
    studentGrade,
    termStartsOn: normalizedTerm,
    teachingStartsOn: normalizeTeachingStartKey(snapshot.teachingStartsOn, normalizedTerm, suggestedTeaching),
  };
}

export function resolveAcademicCalendar(settings: Pick<AcademicCalendarSettings, "termStartsOn" | "teachingStartsOn">): ResolvedAcademicCalendar {
  const weekOneStartsOn = resolveTermStartDate(settings.termStartsOn);
  return {
    weekOneStartsOn,
    teachingStartsOn: resolveTeachingStartDate(settings.teachingStartsOn, settings.termStartsOn),
  };
}

export function alignImportedWeeks(courses: CourseMeeting[], weekOffset: number): { courses: CourseMeeting[]; appliedOffset: number } {
  if (!Number.isInteger(weekOffset) || weekOffset <= 0 || courses.length === 0) {
    return { courses, appliedOffset: 0 };
  }
  const earliestWeek = Math.min(...courses.flatMap((course) => course.weeks));
  if (!Number.isFinite(earliestWeek) || earliestWeek <= weekOffset) {
    return { courses, appliedOffset: 0 };
  }
  return {
    courses: courses.map((course) => ({
      ...course,
      weeks: course.weeks.map((week) => week - weekOffset).filter((week) => week >= 1),
    })),
    appliedOffset: weekOffset,
  };
}

function weeksBetween(earlier: string, later: string): number {
  return Math.max(0, Math.round((Date.parse(`${later}T12:00:00`) - Date.parse(`${earlier}T12:00:00`)) / (7 * 86_400_000)));
}

export function dateForCourse(calendar: ResolvedAcademicCalendar, week: number, day: number): Date {
  const date = new Date(calendar.weekOneStartsOn);
  date.setDate(date.getDate() + (week - 1) * 7 + day - 1);
  return date;
}

export function isTeachingDate(calendar: ResolvedAcademicCalendar, date: Date): boolean {
  return dateOnlyStamp(date) >= dateOnlyStamp(calendar.teachingStartsOn);
}

function dateOnlyStamp(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12).getTime();
}

function normalizeStudentGrade(value: unknown): StudentGrade | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5
    ? value as StudentGrade
    : undefined;
}

function gradeLabel(grade: StudentGrade): string {
  return `大${["一", "二", "三", "四", "五"][grade - 1]}`;
}
