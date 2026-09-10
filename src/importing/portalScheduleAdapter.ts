import type { CourseColor, CourseMeeting, DayOfWeek } from "../domain/schedule";
import type { PortalPageSnapshot, PortalTableSignal } from "../selection/selectionAssistant";
import { parseConfirmedPortalWeeks, type PortalWeekReview } from "./portalWeekReview";

export interface PortalScheduleResult { courses: CourseMeeting[]; weekReviews: PortalWeekReview[]; sourceRows: number; warnings: string[]; }
const colors: CourseColor[] = ["blue", "teal", "coral", "violet", "rose", "amber", "indigo"];
const dayWords = ["一", "二", "三", "四", "五", "六", "日"];

/** 从登录后页面中的常见 HTML 课表矩阵读取课程。页面只在本机解析。 */
export function parsePortalSchedule(snapshot: PortalPageSnapshot): PortalScheduleResult {
  const courses = new Map<string, CourseMeeting>();
  const weekReviews = new Map<string, PortalWeekReview>();
  const warnings: string[] = [...(snapshot.warnings ?? [])];
  let sourceRows = 0;
  for (const table of snapshot.tables ?? []) {
    const header = findHeader(table);
    const dayColumns = header.columns;
    if (dayColumns.size === 0) continue;
    const dataRows = table.rows.slice(header.row + 1);
    for (const [rowIndex, row] of dataRows.entries()) {
      sourceRows += 1;
      const period = rowPeriod(row, Math.min(...dayColumns.keys()));
      if (!period) continue;
      for (const [column, day] of dayColumns) {
        const raw = normalizeCell(row[column] ?? "");
        if (!raw || isTimeOnly(raw) || /^(无课|暂无|空白|--|-)$/.test(raw)) continue;
        const span = table.spans?.find(span => span.row === header.row + 1 + rowIndex && span.column === column);
        const lastRow = span ? table.rows[span.row + span.rowSpan - 1] : undefined;
        const lastPeriod = lastRow ? rowPeriod(lastRow, Math.min(...dayColumns.keys())) : undefined;
        const parsed = parseCell(raw, { ...period, endPeriod: lastPeriod?.endPeriod ?? period.endPeriod });
        if (!parsed) { warnings.push(`网页课表第 ${sourceRows} 行的${dayLabel(day)}课程格式无法识别`); continue; }
        const identity = [snapshot.pageUrl, day, parsed.startPeriod, parsed.endPeriod, parsed.title, parsed.location, parsed.teacher, parsed.weeks.length ? parsed.weeks.join(",") : parsed.weekText].join("|");
        const id = `portal-${stableHash(identity).toString(36)}`;
        const course: Omit<CourseMeeting, "weeks"> = { id, courseCode: parsed.courseCode || "PORTAL-COURSE", title: parsed.title, teacher: parsed.teacher || "未设置教师", location: parsed.location || "未设置教室", day, startPeriod: parsed.startPeriod, endPeriod: parsed.endPeriod, color: colors[stableHash(parsed.title) % colors.length], status: "normal", source: "school", sourceKey: identity };
        if (parsed.weeks.length) courses.set(id, { ...course, weeks: parsed.weeks });
        else weekReviews.set(id, { course, sourceText: raw, parity: parsed.parity });
      }
    }
  }
  if (!courses.size && !weekReviews.size && (snapshot.tables?.length ?? 0) > 0) warnings.push("已读取网页表格，但没有找到带星期列和明确节次的课程矩阵");
  return { courses: [...courses.values()], weekReviews: [...weekReviews.values()], sourceRows, warnings };
}

function findHeader(table: PortalTableSignal) {
  for (let row = 0; row < Math.min(table.rows.length, 10); row++) {
    const columns = findDayColumns(table.rows[row]);
    if (columns.size >= 2) return { row, columns };
  }
  return { row: -1, columns: findDayColumns(table.headers) };
}
function rowPeriod(row: string[], beforeColumn: number) {
  for (let column = beforeColumn - 1; column >= 0; column--) {
    const period = parsePeriod(row[column] ?? "");
    if (period) return period;
  }
  return undefined;
}
function findDayColumns(header: string[]): Map<number, DayOfWeek> {
  const result = new Map<number, DayOfWeek>();
  header.forEach((value, index) => {
    const normalized = normalizeCell(value);
    const label = normalized.match(/(?:星期|周)([一二三四五六日天1-7])/);
    const word = label?.[1] ?? normalized;
    const found = dayWords.indexOf(word === "天" ? "日" : word);
    if (found >= 0) result.set(index, (found + 1) as DayOfWeek);
    else if (label && /^[1-7]$/.test(word)) result.set(index, Number(word) as DayOfWeek);
  });
  return result;
}
function parsePeriod(value: string): { startPeriod: number; endPeriod: number } | undefined {
  const label = normalizeCell(value).replace(/\d{1,2}[:：]\d{2}\s*[-~至—–]\s*\d{1,2}[:：]\d{2}/g, "").trim();
  const match = label.match(/^第?\s*(\d{1,2})(?:\s*[-~至—–、,]\s*(\d{1,2}))?\s*节?$/);
  if (!match) return undefined;
  const startPeriod = Number(match[1]), endPeriod = Number(match[2] ?? match[1]);
  return startPeriod >= 1 && endPeriod >= startPeriod && endPeriod <= 30 ? { startPeriod, endPeriod } : undefined;
}
function parseCell(raw: string, period: { startPeriod: number; endPeriod: number }) {
  const lines = raw.split(/[\n|；;]/).map((line) => line.trim()).filter(Boolean);
  const weekLines = lines.filter(line => /^(?:周次\s*[:：]?|第?\s*\d[^a-zA-Z]*周|[单双]周\s*$)/.test(line));
  const title = lines.find(line => !weekLines.includes(line) && !/^(?:(?:周次|节次|教师|老师|授课教师|教室|讲室|上课地点|地点|课程编号)\s*[:：]|(?:教室|讲室)\s|@|周[一二三四五六日天]|星期)/.test(line) && !isTimeOnly(line))?.slice(0, 120);
  if (!title) return undefined;
  const weekText = weekLines.join(",");
  // Parity alone does not identify the semester length. It remains a review requirement.
  const parity = weekText.includes("单") && !weekText.includes("双") ? "odd" as const : weekText.includes("双") && !weekText.includes("单") ? "even" as const : undefined;
  const weeks = parseConfirmedPortalWeeks(weekText);
  const location = lines.find(line => line !== title && /^(教室|讲室|上课地点|地点|@)/.test(line))?.replace(/^@/, "") ?? "";
  const teacher = lines.find(line => line !== title && /^(教师|老师|授课教师)\s*[:：]/.test(line))?.replace(/^(教师|老师|授课教师)\s*[:：]\s*/, "") ?? "";
  const code = lines.find((line) => /^[A-Za-z]{1,8}[-_]?[A-Za-z0-9]{2,20}$/.test(line)) ?? "";
  return { title, location, teacher, courseCode: code, weeks, weekText, parity, startPeriod: period.startPeriod, endPeriod: period.endPeriod };
}
function normalizeCell(value: string): string { return String(value ?? "").replace(/\u00a0/g, " ").replace(/[ \t\r]+/g, " ").replace(/\n{2,}/g, "\n").trim(); }
function isTimeOnly(value: string): boolean { return /^(\d{1,2}[:：]\d{2}\s*[-~至]\s*\d{1,2}[:：]\d{2})$/.test(value); }
function dayLabel(day: DayOfWeek): string { return `周${dayWords[day - 1]}`; }
function stableHash(value: string): number { let hash = 0x811c9dc5; for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 0x01000193); } return hash >>> 0; }
