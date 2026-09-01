import type { CourseColor, CourseMeeting, CourseStatus, DayOfWeek, ScheduleSnapshot, TimetablePreset } from "../domain/schedule";
import { normalizeTermStartKey } from "../domain/termDate";

const colors: CourseColor[] = ["blue", "teal", "coral", "violet", "rose", "amber", "indigo"];
const statuses: CourseStatus[] = ["normal", "changed", "cancelled"];

export function parseScheduleBackup(text: string): ScheduleSnapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("文件不是有效的 JSON 备份");
  }

  if (!isRecord(raw) || raw.format !== "kezhi-schedule" || raw.version !== 1) {
    throw new Error("这不是受支持的课织备份文件");
  }
  if (!Array.isArray(raw.courses) || !Array.isArray(raw.presets)) {
    throw new Error("备份缺少课程或作息数据");
  }

  const courses = raw.courses.map(parseCourse);
  const presets = raw.presets.map(parsePreset);
  if (!presets.length) throw new Error("备份中没有可用的作息方案");

  const requestedPreset = typeof raw.activePresetId === "string" ? raw.activePresetId : presets[0].id;
  const activePresetId = presets.some((preset) => preset.id === requestedPreset) ? requestedPreset : presets[0].id;

  const nestedTermStart = isRecord(raw.term) ? raw.term.startsOn : undefined;
  return {
    courses,
    presets,
    activePresetId,
    schoolName: typeof raw.schoolName === "string" && raw.schoolName.trim() ? raw.schoolName.trim().slice(0, 100) : undefined,
    schoolId: safeIdentifier(raw.schoolId),
    accountId: safeIdentifier(raw.accountId),
    academicYear: numberInRange(raw.academicYear, 2000, 2100),
    semester: numberInRange(raw.semester, 1, 2) as 1 | 2 | undefined,
    termStartsOn: normalizeTermStartKey(typeof raw.termStartsOn === "string" ? raw.termStartsOn : typeof nestedTermStart === "string" ? nestedTermStart : undefined),
    lastSyncAt: safeIsoDate(raw.lastSyncAt),
  };
}

function parseCourse(value: unknown, index: number): CourseMeeting {
  if (!isRecord(value)) throw new Error(`第 ${index + 1} 条课程格式不正确`);
  const day = numberInRange(value.day, 1, 7);
  const startPeriod = numberInRange(value.startPeriod, 1, 30);
  if (!day || !startPeriod) throw new Error(`第 ${index + 1} 条课程的时间无效`);
  const endPeriod = numberInRange(value.endPeriod, startPeriod, 30);
  if (!endPeriod) throw new Error(`第 ${index + 1} 条课程的时间无效`);
  if (!Array.isArray(value.weeks)) throw new Error(`第 ${index + 1} 条课程缺少周次`);
  const weeks = [...new Set(value.weeks.map((week) => numberInRange(week, 1, 30)).filter((week): week is number => Boolean(week)))].sort((a, b) => a - b);
  if (!weeks.length) throw new Error(`第 ${index + 1} 条课程没有有效周次`);

  return {
    id: requiredText(value.id, "课程ID", index),
    courseCode: optionalText(value.courseCode, "MANUAL"),
    title: requiredText(value.title, "课程名称", index),
    teacher: optionalText(value.teacher, "未设置教师"),
    location: optionalText(value.location, "未设置教室"),
    day: day as DayOfWeek,
    startPeriod,
    endPeriod,
    weeks,
    color: colors.includes(value.color as CourseColor) ? value.color as CourseColor : "blue",
    status: statuses.includes(value.status as CourseStatus) ? value.status as CourseStatus : "normal",
    note: typeof value.note === "string" ? value.note.slice(0, 500) : undefined,
    source: value.source === "school" ? "school" : value.source === "local" ? "local" : undefined,
    sourceKey: typeof value.sourceKey === "string" && value.sourceKey.trim() ? value.sourceKey.trim().slice(0, 300) : undefined,
  };
}

function parsePreset(value: unknown, index: number): TimetablePreset {
  if (!isRecord(value) || !Array.isArray(value.periods)) throw new Error(`第 ${index + 1} 个作息方案格式不正确`);
  const id = requiredText(value.id, "作息方案ID", index);
  const periods = value.periods.map((period, periodIndex) => {
    if (!isRecord(period)) throw new Error(`${id} 的第 ${periodIndex + 1} 节格式不正确`);
    const itemIndex = numberInRange(period.index, 1, 30);
    if (!itemIndex || !isTime(period.start) || !isTime(period.end)) throw new Error(`${id} 的第 ${periodIndex + 1} 节时间无效`);
    return { index: itemIndex, start: period.start as string, end: period.end as string };
  });
  return { id, name: optionalText(value.name, `作息方案 ${index + 1}`), periods };
}

function requiredText(value: unknown, label: string, index: number): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`第 ${index + 1} 条记录缺少${label}`);
  return value.trim().slice(0, 200);
}

function optionalText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 200) : fallback;
}

function numberInRange(value: unknown, min: number, max: number): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : undefined;
}

function isTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeIdentifier(value: unknown): string | undefined {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(value) ? value : undefined;
}

function safeIsoDate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}
