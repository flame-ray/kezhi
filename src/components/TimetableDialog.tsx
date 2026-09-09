import type { StudentGrade, TimetablePreset } from "../domain/schedule";
import { appendTimetablePeriod } from "../domain/timetable";
import { Icon } from "../ui/Icon";
import { DialogSurface } from "../ui/DialogSurface";

interface TimetableDialogProps {
  presets: TimetablePreset[];
  activeId: string;
  termStartsOn: string;
  teachingStartsOn: string;
  studentGrade: StudentGrade;
  onStudentGradeChange: (value: StudentGrade) => void;
  onTermStartChange: (value: string) => void;
  onTeachingStartChange: (value: string) => void;
  onActivate: (id: string) => void;
  onChange: (preset: TimetablePreset) => void;
  onCreate: () => void;
  onClose: () => void;
}

export function TimetableDialog({
  presets,
  activeId,
  termStartsOn,
  teachingStartsOn,
  studentGrade,
  onStudentGradeChange,
  onTermStartChange,
  onTeachingStartChange,
  onActivate,
  onChange,
  onCreate,
  onClose,
}: TimetableDialogProps) {
  const active = presets.find((preset) => preset.id === activeId) ?? presets[0];
  const appendedPreset = appendTimetablePeriod(active);

  return (
    <DialogSurface className="timetable-dialog" labelledBy="timetable-title" onClose={onClose}>
        <header className="dialog-header">
          <div><span className="eyebrow">作息方案</span><h2 id="timetable-title">让时间适应你的学校</h2></div>
          <button className="icon-button" onClick={onClose}><Icon name="close" /></button>
        </header>

        <div className="timetable-scroll">
        <div className="calendar-date-settings">
          <div className="term-date-setting">
            <div><strong>当前年级</strong><span>切换年级会自动采用对应校历，你仍可继续修改日期</span></div>
            <label>
              <Icon name="school" />
              <select value={studentGrade} onChange={(event) => onStudentGradeChange(Number(event.target.value) as StudentGrade)}>
                <option value={1}>大一</option><option value={2}>大二</option><option value={3}>大三</option><option value={4}>大四</option><option value={5}>大五 / 五年制</option>
              </select>
            </label>
          </div>
          <div className="term-date-setting">
            <div><strong>第 1 周周一</strong><span>决定每一周与每天显示的日期</span></div>
            <label>
              <Icon name="calendar" />
              <input type="date" value={termStartsOn} onChange={(event) => onTermStartChange(event.target.value)} />
            </label>
          </div>
          <div className="term-date-setting">
            <div><strong>正式上课日</strong><span>此前的格子不会显示课程、导出日历或安排提醒</span></div>
            <label>
              <Icon name="today" />
              <input type="date" value={teachingStartsOn} min={termStartsOn} onChange={(event) => onTeachingStartChange(event.target.value)} />
            </label>
          </div>
        </div>

        <div className="preset-tabs">

          {presets.map((preset) => (
            <button className={preset.id === activeId ? "active" : ""} key={preset.id} onClick={() => onActivate(preset.id)}>{preset.name}</button>
          ))}
          <button className="add-preset" onClick={onCreate}><Icon name="plus" />新方案</button>
        </div>

        <div className="preset-title-row">
          <input
            aria-label="方案名称"
            value={active.name}
            onChange={(event) => onChange({ ...active, name: event.target.value })}
          />
          <span>{active.periods.length} 节课</span>
        </div>

        <div className="period-editor">
          {active.periods.map((period) => (
            <div className="period-editor-row" key={period.index}>
              <strong>{period.index}</strong>
              <label>开始<input type="time" value={period.start} onChange={(event) => onChange({ ...active, periods: active.periods.map((item) => item.index === period.index ? { ...item, start: event.target.value } : item) })} /></label>
              <span>—</span>
              <label>结束<input type="time" value={period.end} onChange={(event) => onChange({ ...active, periods: active.periods.map((item) => item.index === period.index ? { ...item, end: event.target.value } : item) })} /></label>
            </div>
          ))}
        </div>

        </div>
        <footer className="dialog-footer">
          <span>修改会自动保存在本机</span>
          <div className="footer-actions">
            <button className="soft-button" disabled={!appendedPreset} onClick={() => appendedPreset && onChange(appendedPreset)}><Icon name="plus" />添加下一节</button>
            <button className="primary-button" onClick={onClose}>完成</button>
          </div>
        </footer>
    </DialogSurface>
  );
}
