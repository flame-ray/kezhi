import { useState } from "react";
import type { CourseMeeting } from "../domain/schedule";
import type { ScheduleSyncPlan, SyncChoice, SyncChangeKind } from "../sync/scheduleSync";
import { Icon } from "../ui/Icon";
import { DialogSurface } from "../ui/DialogSurface";

interface SyncReviewDialogProps {
  plan: ScheduleSyncPlan;
  onApply: (choices: Record<string, SyncChoice>) => void;
  onClose: () => void;
}

const kindLabels: Record<SyncChangeKind, string> = {
  added: "学校新增课程",
  removed: "学校已移除",
  modified: "课程信息变化",
};

export function SyncReviewDialog({ plan, onApply, onClose }: SyncReviewDialogProps) {
  const [choices, setChoices] = useState<Record<string, SyncChoice>>(() =>
    Object.fromEntries(plan.changes.map((change) => [change.id, "official"])),
  );

  return (
    <DialogSurface className="sync-dialog" labelledBy="sync-title" onClose={onClose}>
        <header className="dialog-header"><div><span className="eyebrow">同步发现变化</span><h2 id="sync-title">选择要保留的版本</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭"><Icon name="close" /></button></header>
        <div className="sync-overview"><span className="sync-count">{plan.changes.length}</span><div><strong>教务系统与本地课表存在差异</strong><small>{plan.unchangedCount} 条课程没有变化；课织不会静默覆盖本地修改。</small></div></div>
        <div className="change-list">{plan.changes.map((change) => {
          const displayCourse = change.official ?? change.local;
          return <article className="change-card" key={change.id}><header><span className={`change-color color-${displayCourse?.color ?? "blue"}`} /><div><strong>{change.title}</strong><small>{kindLabels[change.kind]}{change.changedFields.length ? ` · ${change.changedFields.join("、")}` : ""}</small></div></header><div className="version-choices"><label className={choices[change.id] === "local" ? "selected" : ""}><input type="radio" name={change.id} checked={choices[change.id] === "local"} onChange={() => setChoices((current) => ({ ...current, [change.id]: "local" }))} /><span><em>本地版本</em><strong>{localDescription(change.kind, change.local)}</strong></span></label><label className={choices[change.id] === "official" ? "selected" : ""}><input type="radio" name={change.id} checked={choices[change.id] === "official"} onChange={() => setChoices((current) => ({ ...current, [change.id]: "official" }))} /><span><em>教务版本</em><strong>{officialDescription(change.kind, change.official)}</strong></span><i>推荐</i></label></div></article>;
        })}</div>
        <footer className="dialog-footer"><span>选择结果只写入当前设备</span><div className="footer-actions"><button className="cancel-button" onClick={onClose}>稍后处理</button><button className="primary-button" onClick={() => onApply(choices)}>应用选择</button></div></footer>
    </DialogSurface>
  );
}

function localDescription(kind: SyncChangeKind, course?: CourseMeeting): string {
  if (kind === "added") return "忽略这条新增课程";
  return course ? summarizeCourse(course) : "保留当前状态";
}

function officialDescription(kind: SyncChangeKind, course?: CourseMeeting): string {
  if (kind === "removed") return "从课表中移除";
  return course ? summarizeCourse(course) : "采用学校状态";
}

function summarizeCourse(course: CourseMeeting): string {
  const day = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"][course.day - 1];
  return `${day} 第${course.startPeriod}–${course.endPeriod}节 · ${course.location}`;
}
