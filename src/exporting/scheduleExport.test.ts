import { describe, expect, it } from "vitest";
import { defaultPresets, demoCourses } from "../data/demo";
import type { ExportContext } from "./scheduleExport";
import { buildScheduleCsv, buildScheduleIcs, buildScheduleJson, buildWeekSvg } from "./scheduleExport";

const context: ExportContext = {
  snapshot: {
    courses: demoCourses,
    presets: defaultPresets,
    activePresetId: "summer",
    schoolName: "宁德师范学院",
    termStartsOn: "2026-09-14",
    teachingStartsOn: "2026-08-31",
    studentGrade: 2,
    reminderSettings: { enabled: true, defaultMinutes: 15 },
  },
  preset: defaultPresets[0],
  calendar: {
    weekOneStartsOn: new Date(2026, 7, 31, 12),
    teachingStartsOn: new Date(2026, 7, 31, 12),
  },
  termName: "2026–2027 第一学期",
};

describe("schedule export", () => {
  it("creates one calendar event for every course occurrence", () => {
    const ics = buildScheduleIcs(context);
    const expected = demoCourses.reduce((sum, course) => sum + course.weeks.length, 0);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(expected);
    expect(ics).toContain("TZID=Asia/Shanghai");
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(expected);
    expect(ics).toContain("TRIGGER:-PT15M");
  });

  it("creates Excel-compatible CSV and a complete JSON backup", () => {
    expect(buildScheduleCsv(context).split(/\r?\n/)).toHaveLength(demoCourses.length + 1);
    const backup = JSON.parse(buildScheduleJson(context));
    expect(backup.courses).toHaveLength(demoCourses.length);
    expect(backup.termStartsOn).toBe("2026-08-31");
    expect(backup.teachingStartsOn).toBe("2026-08-31");
    expect(backup.studentGrade).toBe(2);
    expect(backup.reminderSettings).toEqual({ enabled: true, defaultMinutes: 15 });
    expect(buildScheduleCsv(context)).toContain("提前15分钟");
  });

  it("renders the selected week as SVG", () => {
    const svg = buildWeekSvg(context, 1);
    expect(svg).toContain("<svg");
    expect(svg).toContain("高等数学");
  });
});
