export interface ExamRecord {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  seat: string;
  note: string;
  reminderMinutes: number[];
}

export const EXAM_REMINDER_CHOICES = [1440, 60, 30, 15] as const;
export const MAX_EXAMS = 1000;
export function validExamDate(value: string): boolean {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) && localDateKey(date) === value;
}
export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function examError(exam: ExamRecord): string | undefined {
  if (!exam.id?.trim() || exam.id.length > 200 || !exam.title?.trim() || exam.title.length > 160) return '请填写考试名称（最多 160 字）';
  if (!validExamDate(exam.date)) return '请选择有效的考试日期（2000–2099 年）';
  if (![exam.startTime, exam.endTime].every(value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value)) || exam.startTime >= exam.endTime) return '结束时间必须晚于开始时间';
  if (exam.location.length > 200 || exam.seat.length > 40 || exam.note.length > 2000) return '考场、座位号或备注超过长度限制';
  if (!Array.isArray(exam.reminderMinutes) || exam.reminderMinutes.some(value => !EXAM_REMINDER_CHOICES.includes(value as typeof EXAM_REMINDER_CHOICES[number])) || new Set(exam.reminderMinutes).size !== exam.reminderMinutes.length) return '考试提醒时间无效';
}
export function parseExams(value: unknown): ExamRecord[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_EXAMS) throw new Error('考试记录格式无效或超过 1000 条');
  const ids = new Set<string>();
  return value.map(raw => {
    if (!raw || typeof raw !== 'object' || ['id','title','date','startTime','endTime','location','seat','note'].some(key => typeof raw[key] !== 'string')) throw new Error('考试记录缺少必要字段');
    const exam: ExamRecord = { id: raw.id, title: raw.title, date: raw.date, startTime: raw.startTime, endTime: raw.endTime, location: raw.location, seat: raw.seat, note: raw.note, reminderMinutes: raw.reminderMinutes };
    const error = examError(exam);
    if (error) throw new Error(error);
    if (ids.has(exam.id)) throw new Error('考试记录标识重复');
    ids.add(exam.id);
    return exam;
  });
}
export function examStart(exam: ExamRecord): Date { return new Date(`${exam.date}T${exam.startTime}:00`); }
export function examEnd(exam: ExamRecord): Date { return new Date(`${exam.date}T${exam.endTime}:00`); }
export function examState(exam: ExamRecord, now = new Date()): string {
  if (now >= examEnd(exam)) return '已结束';
  if (now >= examStart(exam)) return '考试中';
  const days = Math.round((new Date(`${exam.date}T12:00:00`).getTime() - new Date(`${localDateKey(now)}T12:00:00`).getTime()) / 86400000);
  return days === 0 ? '今天考试' : days === 1 ? '明天考试' : `还有 ${days} 天`;
}
export function examConflicts(exam: ExamRecord, all: ExamRecord[]): ExamRecord[] {
  return all.filter(other => other.id !== exam.id && other.date === exam.date && other.startTime < exam.endTime && other.endTime > exam.startTime);
}
export function mergeExams(existing: ExamRecord[], incoming: ExamRecord[]): ExamRecord[] {
  const result = [...existing];
  for (const exam of incoming) {
    const duplicate = result.some(item => item.id === exam.id || (item.title === exam.title && item.date === exam.date && item.startTime === exam.startTime && item.endTime === exam.endTime && item.location === exam.location));
    if (!duplicate) result.push(exam);
  }
  return parseExams(result);
}
