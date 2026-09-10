import { useState } from "react";
import type { ScheduleSnapshot } from "../domain/schedule";
import { parseScheduleBackup } from "../importing/backupImport";
import { DialogSurface } from "../ui/DialogSurface";
import { downloadText } from "../exporting/scheduleExport";

export function ImportBackupDialog({ snapshot, onRestore, onClose }: { snapshot: ScheduleSnapshot; onRestore: () => void; onClose: () => void }) {
  const [confirmed, setConfirmed] = useState(false);
  const backup = snapshot.importBackup;
  let restored: ScheduleSnapshot | undefined, error = "";
  if (backup) { try { restored = parseScheduleBackup(backup.data); } catch { error = "这份备份无法解析，未更改当前课表。"; } }
  return <DialogSurface className="backup-dialog" labelledBy="safety-backup-title" onClose={onClose}>
    <header className="dialog-header"><div><span className="eyebrow">本地恢复点</span><h2 id="safety-backup-title">导入前自动备份</h2><p>保留最近一次导入前的课表、作息与调课记录</p></div></header>
    <div className="maintenance-body">
      {!backup && <p className="maintenance-empty">尚无自动备份。首次确认教务、日历或 JSON 导入时会建立恢复点。</p>}
      {backup && <><p>{new Date(backup.createdAt).toLocaleString()} · {backup.reason}</p>{error && <p role="alert">{error}</p>}
        {restored && <><div className="backup-comparison"><p>当前课表<strong>{snapshot.courses.length} 门课程 · {snapshot.presets.length} 套作息</strong></p><p>将恢复<strong>{restored.courses.length} 门课程 · {restored.presets.length} 套作息</strong><span>{restored.courseExceptions?.length ?? 0} 条调课／停课记录</span></p></div><p>恢复会替换当前课表与校历，但保留当前成绩、选课助手及已保存密码。恢复前也会备份当前课表，可再次恢复回退。</p><label className="backup-confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>确认用此备份替换当前课表</span></label></>}
        <button className="soft-button" onClick={() => downloadText(backup.data, "课织-导入前自动备份.json", "application/json")}>导出此备份</button></>}
    </div><footer className="dialog-footer"><button className="cancel-button" onClick={onClose}>关闭</button><button className="primary-button" disabled={!restored || !confirmed} onClick={onRestore}>恢复这份备份</button></footer>
  </DialogSurface>;
}
