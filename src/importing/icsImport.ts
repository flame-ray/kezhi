import type { CourseColor, CourseMeeting, DayOfWeek, TimetablePreset } from "../domain/schedule";

const colors: CourseColor[] = ["blue", "teal", "coral", "violet", "rose", "amber", "indigo"];
const dayCodes: Record<string, DayOfWeek> = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7 };
const MAX_FILE_EVENTS = 2_000;
const MAX_OCCURRENCES = 8_000;

export interface IcsImportOptions {
  preset: TimetablePreset;
  weekOneStartsOn?: string | Date;
}

export interface IcsImportResult {
  courses: CourseMeeting[];
  sourceEvents: number;
  occurrenceCount: number;
  skippedEvents: number;
  warnings: string[];
  weekOneStartsOn: string;
  firstDate: string;
  lastDate: string;
}

interface ContentLine {
  name: string;
  params: string;
  value: string;
}

interface CalendarOccurrence {
  start: Date;
  end: Date;
  title: string;
  location: string;
  teacher: string;
  note?: string;
}

export function parseIcsSchedule(text: string, options: IcsImportOptions): IcsImportResult {
  if (!/BEGIN:VCALENDAR/i.test(text) || !/END:VCALENDAR/i.test(text)) {
    throw new Error("这不是有效的 ICS 日历文件");
  }
  const events = readEvents(text);
  if (!events.length) throw new Error("日历中没有可导入的事件");
  if (events.length > MAX_FILE_EVENTS) throw new Error(`日历事件超过 ${MAX_FILE_EVENTS} 条，请分批导入`);

  const warnings: string[] = [];
  const occurrences: CalendarOccurrence[] = [];
  let skippedEvents = 0;
  for (const event of events) {
    const expanded = expandEvent(event, warnings);
    if (!expanded.length) skippedEvents += 1;
    occurrences.push(...expanded);
    if (occurrences.length > MAX_OCCURRENCES) throw new Error("日历重复课次过多，请缩短重复范围后重试");
  }
  if (!occurrences.length) throw new Error("没有识别到带开始时间的课程事件");

  occurrences.sort((left, right) => left.start.getTime() - right.start.getTime());
  const inferredWeekOne = mondayOf(occurrences[0].start);
  const requestedWeekOne = parseWeekOne(options.weekOneStartsOn);
  const weekOne = requestedWeekOne ?? inferredWeekOne;
  const grouped = new Map<string, CourseMeeting>();
  let outsideTerm = 0;

  for (const occurrence of occurrences) {
    const week = weekForDate(occurrence.start, weekOne);
    if (week < 1 || week > 30) {
      outsideTerm += 1;
      continue;
    }
    const day = dayOfWeek(occurrence.start);
    const { startPeriod, endPeriod } = matchPeriods(occurrence.start, occurrence.end, options.preset);
    const key = [occurrence.title, occurrence.location, occurrence.teacher, day, startPeriod, endPeriod].join("\u001f");
    const existing = grouped.get(key);
    if (existing) {
      if (!existing.weeks.includes(week)) existing.weeks.push(week);
      continue;
    }
    const hash = hashText(key);
    grouped.set(key, {
      id: `ics-${hash}`,
      courseCode: `ICS-${hash.slice(0, 6).toUpperCase()}`,
      title: occurrence.title,
      teacher: occurrence.teacher,
      location: occurrence.location,
      day,
      startPeriod,
      endPeriod,
      weeks: [week],
      color: colors[Number.parseInt(hash.slice(-2), 16) % colors.length],
      status: "normal",
      note: occurrence.note,
      source: "local",
      sourceKey: `ics:${hash}`,
    });
  }
  if (outsideTerm > 0) warnings.push(`${outsideTerm} 个课次不在当前第 1–30 周内，已跳过`);
  const courses = [...grouped.values()].map((course) => ({ ...course, weeks: course.weeks.sort((a, b) => a - b) }));
  if (!courses.length) throw new Error("日历日期不在当前学期范围内，请调整第 1 周周一");

  return {
    courses,
    sourceEvents: events.length,
    occurrenceCount: occurrences.length - outsideTerm,
    skippedEvents,
    warnings: [...new Set(warnings)].slice(0, 12),
    weekOneStartsOn: dateKey(weekOne),
    firstDate: dateKey(occurrences[0].start),
    lastDate: dateKey(occurrences.at(-1)!.start),
  };
}

export function mergeIcsCourses(existing: CourseMeeting[], imported: CourseMeeting[]): CourseMeeting[] {
  const merged = existing.map((course) => ({ ...course, weeks: [...course.weeks] }));
  for (const incoming of imported) {
    const index = merged.findIndex((course) => course.id === incoming.id || courseSignature(course) === courseSignature(incoming));
    if (index < 0) {
      merged.push(incoming);
      continue;
    }
    merged[index] = {
      ...merged[index],
      weeks: [...new Set([...merged[index].weeks, ...incoming.weeks])].sort((a, b) => a - b),
    };
  }
  return merged;
}

function readEvents(text: string): ContentLine[][] {
  const lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const events: ContentLine[][] = [];
  let current: ContentLine[] | undefined;
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.toUpperCase() === "BEGIN:VEVENT") {
      current = [];
      continue;
    }
    if (line.toUpperCase() === "END:VEVENT") {
      if (current) events.push(current);
      current = undefined;
      continue;
    }
    if (!current) continue;
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const descriptor = line.slice(0, colon);
    const separator = descriptor.indexOf(";");
    current.push({
      name: (separator < 0 ? descriptor : descriptor.slice(0, separator)).toUpperCase(),
      params: separator < 0 ? "" : descriptor.slice(separator + 1),
      value: line.slice(colon + 1),
    });
  }
  return events;
}

function expandEvent(lines: ContentLine[], warnings: string[]): CalendarOccurrence[] {
  const startLine = first(lines, "DTSTART");
  const title = unescapeIcs(first(lines, "SUMMARY")?.value ?? "").trim();
  if (!startLine || !title) {
    warnings.push("有事件缺少开始时间或标题，已跳过");
    return [];
  }
  if (!startLine.value.includes("T")) {
    warnings.push(`“${title}”是全天事件，未作为课程导入`);
    return [];
  }
  const start = parseIcsDate(startLine.value);
  if (!start) {
    warnings.push(`“${title}”的开始时间无法识别`);
    return [];
  }
  const parsedEnd = parseIcsDate(first(lines, "DTEND")?.value ?? "");
  const end = parsedEnd && parsedEnd > start ? parsedEnd : new Date(start.getTime() + 45 * 60_000);
  const duration = end.getTime() - start.getTime();
  const description = unescapeIcs(first(lines, "DESCRIPTION")?.value ?? "").trim();
  const location = unescapeIcs(first(lines, "LOCATION")?.value ?? "").trim() || "未设置地点";
  const teacher = extractTeacher(description);
  const note = /^.+?\s*·\s*第\d+(?:-\d+)?节/.test(description) ? undefined : description.slice(0, 160) || undefined;
  const excluded = new Set(lines.filter((line) => line.name === "EXDATE").flatMap((line) => line.value.split(",")).map(parseIcsDate).filter(isDate).map(minuteStamp));
  const starts = expandStarts(start, first(lines, "RRULE")?.value, warnings, title);
  for (const line of lines.filter((item) => item.name === "RDATE")) {
    starts.push(...line.value.split(",").map(parseIcsDate).filter(isDate));
  }
  const unique = new Map<number, Date>();
  starts.forEach((item) => unique.set(minuteStamp(item), item));
  return [...unique.values()]
    .filter((item) => !excluded.has(minuteStamp(item)))
    .map((item) => ({ start: item, end: new Date(item.getTime() + duration), title, location, teacher, note }));
}

function expandStarts(start: Date, ruleText: string | undefined, warnings: string[], title: string): Date[] {
  if (!ruleText) return [start];
  const rule = Object.fromEntries(ruleText.split(";").map((part) => {
    const [key, ...value] = part.split("=");
    return [key.toUpperCase(), value.join("=")];
  }));
  if (rule.FREQ !== "WEEKLY") {
    warnings.push(`“${title}”使用非每周重复规则，仅导入首次事件`);
    return [start];
  }
  const interval = clampInteger(rule.INTERVAL, 1, 12, 1);
  const count = clampInteger(rule.COUNT, 1, 500, 0);
  const until = parseIcsDate(rule.UNTIL ?? "");
  const hardEnd = until ?? new Date(start.getTime() + 30 * 7 * 86_400_000);
  const byDays = (rule.BYDAY?.split(",").map((value) => dayCodes[value.slice(-2).toUpperCase()]).filter(Boolean) ?? [dayOfWeek(start)]) as DayOfWeek[];
  const anchor = mondayOf(start);
  const results: Date[] = [];
  for (let week = 0; week <= 60 && results.length < (count || 500); week += interval) {
    for (const day of byDays) {
      const candidate = new Date(anchor);
      candidate.setDate(anchor.getDate() + week * 7 + day - 1);
      candidate.setHours(start.getHours(), start.getMinutes(), start.getSeconds(), 0);
      if (candidate < start) continue;
      if (candidate > hardEnd) return results.length ? results : [start];
      results.push(candidate);
      if (count && results.length >= count) return results;
    }
  }
  return results.length ? results : [start];
}

function matchPeriods(start: Date, end: Date, preset: TimetablePreset): { startPeriod: number; endPeriod: number } {
  if (!preset.periods.length) return { startPeriod: 1, endPeriod: 1 };
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const endMinutes = end.getHours() * 60 + end.getMinutes();
  const nearestStart = [...preset.periods].sort((a, b) => Math.abs(timeMinutes(a.start) - startMinutes) - Math.abs(timeMinutes(b.start) - startMinutes))[0].index;
  const eligibleEnds = preset.periods.filter((period) => period.index >= nearestStart);
  const nearestEnd = [...eligibleEnds].sort((a, b) => Math.abs(timeMinutes(a.end) - endMinutes) - Math.abs(timeMinutes(b.end) - endMinutes))[0]?.index ?? nearestStart;
  return { startPeriod: nearestStart, endPeriod: Math.max(nearestStart, nearestEnd) };
}

function extractTeacher(description: string): string {
  const labeled = description.match(/(?:任课教师|教师|老师|instructor)\s*[:：]\s*([^\n·;,]+)/i)?.[1];
  if (labeled?.trim()) return labeled.trim().slice(0, 80);
  const exported = description.match(/^([^·\n]+?)\s*·\s*第\d+(?:-\d+)?节/);
  return exported?.[1].trim().slice(0, 80) || "未设置教师";
}

function first(lines: ContentLine[], name: string): ContentLine | undefined {
  return lines.find((line) => line.name === name);
}

function parseIcsDate(value: string): Date | undefined {
  const match = value.trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!match) return undefined;
  const [, year, month, day, hour = "12", minute = "00", second = "00", utc] = match;
  const date = utc
    ? new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)))
    : new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseWeekOne(value?: string | Date): Date | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return mondayOf(value);
  if (typeof value !== "string") return undefined;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? mondayOf(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12)) : undefined;
}

function mondayOf(date: Date): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  const offset = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - offset);
  return result;
}

function weekForDate(date: Date, weekOne: Date): number {
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  return Math.floor((target.getTime() - weekOne.getTime()) / (7 * 86_400_000)) + 1;
}

function dayOfWeek(date: Date): DayOfWeek {
  return (((date.getDay() + 6) % 7) + 1) as DayOfWeek;
}

function timeMinutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function minuteStamp(date: Date): number {
  return Math.floor(date.getTime() / 60_000);
}

function isDate(value: Date | undefined): value is Date {
  return Boolean(value);
}

function unescapeIcs(value: string): string {
  return value.replace(/\\[nN]/g, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

function clampInteger(value: string | undefined, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function hashText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function courseSignature(course: CourseMeeting): string {
  return [course.title.trim().toLowerCase(), course.location.trim().toLowerCase(), course.day, course.startPeriod, course.endPeriod].join("|");
}
