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
        lastSyncAt: "2026-08-31T00:00:00.000Z",
        reminderSettings: { enabled: true, defaultMinutes: 30 },
      },
      preset: defaultPresets[0],
      termStartsOn: new Date(2026, 7, 31),
      termName: "2026–2027 第一学期",
    });
    const restored = parseScheduleBackup(backup);
    expect(restored.courses).toHaveLength(demoCourses.length);
    expect(restored.schoolName).toBe("宁德师范学院");
    expect(restored.academicYear).toBe(2026);
    expect(restored.semester).toBe(1);
    expect(restored.termStartsOn).toBe("2026-08-31");
    expect(restored.lastSyncAt).toBe("2026-08-31T00:00:00.000Z");
    expect(restored.reminderSettings).toEqual({ enabled: true, defaultMinutes: 30 });
  });

  it("rejects unknown and malformed data", () => {
    expect(() => parseScheduleBackup("not json")).toThrow("有效的 JSON");
    expect(() => parseScheduleBackup(JSON.stringify({ format: "other", version: 1 }))).toThrow("不是受支持");
  });
});
