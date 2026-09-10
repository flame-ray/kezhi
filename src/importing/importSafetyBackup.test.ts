import { describe, expect, it } from "vitest";
import { defaultPresets, demoCourses } from "../data/demo";
import { createImportSafetyBackup, restoreImportSafetyBackup } from "./importSafetyBackup";
import type { ScheduleSnapshot } from "../domain/schedule";
import { parseScheduleBackup } from "./backupImport";
const current: ScheduleSnapshot = { courses: [demoCourses[0]], presets: defaultPresets, activePresetId: "summer", accountId: "account-one", courseExceptions: [{ courseId: demoCourses[0].id, originalDate: "2026-09-15", kind: "cancel" }] };
describe("pre-import recovery", () => {
  it("captures originals, calendar configuration, and changes without nesting previous backups", () => {
    const first = createImportSafetyBackup(current, "第一次");
    const next = createImportSafetyBackup({ ...current, importBackup: first }, "第二次");
    expect(JSON.parse(next.data).importBackup).toBeUndefined();
    expect(parseScheduleBackup(next.data).courseExceptions).toEqual(current.courseExceptions);
    expect(parseScheduleBackup(next.data).accountId).toBe("account-one");
  });
  it("restores the timetable while preserving current grades and selection configuration", () => {
    const after: ScheduleSnapshot = { ...current, courses: [], grades: [], selectionAssistant: {} as ScheduleSnapshot["selectionAssistant"], importBackup: createImportSafetyBackup(current, "导入") };
    const restored = restoreImportSafetyBackup(after);
    expect(restored.courses[0].id).toBe(current.courses[0].id);
    expect(restored.grades).toBe(after.grades);
    expect(restored.selectionAssistant).toBe(after.selectionAssistant);
    expect(JSON.parse(restored.importBackup!.data).courses).toEqual([]);
    expect(restoreImportSafetyBackup(restored).courses).toEqual([]);
  });
  it("keeps the saved point detached and omits grades/selection internals", () => {
    const input = structuredClone(current);
    const backup = createImportSafetyBackup({ ...input, grades: [], selectionAssistant: {} as ScheduleSnapshot["selectionAssistant"] }, "导入");
    input.courses[0].title = "changed";
    expect(JSON.parse(backup.data).courses[0].title).not.toBe("changed");
    expect(JSON.parse(backup.data).grades).toBeUndefined();
    expect(JSON.parse(backup.data).selectionAssistant).toBeUndefined();
  });
  it("supports an empty previous timetable and rejects corrupt or absent backup", () => {
    const empty = { ...current, courses: [] };
    expect(restoreImportSafetyBackup({ ...current, importBackup: createImportSafetyBackup(empty, "首次导入") }).courses).toEqual([]);
    expect(() => restoreImportSafetyBackup(current)).toThrow();
    expect(() => restoreImportSafetyBackup({ ...current, importBackup: { createdAt: "", reason: "", data: "bad" } })).toThrow();
  });
});
