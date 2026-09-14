import { useEffect, useMemo, useRef, useState } from 'react';
import { EXAM_REMINDER_CHOICES, examConflicts, examError, localDateKey, type ExamRecord } from '../exams/exams';
import { DialogSurface } from '../ui/DialogSurface';
import { Icon } from '../ui/Icon';
import type { CourseMeeting } from '../domain/schedule';
import { examSuggestionGroups, MAX_STUDY_TASKS, MAX_STUDY_TASK_TITLE, parseStudyTasks, studyProgress, type StudyTask } from '../exams/studyTasks';
import type { GradeRecord } from '../grades/gradeCenter';

export function ExamEditorDialog({ exam, exams, courses = [], grades = [], remindersEnabled, onSave, onDelete, onClose }: {
  exam?: ExamRecord; exams: ExamRecord[]; remindersEnabled: boolean;
  courses?: CourseMeeting[];
  grades?: GradeRecord[];
  onSave: (exam: ExamRecord) => void; onDelete: (id: string) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState<ExamRecord>(() => exam ?? { id: `exam-${crypto.randomUUID()}`, title: '', date: localDateKey(new Date()), startTime: '09:00', endTime: '11:00', location: '', seat: '', note: '', reminderMinutes: [1440,30] });
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmConflict, setConfirmConflict] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [removedTask, setRemovedTask] = useState<{ task: StudyTask; index: number }>();
  const [suggestion, setSuggestion] = useState('');
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (error) errorRef.current?.scrollIntoView({ block: 'nearest' }); }, [error]);
  const suggestions = useMemo(() => examSuggestionGroups(courses, grades), [courses, grades]);
  const tasks = draft.studyTasks ?? [];
  const progress = studyProgress(tasks);
  const change = <K extends keyof ExamRecord>(key: K, value: ExamRecord[K]) => { setDraft(old => ({ ...old, [key]: value })); setConfirmConflict(false); setConfirmDelete(false); setError(''); };
  const withPendingTask = () => parseStudyTasks([...tasks, { id: `task-${crypto.randomUUID()}`, title: taskTitle.trim(), done: false }]);
  const addTask = () => {
    try { change('studyTasks', withPendingTask()); setTaskTitle(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '无法添加复习任务'); }
  };
  const save = () => {
    let preparedTasks = draft.studyTasks;
    try { if (taskTitle.trim()) preparedTasks = withPendingTask(); else if (preparedTasks) preparedTasks = parseStudyTasks(preparedTasks); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '复习清单无效'); return; }
    const next = { ...draft, ...(preparedTasks ? { studyTasks: preparedTasks } : {}), title: draft.title.trim(), location: draft.location.trim(), seat: draft.seat.trim(), note: draft.note.trim() };
    const invalid = examError(next); if (invalid) { setError(invalid); return; }
    const conflicts = examConflicts(next, exams);
    const timingChanged = !exam || next.date !== exam.date || next.startTime !== exam.startTime || next.endTime !== exam.endTime;
    if (timingChanged && conflicts.length && !confirmConflict) { setConfirmConflict(true); setError(`时间与「${conflicts.map(item => item.title).join('、')}」重叠，确认后可继续保存。`); return; }
    onSave(next);
  };
  return <DialogSurface className="grade-editor-dialog" labelledBy="exam-editor-title" onClose={onClose}>
    <header className="dialog-header"><div><span className="eyebrow">按实际日期安排</span><h2 id="exam-editor-title">{exam ? '编辑考试' : '添加考试'}</h2><p>考试独立于课表周次，不随开学日期改变。</p></div><button className="icon-button" aria-label="关闭考试编辑" onClick={onClose}><Icon name="close" /></button></header>
    <div className="dialog-body grade-editor-body exam-editor-body">
      {!exam && suggestions.length > 0 && <label className="field wide exam-course-suggestion"><span>从课表或成绩快速填写</span><select value={suggestion} onChange={event => { setSuggestion(event.target.value); if (event.target.value) change('title', event.target.value); }}><option value="">选择已有课程（可选）</option>{suggestions.map(group => <optgroup key={group.label} label={group.label}>{group.names.map(title => <option key={title} value={title}>{title}</option>)}</optgroup>)}</select><small>只填写考试名称；成绩可来自历史学期，不代表已安排考试。日期和考场请以考试通知为准。</small></label>}
      <label className="field wide"><span>考试名称</span><input maxLength={160} value={draft.title} onChange={e => change('title', e.target.value)} placeholder="例如：高等数学期末考试" /></label>
      <label className="field wide"><span>考试日期</span><input type="date" min="2000-01-01" max="2099-12-31" value={draft.date} onChange={e => change('date', e.target.value)} /></label>
      <label className="field"><span>开始时间</span><input type="time" value={draft.startTime} onChange={e => change('startTime', e.target.value)} /></label>
      <label className="field"><span>结束时间</span><input type="time" value={draft.endTime} onChange={e => change('endTime', e.target.value)} /></label>
      <label className="field"><span>考场</span><input maxLength={200} value={draft.location} onChange={e => change('location', e.target.value)} placeholder="可稍后补充" /></label>
      <label className="field"><span>座位号</span><input maxLength={40} value={draft.seat} onChange={e => change('seat', e.target.value)} placeholder="可选" /></label>
      <label className="field wide"><span>备注</span><textarea rows={3} maxLength={2000} value={draft.note} onChange={e => change('note', e.target.value)} placeholder="携带证件、考试范围…" /></label>
      <section className="study-editor wide" aria-label="复习清单">
        <div className="study-heading"><h3>复习清单</h3><span>{progress.completed} / {progress.total} 已完成</span></div>
        {tasks.length > 0 && <div className="study-progress" role="progressbar" aria-label="复习进度" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.completed}><i style={{ transform: `scaleX(${progress.fraction})` }} /></div>}
        {!tasks.length && <p>把复习拆成小任务，例如“复习第一章”“整理错题”。</p>}
        <div className="study-task-list">{tasks.map((task,index) => <div className={`study-task ${task.done ? 'done' : ''}`} key={task.id}>
          <input type="checkbox" aria-label={`完成任务：${task.title}`} checked={task.done} onChange={event => change('studyTasks', tasks.map(item => item.id === task.id ? { ...item, done: event.target.checked } : item))} />
          <input type="text" aria-label={`复习任务 ${index+1}`} maxLength={MAX_STUDY_TASK_TITLE} value={task.title} onChange={event => change('studyTasks', tasks.map(item => item.id === task.id ? { ...item, title: event.target.value } : item))} />
          <button className="icon-button" aria-label={`删除任务：${task.title}`} onClick={() => { setRemovedTask({task,index}); change('studyTasks', tasks.filter(item => item.id !== task.id)); }}><Icon name="close" /></button>
        </div>)}</div>
        <div className="study-add"><input aria-label="新复习任务" maxLength={MAX_STUDY_TASK_TITLE} value={taskTitle} placeholder={tasks.length >= MAX_STUDY_TASKS ? '已达到 30 项上限' : '添加一项复习任务'} disabled={tasks.length >= MAX_STUDY_TASKS} onChange={event => {setTaskTitle(event.target.value);setConfirmConflict(false);}} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); if(taskTitle.trim()) addTask(); } }} /><button className="soft-button" disabled={!taskTitle.trim() || tasks.length >= MAX_STUDY_TASKS} onClick={addTask}>添加任务</button></div>
        {removedTask && <button className="soft-button" disabled={tasks.length >= MAX_STUDY_TASKS} onClick={() => { const restored = [...tasks]; restored.splice(Math.min(removedTask.index, restored.length),0,removedTask.task); change('studyTasks', restored); setRemovedTask(undefined); }}>撤销删除任务</button>}
        <small>点“保存考试”后生效；仅存本机和 JSON 备份，不写入日历文件。</small>
      </section>
      <fieldset className="exam-reminders wide"><legend>提前提醒（可多选）</legend>{EXAM_REMINDER_CHOICES.map(minutes => <label key={minutes}><input type="checkbox" checked={draft.reminderMinutes.includes(minutes)} onChange={e => change('reminderMinutes', e.target.checked ? [...draft.reminderMinutes, minutes] : draft.reminderMinutes.filter(value => value !== minutes))} />{minutes === 1440 ? '1 天' : `${minutes} 分钟`}</label>)}<p>{remindersEnabled ? '提醒由系统调度，实际送达受通知权限与省电影响。' : '尚未开启系统提醒；保存后请到设置开启。'}</p></fieldset>
      {error && <p ref={errorRef} className="form-error wide" role="alert">{error}</p>}
      {confirmDelete && <p className="form-error wide" role="alert">确认删除这场考试？删除后仍可在考试中心撤销。</p>}
    </div>
    <footer className="dialog-footer">{exam ? <button className="danger-button" onClick={() => confirmDelete ? onDelete(exam.id) : setConfirmDelete(true)}>{confirmDelete ? '确认删除' : '删除考试'}</button> : <span />}<div><button className="cancel-button" onClick={onClose}>取消</button><button className="primary-button" onClick={save}>{confirmConflict ? '仍然保存' : '保存考试'}</button></div></footer>
  </DialogSurface>;
}
