import type { CourseColor, CourseMeeting, DayOfWeek } from "../domain/schedule";

export interface ScheduleAdapterResult {
  courses: CourseMeeting[];
  sourceRows: number;
  warnings: string[];
}

const colors: CourseColor[] = ["blue", "teal", "coral", "violet", "rose", "amber", "indigo"];

export function parseZhengfangSchedule(rows: unknown): ScheduleAdapterResult {
  if (!Array.isArray(rows)) throw new Error("课表数据不是有效的课程列表");

  const courses = new Map<string, CourseMeeting>();
  const warnings: string[] = [];
  rows.forEach((value, index) => {
    if (!isRecord(value)) {
      warnings.push(`第 ${index + 1} 条记录格式无效，已跳过`);
      return;
    }

    const title = readText(value, "kcmc");
    const day = parseDay(value.xqj, value.xqjmc);
    const periods = parsePeriods(readText(value, "jc", "jcs"));
    const weeks = parseWeeks(readText(value, "zcd", "zcdmc"));
    if (!title || !day || !periods || weeks.length === 0) {
      warnings.push(`第 ${index + 1} 条记录缺少课程名称、星期、节次或周次，已跳过`);
      return;
    }

    const courseCode = readText(value, "kch_id", "kch") || "ZF-COURSE";
    const teacher = readText(value, "xm", "jsxm", "jsxx") || "未设置教师";
    const location = readText(value, "cdmc", "jxdd") || "未设置教室";
    const className = readText(value, "jxbmc");
    const sourceKey = readText(value, "jxb_id", "do_jxb_id") || [courseCode, title, teacher].join("|");
    const identity = [courseCode, title, day, periods.start, periods.end, weeks.join("."), location, teacher].join("|");
    const hash = stableHash(identity);
    const id = `zf-${hash.toString(36)}`;
    courses.set(id, {
      id,
      courseCode,
      title,
      teacher,
      location,
      day,
      startPeriod: periods.start,
      endPeriod: periods.end,
      weeks,
      color: colors[stableHash(sourceKey) % colors.length],
      status: "normal",
      note: className ? `教学班：${className}` : undefined,
      source: "school",
      sourceKey,
    });
  });

  return { courses: [...courses.values()], sourceRows: rows.length, warnings };
}

export function parseWeeks(value: string): number[] {
  const normalized = value
    .replaceAll("（", "(")
    .replaceAll("）", ")")
    .replace(/[，、；;]/g, ",")
    .replace(/\s+/g, "")
    .replace(/单周/g, "周(单)")
    .replace(/双周/g, "周(双)");
  const weeks = new Set<number>();

  for (const segment of normalized.split(",")) {
    const range = segment.match(/(\d{1,2})(?:-(\d{1,2}))?/);
    if (!range) continue;
    const start = Number(range[1]);
    const end = Number(range[2] ?? range[1]);
    const parity = segment.includes("(单)") ? 1 : segment.includes("(双)") ? 0 : undefined;
    if (start < 1 || end > 30 || end < start) continue;
    for (let week = start; week <= end; week += 1) {
      if (parity === undefined || week % 2 === parity) weeks.add(week);
    }
  }

  return [...weeks].sort((left, right) => left - right);
}

function parseDay(rawDay: unknown, rawLabel: unknown): DayOfWeek | undefined {
  const numeric = typeof rawDay === "number" ? rawDay : Number.parseInt(String(rawDay ?? ""), 10);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 7) return numeric as DayOfWeek;
  if (typeof rawLabel !== "string") return undefined;
  const chineseDays = ["一", "二", "三", "四", "五", "六", "日"];
  const index = chineseDays.findIndex((day) => rawLabel.includes(day));
  return index >= 0 ? (index + 1) as DayOfWeek : undefined;
}

function parsePeriods(value: string): { start: number; end: number } | undefined {
  const values = value.match(/\d{1,2}/g)?.map(Number).filter((period) => period >= 1 && period <= 30);
  if (!values?.length) return undefined;
  const start = Math.min(...values);
  const end = Math.max(...values);
  return { start, end };
}

function readText(record: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 200);
    if (typeof value === "number") return String(value);
  }
  return "";
}

function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
