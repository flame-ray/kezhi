import { useMemo, useState } from "react";
import { detectCourseWeekRule, formatCourseWeekExpression, resolveCourseWeeks, type CourseWeekRule } from "../domain/courseWeeks";
import { MAX_ACADEMIC_WEEK, type CourseColor, type CourseMeeting, type DayOfWeek } from "../domain/schedule";
import { Icon } from "../ui/Icon";
import { DialogSurface } from "../ui/DialogSurface";

export interface CourseDraftSlot {
  day: DayOfWeek;
  startPeriod: number;
}

interface CourseEditorDialogProps {
  meeting?: CourseMeeting;
  initialSlot?: CourseDraftSlot;
  maxPeriod: number;
  onSave: (meeting: CourseMeeting) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

const colors: CourseColor[] = ["blue", "teal", "coral", "violet", "rose", "amber", "indigo"];

export function CourseEditorDialog({ meeting, initialSlot, maxPeriod, onSave, onDelete, onClose }: CourseEditorDialogProps) {
  const initialRule = useMemo(() => detectCourseWeekRule(meeting?.weeks ?? []), [meeting]);
  const [title, setTitle] = useState(meeting?.title ?? "");
  const [courseCode, setCourseCode] = useState(meeting?.courseCode ?? "");
  const [teacher, setTeacher] = useState(meeting?.teacher ?? "");
  const [location, setLocation] = useState(meeting?.location ?? "");
  const [day, setDay] = useState<DayOfWeek>(meeting?.day ?? initialSlot?.day ?? 1);
  const [startPeriod, setStartPeriod] = useState(meeting?.startPeriod ?? initialSlot?.startPeriod ?? 1);
  const [endPeriod, setEndPeriod] = useState(meeting?.endPeriod ?? Math.min((initialSlot?.startPeriod ?? 1) + 1, maxPeriod));
  const [weekRule, setWeekRule] = useState<CourseWeekRule>(initialRule);
  const [weekStart, setWeekStart] = useState(Math.min(...(meeting?.weeks.length ? meeting.weeks : [1])));
  const [weekEnd, setWeekEnd] = useState(Math.max(...(meeting?.weeks.length ? meeting.weeks : [18])));
  const [customWeeks, setCustomWeeks] = useState(formatCourseWeekExpression(meeting?.weeks ?? []));
  const [color, setColor] = useState<CourseColor>(meeting?.color ?? "blue");
  const [note, setNote] = useState(meeting?.note ?? "");
  const [reminderMinutes, setReminderMinutes] = useState(meeting?.reminderMinutes === 0 ? "off" : meeting?.reminderMinutes ? String(meeting.reminderMinutes) : "default");
  const [error, setError] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = () => {
    if (!title.trim()) {
      setError("请填写课程名称");
      return;
    }
    if (endPeriod < startPeriod) {
      setError("结束节次不能早于开始节次");
      return;
    }
    const weeks = resolveCourseWeeks(weekRule, weekStart, weekEnd, customWeeks);
    if (weeks.length === 0) {
      setError("请设置至少一个上课周次");
      return;
    }
    onSave({
      id: meeting?.id ?? `manual-${Date.now()}`,
      courseCode: courseCode.trim() || `MANUAL-${Date.now().toString().slice(-5)}`,
      title: title.trim(),
      teacher: teacher.trim() || "未设置教师",
      location: location.trim() || "未设置教室",
      day,
      startPeriod,
      endPeriod,
      weeks,
      color,
      note: note.trim() || undefined,
      status: meeting?.status ?? "changed",
      reminderMinutes: reminderMinutes === "off" ? 0 : reminderMinutes === "default" ? undefined : Number(reminderMinutes),
    });
  };

  return (
    <DialogSurface className="course-editor-dialog" labelledBy="course-editor-title" onClose={onClose}>
        <header className="dialog-header">
          <div><span className="eyebrow">{meeting ? "编辑课程" : initialSlot ? "从空白格添加" : "新建课程"}</span><h2 id="course-editor-title">{meeting?.title ?? "添加一门课程"}</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="关闭"><Icon name="close" /></button>
        </header>

        <div className="editor-scroll">
          <div className="form-grid">
            <label className="field span-2"><span>课程名称 *</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：高等数学（一）" /></label>
            <label className="field"><span>课程编号</span><input value={courseCode} onChange={(event) => setCourseCode(event.target.value)} placeholder="可选" /></label>
            <label className="field"><span>教师</span><input value={teacher} onChange={(event) => setTeacher(event.target.value)} placeholder="任课教师" /></label>
            <label className="field span-2"><span>上课地点</span><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="校区、教学楼与教室" /></label>
            <label className="field"><span>星期</span><select value={day} onChange={(event) => setDay(Number(event.target.value) as DayOfWeek)}>{["一","二","三","四","五","六","日"].map((name, index) => <option value={index + 1} key={name}>周{name}</option>)}</select></label>
            <label className="field"><span>开始节次</span><select value={startPeriod} onChange={(event) => { const value = Number(event.target.value); setStartPeriod(value); setEndPeriod((current) => Math.max(current, value)); }}>{Array.from({ length: maxPeriod }, (_, index) => <option value={index + 1} key={index + 1}>第 {index + 1} 节</option>)}</select></label>
            <label className="field"><span>结束节次</span><select value={endPeriod} onChange={(event) => setEndPeriod(Number(event.target.value))}>{Array.from({ length: maxPeriod }, (_, index) => <option value={index + 1} key={index + 1}>第 {index + 1} 节</option>)}</select></label>
          </div>

          <div className="form-section">
            <span className="field-label">上课周次</span>
            <div className="rule-tabs">{([['continuous','连续'],['odd','单周'],['even','双周'],['custom','自定义']] as const).map(([value, label]) => <button className={weekRule === value ? "active" : ""} onClick={() => setWeekRule(value)} key={value}>{label}</button>)}</div>
            {weekRule === "custom" ? (
              <label className="field custom-weeks"><span>指定周次</span><input value={customWeeks} onChange={(event) => setCustomWeeks(event.target.value)} placeholder="例如：1-4, 7, 9-12" /><small>支持逗号和范围</small></label>
            ) : (
              <div className="week-range"><label className="field"><span>开始周</span><input type="number" min="1" max={MAX_ACADEMIC_WEEK} value={weekStart} onChange={(event) => setWeekStart(Number(event.target.value))} /></label><span>至</span><label className="field"><span>结束周</span><input type="number" min="1" max={MAX_ACADEMIC_WEEK} value={weekEnd} onChange={(event) => setWeekEnd(Number(event.target.value))} /></label></div>
            )}
          </div>

          <div className="form-section">
            <span className="field-label">课程颜色</span>
            <div className="color-picker">{colors.map((item) => <button className={`color-choice color-${item} ${color === item ? "active" : ""}`} aria-label={item} onClick={() => setColor(item)} key={item}>{color === item && <Icon name="check" />}</button>)}</div>
          </div>

          <div className="form-section">
            <span className="field-label">上课提醒</span>
            <label className="field reminder-editor-field"><span>提前通知</span><select value={reminderMinutes} onChange={(event) => setReminderMinutes(event.target.value)}>
              <option value="default">跟随全局默认</option>
              <option value="off">这门课不提醒</option>
              {[5, 10, 15, 20, 30, 45, 60].map((minutes) => <option value={minutes} key={minutes}>提前 {minutes} 分钟</option>)}
            </select><small>保存后会自动重新安排系统通知</small></label>
          </div>

          <label className="field"><span>备注</span><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：单周上课、携带实验服……" rows={2} /></label>
          {error && <div className="form-error"><Icon name="warning" />{error}</div>}
        </div>

        <footer className="dialog-footer course-editor-footer">
          <div>{meeting && onDelete && <button className={`danger-button ${confirmDelete ? "confirm" : ""}`} onClick={() => confirmDelete ? onDelete(meeting.id) : setConfirmDelete(true)}><Icon name="trash" />{confirmDelete ? "再次点击确认删除" : "删除课程"}</button>}</div>
          <div className="footer-actions"><button className="cancel-button" onClick={onClose}>取消</button><button className="primary-button" onClick={save}>保存课程</button></div>
        </footer>
    </DialogSurface>
  );
}
