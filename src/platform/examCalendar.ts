import { invoke } from '@tauri-apps/api/core';
import { downloadText } from '../exporting/scheduleExport';
import { buildExamCalendar } from '../exams/examCalendar';
import { localDateKey, type ExamRecord } from '../exams/exams';
import { getRuntimeCapabilities } from './runtime';
export async function exportExamCalendar(exams: ExamRecord[]): Promise<boolean> {
  const content=buildExamCalendar(exams);
  if(getRuntimeCapabilities().platform==='android') return (await invoke<{saved:boolean}>('save_exam_calendar',{content})).saved;
  downloadText(content,`Kezhi-exams-${localDateKey(new Date())}.ics`,'text/calendar;charset=utf-8');
  return true;
}
