import type { CourseMeeting } from '../domain/schedule';
import type { GradeRecord } from '../grades/gradeCenter';

export interface StudyTask { id: string; title: string; done: boolean }
export const MAX_STUDY_TASKS = 30;
export const MAX_STUDY_TASK_TITLE = 100;

export function parseStudyTasks(value: unknown): StudyTask[] {
  if (!Array.isArray(value) || value.length > MAX_STUDY_TASKS) throw new Error('每场考试最多添加 30 项复习任务');
  const ids = new Set<string>();
  return value.map(raw => {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id.trim() || raw.id.length > 100 || ids.has(raw.id)) throw new Error('复习任务标识无效或重复');
    if (typeof raw.title !== 'string' || !raw.title.trim() || raw.title.length > MAX_STUDY_TASK_TITLE || typeof raw.done !== 'boolean') throw new Error('请填写复习任务名称（最多 100 字）');
    ids.add(raw.id);
    return { id: raw.id, title: raw.title.trim(), done: raw.done };
  });
}

export function studyProgress(tasks: StudyTask[] = []) {
  const total = tasks.length, completed = tasks.filter(task => task.done).length;
  return { total, completed, fraction: total ? completed / total : 0 };
}

export function examCourseSuggestions(courses: CourseMeeting[]): string[] {
  // Meetings are not exams: only reuse the name, never the room, date or times.
  return [...new Set(courses.map(course => course.title.trim()).filter(title => title && title.length <= 160))].sort((a,b) => a.localeCompare(b,'zh-CN'));
}

export function examSuggestionGroups(courses: CourseMeeting[], grades: GradeRecord[] = []) {
  const timetable = examCourseSuggestions(courses);
  const existing = new Set(timetable);
  const transcript = [...new Set(grades.map(grade => grade.courseName.trim()).filter(title => title && title.length <= 160 && !existing.has(title)))].sort((a,b) => a.localeCompare(b,'zh-CN'));
  return [{ label: '来自课表', names: timetable }, { label: '来自成绩（含历史学期）', names: transcript }].filter(group => group.names.length > 0);
}
