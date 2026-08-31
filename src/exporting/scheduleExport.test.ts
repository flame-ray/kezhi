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
  },
  preset: defaultPresets[0],
  termStartsOn: new Date(2026, 7, 31),
  termName: "2026–2027 第一学期",
};

describe("schedule export", () => {
  it("creates one calendar event for every course occurrence", () => {
    const ics = buildScheduleIcs(context);
    const expected = demoCourses.reduce((sum, course) => sum + course.weeks.length, 0);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(expected);
    expect(ics).toContain("TZID=Asia/Shanghai");
  });

  it("creates Excel-compatible CSV and a complete JSON backup", () => {
    expect(buildScheduleCsv(context).split(/\r?\n/)).toHaveLength(demoCourses.length + 1);
    expect(JSON.parse(buildScheduleJson(context)).courses).toHaveLength(demoCourses.length);
  });

  it("renders the selected week as SVG", () => {
    const svg = buildWeekSvg(context, 1);
    expect(svg).toContain("<svg");
    expect(svg).toContain("高等数学");
  });
});
