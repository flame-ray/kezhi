import { describe, expect, it } from "vitest";
import { defaultPresets, demoCourses } from "../data/demo";
import { buildScheduleJson } from "../exporting/scheduleExport";
import { parseScheduleBackup } from "./backupImport";

describe("schedule backup import", () => {
  it("restores a backup produced by the export module", () => {
    const backup = buildScheduleJson({
      snapshot: {
        courses: demoCourses,
        presets: defaultPresets,
        activePresetId: "summer",
        schoolName: "宁德师范学院",
        schoolId: "ndnu",
        academicYear: 2026,
        semester: 1,
        termStartsOn: "2026-09-14",
        teachingStartsOn: "2026-09-17",
        studentGrade: 1,
        lastSyncAt: "2026-08-31T00:00:00.000Z",
        reminderSettings: { enabled: true, defaultMinutes: 30 },
      },
      preset: defaultPresets[0],
      calendar: {
        weekOneStartsOn: new Date(2026, 7, 31, 12),
        teachingStartsOn: new Date(2026, 8, 17, 12),
      },
      termName: "2026–2027 第一学期",
    });
    const restored = parseScheduleBackup(backup);
    expect(restored.courses).toHaveLength(demoCourses.length);
    expect(restored.schoolName).toBe("宁德师范学院");
    expect(restored.academicYear).toBe(2026);
    expect(restored.semester).toBe(1);
    expect(restored.termStartsOn).toBe("2026-08-31");
    expect(restored.teachingStartsOn).toBe("2026-09-17");
    expect(restored.studentGrade).toBe(1);
    expect(restored.lastSyncAt).toBe("2026-08-31T00:00:00.000Z");
    expect(restored.reminderSettings).toEqual({ enabled: true, defaultMinutes: 30 });
  });

  it("rejects unknown and malformed data", () => {
    expect(() => parseScheduleBackup("not json")).toThrow("有效的 JSON");
    expect(() => parseScheduleBackup(JSON.stringify({ format: "other", version: 1 }))).toThrow("不是受支持");
  });

  it("keeps missing legacy calendar dates unset for the selected academic year", () => {
    const restored = parseScheduleBackup(JSON.stringify({
      format: "kezhi-schedule",
      version: 1,
      courses: [],
      presets: defaultPresets,
      activePresetId: defaultPresets[0].id,
      academicYear: 2027,
      semester: 2,
    }));
    expect(restored.termStartsOn).toBeUndefined();
    expect(restored.teachingStartsOn).toBeUndefined();
  });

  it("rejects invalid or duplicated timetable structures before persistence", () => {
    expect(() => parseScheduleBackup(JSON.stringify({
      format: "kezhi-schedule",
      version: 1,
      courses: [],
      presets: [{ id: "bad", name: "错误作息", periods: [{ index: 2, start: "09:00", end: "08:00" }] }],
      activePresetId: "bad",
    }))).toThrow();
  });
});
