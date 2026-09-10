import { useState } from "react";
import type { CourseException, CourseMeeting, TimetablePreset } from "../domain/schedule";
import type { ResolvedAcademicCalendar } from "../domain/academicCalendar";
import { findOccurrenceConflicts, validateCourseException } from "../domain/courseExceptions";
import { DialogSurface } from "../ui/DialogSurface";
import { Icon } from "../ui/Icon";

export function CourseOccurrenceDialog({ course, date, existing, courses, changes, calendar, preset, onSave, onUndo, onClose }: {
  course: CourseMeeting; date: string; existing?: CourseException; calendar: ResolvedAcademicCalendar; preset: TimetablePreset;
  courses: CourseMeeting[]; changes?: CourseException[];
  onSave: (change: CourseException) => void; onUndo: () => void; onClose: () => void;
}) {
  const [kind, setKind] = useState<"cancel" | "move">(existing?.kind ?? "move");
  const [targetDate, setTargetDate] = useState(existing?.targetDate ?? date);
  const [startPeriod, setStart] = useState(existing?.startPeriod ?? course.startPeriod);
  const [endPeriod, setEnd] = useState(existing?.endPeriod ?? course.endPeriod);
  const [location, setLocation] = useState(existing?.location ?? course.location);
  const [acceptedConflict, setAcceptedConflict] = useState("");
  const change: CourseException = kind === "cancel" ? { courseId: course.id, originalDate: date, kind } : { courseId: course.id, originalDate: date, kind, targetDate, startPeriod, endPeriod, location };
  const error = validateCourseException(course, change, calendar) ?? (kind === "move" && (!preset.periods.some(p => p.index === startPeriod) || !preset.periods.some(p => p.index === endPeriod)) ? "目标节次不在当前作息方案中" : undefined);
  const conflicts = error ? [] : findOccurrenceConflicts(courses, changes, change, calendar);
  const conflictKey = JSON.stringify([change, conflicts.map(item => [item.id, item.title, item.startPeriod, item.endPeriod, item.location])]);
  const needsConfirmation = conflicts.length > 0 && acceptedConflict !== conflictKey;
  return <DialogSurface className="occurrence-dialog" labelledBy="occurrence-title" onClose={onClose}>
    <header className="dialog-header"><div><span className="eyebrow">仅修改这一次</span><h2 id="occurrence-title">单次调课／停课</h2><p className="dialog-description">{course.title} · 原日期 {date}</p></div><button className="icon-button" aria-label="关闭单次调课" onClick={onClose}><Icon name="close" /></button></header>
    <div className="dialog-body occurrence-body">
      <p>其他周仍按原课表上课。此操作仅修改本机，不会向教务系统提交。</p>
      <p>如已导入手机日历，调课后请重新导入；已写入日历的停课事件需手动删除。</p>
      <label className="field"><span>本次操作</span><select value={kind} onChange={event => { setAcceptedConflict(""); setKind(event.target.value as "cancel" | "move"); }}><option value="move">调整这一次</option><option value="cancel">这一次停课</option></select></label>
      {kind === "move" && <div className="form-grid">
        <label className="field span-2"><span>调至日期</span><input type="date" value={targetDate} onChange={event => { setAcceptedConflict(""); setTargetDate(event.target.value); }} /></label>
        <label className="field"><span>开始节次</span><select value={startPeriod} onChange={event => { setAcceptedConflict(""); setStart(Number(event.target.value)); }}>{preset.periods.map(p => <option key={p.index} value={p.index}>第 {p.index} 节 · {p.start}</option>)}</select></label>
        <label className="field"><span>结束节次</span><select value={endPeriod} onChange={event => { setAcceptedConflict(""); setEnd(Number(event.target.value)); }}>{preset.periods.map(p => <option key={p.index} value={p.index}>第 {p.index} 节 · {p.end}</option>)}</select></label>
        <label className="field span-2"><span>本次教室</span><input value={location} maxLength={200} onChange={event => { setAcceptedConflict(""); setLocation(event.target.value); }} /></label>
      </div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {conflicts.length > 0 && <section className="occurrence-conflicts" aria-label="调课时间冲突">
        <strong role="status">与 {conflicts.length} 门课程时间重叠</strong>
        <ul>{conflicts.map(item => <li key={item.id}><strong>{item.title}</strong><span>第 {item.startPeriod}–{item.endPeriod} 节 · {item.location}</span></li>)}</ul>
        <label><input type="checkbox" checked={!needsConfirmation} onChange={event => setAcceptedConflict(event.target.checked ? conflictKey : "")} /><span>我已确认时间冲突，仍保留这次调课</span></label>
        <small>不会删除或移动冲突课程。更改目标时间后需要重新确认。</small>
      </section>}
      {existing && <button className="soft-button" onClick={onUndo}>撤销这次变更，恢复原课表</button>}
    </div>
    <footer className="dialog-footer"><button className="cancel-button" onClick={onClose}>取消</button><button className="primary-button" disabled={Boolean(error) || needsConfirmation} onClick={() => { if (!error && !needsConfirmation) onSave(change); }}>确认{kind === "cancel" ? "本次停课" : "单次调课"}</button></footer>
  </DialogSurface>;
}
