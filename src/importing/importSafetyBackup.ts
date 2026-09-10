import type { ImportSafetyBackup, ScheduleSnapshot } from "../domain/schedule";
import { parseScheduleBackup } from "./backupImport";

export function createImportSafetyBackup(snapshot: ScheduleSnapshot, reason: string, now = new Date()): ImportSafetyBackup {
  // Keep only one generation, never credentials, grades or automatic-selection configuration.
  const data = JSON.stringify({ ...snapshot, format: "kezhi-schedule", version: 1, importBackup: undefined, grades: undefined, selectionAssistant: undefined });
  if (new TextEncoder().encode(data).length > 4 * 1024 * 1024) throw new Error("课表过大，无法建立导入前备份，请先导出 JSON；本次未覆盖课表");
  return { createdAt: now.toISOString(), reason, data };
}
export function restoreImportSafetyBackup(current: ScheduleSnapshot): ScheduleSnapshot {
  const backup = current.importBackup;
  if (!backup) throw new Error("暂无导入前备份");
  const restored = parseScheduleBackup(backup.data);
  return { ...restored, grades: current.grades, selectionAssistant: current.selectionAssistant, importBackup: createImportSafetyBackup(current, "恢复自动备份前") };
}
