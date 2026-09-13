import type { ScheduledCourseReminder } from '../reminders/reminderSchedule';
import { examStart, type ExamRecord } from './exams';

export function buildExamReminders(exams: ExamRecord[], enabled: boolean, now = new Date()): ScheduledCourseReminder[] {
  if (!enabled) return [];
  const ids = new Set<number>();
  return exams.flatMap(exam => exam.reminderMinutes.flatMap(minutesBefore => {
    const at = new Date(examStart(exam).getTime() - minutesBefore * 60000);
    if (at <= now) return [];
    const key = `exam:${exam.id}:${minutesBefore}`;
    let hash = 2166136261;
    for (const letter of key) hash = Math.imul(hash ^ letter.charCodeAt(0), 16777619);
    let id = 500000000 + ((hash >>> 0) % 100000000);
    while (ids.has(id)) id = id === 599999999 ? 500000000 : id + 1;
    ids.add(id);
    return [{ id, key, courseId: exam.id, examId: exam.id, week: 0, minutesBefore, at,
      title: `${minutesBefore === 1440 ? '明天考试' : `${minutesBefore} 分钟后考试`} · ${exam.title}`,
      body: `${exam.date} ${exam.startTime}–${exam.endTime} · ${exam.location || '考场待定'}${exam.seat ? ` · 座位 ${exam.seat}` : ''}` }];
  })).sort((a,b) => a.at.getTime() - b.at.getTime());
}
