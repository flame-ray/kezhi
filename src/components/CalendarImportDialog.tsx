import { useRef, useState, type DragEvent } from "react";
import type { CourseMeeting, TimetablePreset } from "../domain/schedule";
import { parseIcsSchedule, type IcsImportResult } from "../importing/icsImport";
import { Icon } from "../ui/Icon";

export type CalendarImportMode = "merge" | "replace";

interface CalendarImportDialogProps {
  preset: TimetablePreset;
  currentTermStartsOn: string;
  hasExistingCourses: boolean;
  onImport: (courses: CourseMeeting[], termStartsOn: string, mode: CalendarImportMode) => void;
  onClose: () => void;
}

export function CalendarImportDialog({ preset, currentTermStartsOn, hasExistingCourses, onImport, onClose }: CalendarImportDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [sourceText, setSourceText] = useState("");
  const [fileName, setFileName] = useState("");
  const [termStartsOn, setTermStartsOn] = useState(hasExistingCourses ? currentTermStartsOn : "");
  const [result, setResult] = useState<IcsImportResult>();
  const [mode, setMode] = useState<CalendarImportMode>("merge");
  const [error, setError] = useState<string>();
  const [dragging, setDragging] = useState(false);

  const parseFile = async (file?: File) => {
    if (!file) return;
    setError(undefined);
    if (file.size > 5 * 1024 * 1024) {
      setError("日历文件不能超过 5 MB");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".ics")) {
      setError("请选择扩展名为 .ics 的日历文件");
      return;
    }
    try {
      const text = await file.text();
      const inferred = parseIcsSchedule(text, { preset });
      const selectedWeekOne = termStartsOn || (hasExistingCourses ? currentTermStartsOn : inferred.weekOneStartsOn);
      let parsed = inferred;
      if (selectedWeekOne !== inferred.weekOneStartsOn) {
        try {
          parsed = parseIcsSchedule(text, { preset, weekOneStartsOn: selectedWeekOne });
        } catch {
          parsed = { ...inferred, warnings: ["原学期日期与日历范围不匹配，已按最早课程所在周自动校准", ...inferred.warnings] };
        }
      }
      setSourceText(text);
      setFileName(file.name);
      setTermStartsOn(parsed.weekOneStartsOn);
      setResult(parsed);
    } catch (reason) {
      setSourceText("");
      setResult(undefined);
      setError(reason instanceof Error ? reason.message : "无法读取日历文件");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const updateTermStart = (value: string) => {
    setTermStartsOn(value);
    if (!sourceText || !value) return;
    try {
      setResult(parseIcsSchedule(sourceText, { preset, weekOneStartsOn: value }));
      setError(undefined);
    } catch (reason) {
      setResult(undefined);
      setError(reason instanceof Error ? reason.message : "无法按该日期换算周次");
    }
  };

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDragging(false);
    void parseFile(event.dataTransfer.files[0]);
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="dialog calendar-import-dialog" role="dialog" aria-modal="true" aria-labelledby="calendar-import-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="dialog-header">
          <div><span className="eyebrow">导入日历</span><h2 id="calendar-import-title">从 ICS 生成课表</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="关闭"><Icon name="close" /></button>
        </header>

        <div className="calendar-import-body">
          <input ref={inputRef} className="hidden-file-input" type="file" accept="text/calendar,.ics" onChange={(event) => void parseFile(event.target.files?.[0])} />
          <button
            type="button"
            className={`calendar-drop-zone ${dragging ? "dragging" : ""} ${result ? "ready" : ""}`}
            onClick={() => inputRef.current?.click()}
            onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <span className="calendar-file-icon"><Icon name={result ? "check" : "calendar"} /></span>
            <span><strong>{result ? fileName : "选择 ICS 日历文件"}</strong><small>{result ? "已解析，可重新选择文件" : "点击选择，或将文件拖到这里"}</small></span>
            <Icon name="upload" />
          </button>

          {result && (
            <div className="calendar-import-review">
              <div className="calendar-import-stats">
                <span><strong>{result.courses.length}</strong><small>课程安排</small></span>
                <span><strong>{result.occurrenceCount}</strong><small>上课课次</small></span>
                <span><strong>{result.skippedEvents}</strong><small>跳过事件</small></span>
              </div>
              <div className="calendar-date-range"><Icon name="today" /><span><strong>{result.firstDate} 至 {result.lastDate}</strong><small>已按“{preset.name}”匹配最接近的节次</small></span></div>
              <label className="field calendar-week-one"><span>第 1 周周一</span><input type="date" value={termStartsOn} onChange={(event) => updateTermStart(event.target.value)} /><small>修改后会立即重新计算每门课的周次</small></label>
              <div className="calendar-import-mode" role="radiogroup" aria-label="导入方式">
                <button type="button" role="radio" aria-checked={mode === "merge"} className={mode === "merge" ? "active" : ""} onClick={() => setMode("merge")}><Icon name="plus" /><span><strong>合并到现有课表</strong><small>自动合并同名、同地点和同节次课程</small></span></button>
                <button type="button" role="radio" aria-checked={mode === "replace"} className={mode === "replace" ? "active" : ""} onClick={() => setMode("replace")}><Icon name="refresh" /><span><strong>替换当前课程</strong><small>保留作息设置，仅替换课程内容</small></span></button>
              </div>
              {result.warnings.length > 0 && <div className="calendar-import-warning"><Icon name="warning" /><span><strong>{result.warnings.length} 项提示</strong><small>{result.warnings[0]}</small></span></div>}
            </div>
          )}
          {error && <div className="form-error"><Icon name="warning" />{error}</div>}
        </div>

        <footer className="dialog-footer">
          <button className="cancel-button" onClick={onClose}>取消</button>
          <button className="primary-button" disabled={!result} onClick={() => result && onImport(result.courses, result.weekOneStartsOn, mode)}>导入 {result?.courses.length ?? 0} 门课程</button>
        </footer>
      </section>
    </div>
  );
}
