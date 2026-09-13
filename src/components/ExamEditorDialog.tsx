import { useState } from 'react';
import { EXAM_REMINDER_CHOICES, examConflicts, examError, localDateKey, type ExamRecord } from '../exams/exams';
import { DialogSurface } from '../ui/DialogSurface';
import { Icon } from '../ui/Icon';

export function ExamEditorDialog({ exam, exams, remindersEnabled, onSave, onDelete, onClose }: {
  exam?: ExamRecord; exams: ExamRecord[]; remindersEnabled: boolean;
  onSave: (exam: ExamRecord) => void; onDelete: (id: string) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState<ExamRecord>(() => exam ?? { id: `exam-${crypto.randomUUID()}`, title: '', date: localDateKey(new Date()), startTime: '09:00', endTime: '11:00', location: '', seat: '', note: '', reminderMinutes: [1440,30] });
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmConflict, setConfirmConflict] = useState(false);
  const change = <K extends keyof ExamRecord>(key: K, value: ExamRecord[K]) => { setDraft(old => ({ ...old, [key]: value })); setConfirmConflict(false); setConfirmDelete(false); setError(''); };
  const save = () => {
    const next = { ...draft, title: draft.title.trim(), location: draft.location.trim(), seat: draft.seat.trim(), note: draft.note.trim() };
    const invalid = examError(next); if (invalid) { setError(invalid); return; }
    const conflicts = examConflicts(next, exams);
    if (conflicts.length && !confirmConflict) { setConfirmConflict(true); setError(`时间与「${conflicts.map(item => item.title).join('、')}」重叠，确认后可继续保存。`); return; }
    onSave(next);
  };
  return <DialogSurface className="grade-editor-dialog" labelledBy="exam-editor-title" onClose={onClose}>
    <header className="dialog-header"><div><span className="eyebrow">按实际日期安排</span><h2 id="exam-editor-title">{exam ? '编辑考试' : '添加考试'}</h2><p>考试独立于课表周次，不随开学日期改变。</p></div><button className="icon-button" aria-label="关闭考试编辑" onClick={onClose}><Icon name="close" /></button></header>
    <div className="dialog-body grade-editor-body exam-editor-body">
      <label className="field wide"><span>考试名称</span><input maxLength={160} value={draft.title} onChange={e => change('title', e.target.value)} placeholder="例如：高等数学期末考试" /></label>
      <label className="field wide"><span>考试日期</span><input type="date" min="2000-01-01" max="2099-12-31" value={draft.date} onChange={e => change('date', e.target.value)} /></label>
      <label className="field"><span>开始时间</span><input type="time" value={draft.startTime} onChange={e => change('startTime', e.target.value)} /></label>
      <label className="field"><span>结束时间</span><input type="time" value={draft.endTime} onChange={e => change('endTime', e.target.value)} /></label>
      <label className="field"><span>考场</span><input maxLength={200} value={draft.location} onChange={e => change('location', e.target.value)} placeholder="可稍后补充" /></label>
      <label className="field"><span>座位号</span><input maxLength={40} value={draft.seat} onChange={e => change('seat', e.target.value)} placeholder="可选" /></label>
      <label className="field wide"><span>备注</span><textarea rows={3} maxLength={2000} value={draft.note} onChange={e => change('note', e.target.value)} placeholder="携带证件、考试范围…" /></label>
      <fieldset className="exam-reminders wide"><legend>提前提醒（可多选）</legend>{EXAM_REMINDER_CHOICES.map(minutes => <label key={minutes}><input type="checkbox" checked={draft.reminderMinutes.includes(minutes)} onChange={e => change('reminderMinutes', e.target.checked ? [...draft.reminderMinutes, minutes] : draft.reminderMinutes.filter(value => value !== minutes))} />{minutes === 1440 ? '1 天' : `${minutes} 分钟`}</label>)}<p>{remindersEnabled ? '提醒由系统调度，实际送达受通知权限与省电影响。' : '尚未开启系统提醒；保存后请到设置开启。'}</p></fieldset>
      {error && <p className="form-error wide" role="alert">{error}</p>}
      {confirmDelete && <p className="form-error wide" role="alert">确认删除这场考试？删除后仍可在考试中心撤销。</p>}
    </div>
    <footer className="dialog-footer">{exam ? <button className="danger-button" onClick={() => confirmDelete ? onDelete(exam.id) : setConfirmDelete(true)}>{confirmDelete ? '确认删除' : '删除考试'}</button> : <span />}<div><button className="cancel-button" onClick={onClose}>取消</button><button className="primary-button" onClick={save}>{confirmConflict ? '仍然保存' : '保存考试'}</button></div></footer>
  </DialogSurface>;
}
