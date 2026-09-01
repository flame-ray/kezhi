import type { CourseMeeting, ScheduleSnapshot, TimetablePreset } from "../domain/schedule";
import { effectiveReminderMinutes, normalizeReminderSettings } from "../reminders/reminderSchedule";

const DAY_MS = 86_400_000;
const colorMap: Record<CourseMeeting["color"], string> = {
  blue: "#4f84d9",
  teal: "#42a89c",
  coral: "#dc7659",
  violet: "#8d70d2",
  rose: "#d25c83",
  amber: "#cf993c",
  indigo: "#587bcf",
};

export interface ExportContext {
  snapshot: ScheduleSnapshot;
  preset: TimetablePreset;
  termStartsOn: Date;
  termName: string;
}

export function buildScheduleJson(context: ExportContext): string {
  return JSON.stringify({
    format: "kezhi-schedule",
    version: 1,
    exportedAt: new Date().toISOString(),
    term: { name: context.termName, startsOn: toDateKey(context.termStartsOn) },
    termStartsOn: toDateKey(context.termStartsOn),
    schoolName: context.snapshot.schoolName,
    schoolId: context.snapshot.schoolId,
    academicYear: context.snapshot.academicYear,
    semester: context.snapshot.semester,
    lastSyncAt: context.snapshot.lastSyncAt,
    activePresetId: context.snapshot.activePresetId,
    presets: context.snapshot.presets,
    courses: context.snapshot.courses,
    reminderSettings: normalizeReminderSettings(context.snapshot.reminderSettings),
  }, null, 2);
}

export function buildScheduleCsv(context: ExportContext): string {
  const settings = normalizeReminderSettings(context.snapshot.reminderSettings);
  const headers = ["课程名称", "课程编号", "教师", "教室", "星期", "开始节次", "结束节次", "上课周次", "提醒", "备注"];
  const rows = context.snapshot.courses.map((course) => [
    course.title,
    course.courseCode,
    course.teacher,
    course.location,
    `周${["一", "二", "三", "四", "五", "六", "日"][course.day - 1]}`,
    course.startPeriod,
    course.endPeriod,
    compressWeeks(course.weeks),
    effectiveReminderMinutes(course, settings) > 0 ? `提前${effectiveReminderMinutes(course, settings)}分钟` : "关闭",
    course.note ?? "",
  ]);
  return `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}

export function buildScheduleIcs(context: ExportContext): string {
  const stamp = toUtcStamp(new Date());
  const settings = normalizeReminderSettings(context.snapshot.reminderSettings);
  const events = context.snapshot.courses.flatMap((course) => {
    const startPeriod = context.preset.periods.find((period) => period.index === course.startPeriod);
    const endPeriod = context.preset.periods.find((period) => period.index === course.endPeriod);
    if (!startPeriod || !endPeriod) return [];

    return course.weeks.map((week) => {
      const reminderMinutes = settings.enabled ? effectiveReminderMinutes(course, settings) : 0;
      const date = new Date(context.termStartsOn.getTime() + ((week - 1) * 7 + course.day - 1) * DAY_MS);
      return [
        "BEGIN:VEVENT",
        `UID:${icsEscape(`${course.id}-${week}@kezhi.local`)}`,
        `DTSTAMP:${stamp}`,
        `DTSTART;TZID=Asia/Shanghai:${toLocalStamp(date, startPeriod.start)}`,
        `DTEND;TZID=Asia/Shanghai:${toLocalStamp(date, endPeriod.end)}`,
        `SUMMARY:${icsEscape(course.title)}`,
        `LOCATION:${icsEscape(course.location)}`,
        `DESCRIPTION:${icsEscape(`${course.teacher} · 第${course.startPeriod}-${course.endPeriod}节 · 第${week}周`)}`,
        ...(reminderMinutes > 0 ? ["BEGIN:VALARM", `TRIGGER:-PT${reminderMinutes}M`, "ACTION:DISPLAY", `DESCRIPTION:${icsEscape(course.title)} 即将上课`, "END:VALARM"] : []),
        "END:VEVENT",
      ].join("\r\n");
    });
  });

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Kezhi//University Schedule//ZH-CN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:课织课表",
    "X-WR-TIMEZONE:Asia/Shanghai",
    ...events,
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

export function buildWeekSvg(context: ExportContext, week: number): string {
  const width = 1400;
  const left = 90;
  const header = 82;
  const rowHeight = 76;
  const dayWidth = (width - left - 28) / 7;
  const height = header + context.preset.periods.length * rowHeight + 58;
  const monday = new Date(context.termStartsOn.getTime() + (week - 1) * 7 * DAY_MS);
  const dayNames = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

  const grid = context.preset.periods.map((period, index) => {
    const y = header + index * rowHeight;
    return `<line x1="${left}" y1="${y}" x2="${width - 28}" y2="${y}" stroke="#e6e8ef"/><text x="42" y="${y + 29}" text-anchor="middle" font-size="18" font-weight="700" fill="#3f4450">${period.index}</text><text x="42" y="${y + 49}" text-anchor="middle" font-size="10" fill="#858a95">${period.start}</text>`;
  }).join("");

  const columns = dayNames.map((name, index) => {
    const x = left + index * dayWidth;
    const date = new Date(monday.getTime() + index * DAY_MS);
    return `<line x1="${x}" y1="${header}" x2="${x}" y2="${height - 42}" stroke="#eceef3"/><text x="${x + dayWidth / 2}" y="38" text-anchor="middle" font-size="15" font-weight="700" fill="#636875">${name}</text><text x="${x + dayWidth / 2}" y="61" text-anchor="middle" font-size="13" fill="#8d919c">${date.getMonth() + 1}/${date.getDate()}</text>`;
  }).join("");

  const cards = context.snapshot.courses.filter((course) => course.weeks.includes(week)).map((course) => {
    const x = left + (course.day - 1) * dayWidth + 5;
    const y = header + (course.startPeriod - 1) * rowHeight + 5;
    const cardHeight = (course.endPeriod - course.startPeriod + 1) * rowHeight - 10;
    const color = colorMap[course.color];
    return `<g><rect x="${x}" y="${y}" width="${dayWidth - 10}" height="${cardHeight}" rx="12" fill="${color}" opacity=".18"/><rect x="${x}" y="${y}" width="5" height="${cardHeight}" rx="3" fill="${color}"/><text x="${x + 16}" y="${y + 26}" font-size="14" font-weight="700" fill="#29303b">${xmlEscape(course.title)}</text><text x="${x + 16}" y="${y + 47}" font-size="10" fill="#606873">${xmlEscape(course.location)}</text><text x="${x + 16}" y="${y + 64}" font-size="10" fill="#747b85">${xmlEscape(course.teacher)}</text></g>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" rx="24" fill="#ffffff"/>
  <text x="28" y="39" font-size="20" font-weight="800" fill="#29303b">课织</text>
  <text x="28" y="60" font-size="10" fill="#8b909b">${xmlEscape(context.termName)} · 第${week}周</text>
  ${columns}${grid}${cards}
  <line x1="${left}" y1="${height - 42}" x2="${width - 28}" y2="${height - 42}" stroke="#e6e8ef"/>
</svg>`;
}

export function downloadText(content: string, fileName: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function compressWeeks(weeks: number[]): string {
  if (!weeks.length) return "";
  const sorted = [...weeks].sort((a, b) => a - b);
  const odd = sorted.every((week) => week % 2 === 1);
  const even = sorted.every((week) => week % 2 === 0);
  if (odd || even) return `${sorted[0]}-${sorted.at(-1)}周${odd ? "单周" : "双周"}`;
  return sorted.join("、");
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toLocalStamp(date: Date, time: string): string {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${time.replace(":", "")}00`;
}

function toUtcStamp(date: Date): string {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function icsEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function xmlEscape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
