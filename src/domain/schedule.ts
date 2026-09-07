export type DayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type StudentGrade = 1 | 2 | 3 | 4 | 5;

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
}
