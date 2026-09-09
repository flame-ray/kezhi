import { useState } from "react";
import type { GradeRecord } from "../grades/gradeCenter";
import { Icon } from "../ui/Icon";
import { DialogSurface } from "../ui/DialogSurface";

interface GradeEditorDialogProps {
  grade?: GradeRecord;
  defaultYear: number;
  defaultSemester: 1 | 2;
  onSave: (grade: GradeRecord) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

export function GradeEditorDialog({ grade, defaultYear, defaultSemester, onSave, onDelete, onClose }: GradeEditorDialogProps) {
  const [courseName, setCourseName] = useState(grade?.courseName ?? "");
  const [courseCode, setCourseCode] = useState(grade?.courseCode ?? "");
  const [score, setScore] = useState(grade?.score ?? "");
  const [credits, setCredits] = useState(String(grade?.credits ?? ""));
  const [gradePoint, setGradePoint] = useState(grade?.gradePoint === undefined ? "" : String(grade.gradePoint));
  const [academicYear, setAcademicYear] = useState(grade?.academicYear ?? defaultYear);
  const [semester, setSemester] = useState<1 | 2>(grade?.semester ?? defaultSemester);
  const [category, setCategory] = useState(grade?.category ?? "");
  const [error, setError] = useState<string>();

  const submit = () => {
    const parsedCredits = Number(credits);
    const parsedPoint = gradePoint.trim() ? Number(gradePoint) : undefined;
    if (!courseName.trim() || !score.trim()) {
      setError("请填写课程名称和成绩");
      return;
    }
    if (!Number.isFinite(parsedCredits) || parsedCredits < 0 || parsedCredits > 30) {
      setError("学分应为 0–30 之间的数字");
      return;
    }
    if (parsedPoint !== undefined && (!Number.isFinite(parsedPoint) || parsedPoint < 0 || parsedPoint > 5)) {
      setError("绩点应为 0–5 之间的数字");
      return;
    }
    onSave({
      id: grade?.id ?? newId("grade"),
      courseName: courseName.trim().slice(0, 160),
      courseCode: courseCode.trim().slice(0, 120),
      score: score.trim().slice(0, 40),
      credits: Math.round(parsedCredits * 100) / 100,
      gradePoint: parsedPoint === undefined ? undefined : Math.round(parsedPoint * 100) / 100,
      academicYear,
      semester,
      category: category.trim().slice(0, 80) || undefined,
      source: grade?.source ?? "manual",
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <DialogSurface className="grade-editor-dialog" labelledBy="grade-editor-title" onClose={onClose}>
        <header className="dialog-header"><div><span className="eyebrow">本地成绩记录</span><h2 id="grade-editor-title">{grade ? "编辑成绩" : "录入成绩"}</h2><p>支持百分制、等级制和“待公布”等状态。</p></div><button className="icon-button" onClick={onClose}><Icon name="close" /></button></header>
        <div className="dialog-body grade-editor-body">
          <label className="field wide"><span>课程名称</span><input value={courseName} onChange={(event) => setCourseName(event.target.value)} placeholder="例如：高等数学（一）" /></label>
          <label className="field"><span>课程编号</span><input value={courseCode} onChange={(event) => setCourseCode(event.target.value)} placeholder="可选" /></label>
          <label className="field"><span>课程类别</span><input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="必修 / 选修" /></label>
          <label className="field"><span>成绩</span><input value={score} onChange={(event) => setScore(event.target.value)} placeholder="92 / 优秀 / 通过" /></label>
          <label className="field"><span>学分</span><input inputMode="decimal" value={credits} onChange={(event) => setCredits(event.target.value)} placeholder="3" /></label>
          <label className="field"><span>绩点（可选）</span><input inputMode="decimal" value={gradePoint} onChange={(event) => setGradePoint(event.target.value)} placeholder="自动估算" /></label>
          <label className="field"><span>学年</span><input type="number" min="2000" max="2100" value={academicYear} onChange={(event) => setAcademicYear(Math.min(2100, Math.max(2000, Number(event.target.value))))} /></label>
          <label className="field"><span>学期</span><select value={semester} onChange={(event) => setSemester(Number(event.target.value) as 1 | 2)}><option value="1">第一学期</option><option value="2">第二学期</option></select></label>
          {error && <div className="form-error wide"><Icon name="warning" />{error}</div>}
        </div>
        <footer className="dialog-footer">{grade && onDelete ? <button className="danger-button" onClick={() => onDelete(grade.id)}><Icon name="trash" />删除</button> : <span />}<div className="footer-actions"><button className="cancel-button" onClick={onClose}>取消</button><button className="primary-button" onClick={submit}><Icon name="check" />保存成绩</button></div></footer>
    </DialogSurface>
  );
}

function newId(prefix: string): string {
  return typeof crypto.randomUUID === "function" ? `${prefix}-${crypto.randomUUID()}` : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
