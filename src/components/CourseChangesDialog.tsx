import { useState } from "react";
import type { CourseException, CourseMeeting } from "../domain/schedule";
import type { ResolvedAcademicCalendar } from "../domain/academicCalendar";
import { validateCourseException } from "../domain/courseExceptions";
import { DialogSurface } from "../ui/DialogSurface";
import { Icon } from "../ui/Icon";

export function CourseChangesDialog({ courses, changes, calendar, onEdit, onUndo, onClose }: {
  courses: CourseMeeting[]; changes: CourseException[]; calendar: ResolvedAcademicCalendar;
  onEdit: (change: CourseException) => void; onUndo: (change: CourseException) => void; onClose: () => void;
}) {
  const [filter, setFilter] = useState("all");
  const [confirm, setConfirm] = useState("");
  const items = [...changes].filter(change => filter === "all" || change.kind === filter).sort((a, b) => b.originalDate.localeCompare(a.originalDate));
  return <DialogSurface className="changes-dialog" labelledBy="changes-title" onClose={onClose}>
    <header className="dialog-header"><div><span className="eyebrow">仅本机课表</span><h2 id="changes-title">调课记录</h2><p>共 {changes.length} 条 · 按原上课日期排列</p></div><button className="icon-button" aria-label="关闭调课记录" onClick={onClose}><Icon name="close" /></button></header>
    <div className="maintenance-body">
      <label className="field"><span>记录类型</span><select value={filter} onChange={event => {setFilter(event.target.value); setConfirm("");}}><option value="all">全部记录</option><option value="move">调课</option><option value="cancel">停课</option></select></label>
      {!items.length && <p className="maintenance-empty">暂无此类记录。点课程详情可以只修改某一次上课。</p>}
      {items.map(change => {
        const course = courses.find(item => item.id === change.courseId);
        const key = `${change.courseId}|${change.originalDate}`;
        const stale = !course || Boolean(validateCourseException(course, change, calendar));
        return <article className="change-record" key={key}>
          <span className="eyebrow">{change.kind === "cancel" ? "本次停课" : "单次调课"}{stale ? " · 当前未生效" : ""}</span>
          <h3>{course?.title ?? "原课程已不存在"}</h3><p>原日期 {change.originalDate}</p>
          {change.kind === "move" && <p>调至 {change.targetDate} · 第 {change.startPeriod}–{change.endPeriod} 节<br />{change.location}</p>}
          {stale && <p>原课程或校历已变化，此记录未应用。移除记录不会创建课程。</p>}
          {confirm === key ? <div className="record-confirm"><p>仅撤销这条本地记录，其他记录保留。</p><button className="cancel-button" onClick={() => setConfirm("")}>保留记录</button><button className="primary-button" onClick={() => {onUndo(change); setConfirm("");}}>确认撤销</button></div> : <div className="record-actions"><button className="soft-button" disabled={!course || stale} onClick={() => onEdit(change)}>修改</button><button className="soft-button" onClick={() => setConfirm(key)}>{stale ? "移除无效记录" : "撤销这次变更"}</button></div>}
        </article>;
      })}
    </div><footer className="dialog-footer"><span>不会向教务系统提交变更</span><button className="primary-button" onClick={onClose}>完成</button></footer>
  </DialogSurface>;
}
