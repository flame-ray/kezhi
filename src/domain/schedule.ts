export type DayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type StudentGrade = 1 | 2 | 3 | 4 | 5;

export const MIN_ACADEMIC_WEEK = 1;
export const MAX_ACADEMIC_WEEK = 30;

export type CourseStatus = "normal" | "changed" | "cancelled";

export interface CourseMeeting {
  id: string;
  courseCode: string;
  title: string;
  teacher: string;
  location: string;
  day: DayOfWeek;
  startPeriod: number;
  endPeriod: number;
  weeks: number[];
  color: CourseColor;
  status?: CourseStatus;
  note?: string;
  source?: "local" | "school";
  sourceKey?: string;
  reminderMinutes?: number;
  /** Derived for display/export only; never replaces the stored recurring course. */
  occurrence?: { courseId: string; originalDate: string; originalWeek: number; kind: "cancel" | "move"; marker?: boolean };
  suppressedWeeks?: number[];
}

export interface CourseException {
  courseId: string;
  originalDate: string;
  kind: "cancel" | "move";
  targetDate?: string;
  startPeriod?: number;
  endPeriod?: number;
  location?: string;
}

export type CourseColor =
  | "blue"
  | "teal"
  | "coral"
  | "violet"
  | "rose"
  | "amber"
  | "indigo";

export interface Period {
  index: number;
  start: string;
  end: string;
}

export interface TimetablePreset {
  id: string;
  name: string;
  periods: Period[];
}
export interface ReminderSettings {
  enabled: boolean;
  defaultMinutes: number;
}


export interface WeekView {
  week: number;
  startsOn: Date;
  days: Array<{
    day: DayOfWeek;
    date: Date;
    meetings: CourseMeeting[];
    inactiveMeetings?: CourseMeeting[];
    beforeTeaching?: boolean;
  }>;
}

export interface ScheduleSnapshot {
  courses: CourseMeeting[];
  presets: TimetablePreset[];
  activePresetId: string;
  schoolName?: string;
  schoolId?: string;
  accountId?: string;
  academicYear?: number;
  semester?: 1 | 2;
  studentGrade?: StudentGrade;
  termStartsOn?: string;
  teachingStartsOn?: string;
  lastSyncAt?: string;
  reminderSettings?: ReminderSettings;
  selectionAssistant?: SelectionAssistantState;
  grades?: GradeRecord[];
  courseExceptions?: CourseException[];
  importBackup?: ImportSafetyBackup;
}
export interface ImportSafetyBackup { createdAt: string; reason: string; data: string }
import type { GradeRecord } from "../grades/gradeCenter";
import type { SelectionAssistantState } from "../selection/selectionAssistant";
