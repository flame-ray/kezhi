import { describe, it, expect } from 'vitest';
import { examConflicts, examError, examState, mergeExams, parseExams, validExamDate, type ExamRecord } from './exams';
import { buildExamReminders } from './examReminders';
import { isCourseReminderNotificationId } from '../reminders/reminderSchedule';
import { defaultPresets } from '../data/demo';
import { buildScheduleJson } from '../exporting/scheduleExport';
import { parseScheduleBackup } from '../importing/backupImport';
import { createImportSafetyBackup, restoreImportSafetyBackup } from '../importing/importSafetyBackup';
const exam: ExamRecord = { id:'exam-test', title:'期末考试', date:'2026-12-25', startTime:'09:00', endTime:'11:00', location:'A301', seat:'12', note:'带证件', reminderMinutes:[1440,30] };
describe('independent exam records', () => {
  it('validates leap days instead of normalizing an invalid date', () => { expect(validExamDate('2026-02-29')).toBe(false); expect(validExamDate('2028-02-29')).toBe(true); expect(validExamDate('2026-13-01')).toBe(false); });
  it('rejects reversed time and invalid reminders', () => { expect(examError({...exam,endTime:'08:00'})).toBeTruthy(); expect(examError({...exam,startTime:'24:00'})).toBeTruthy(); expect(examError({...exam,reminderMinutes:[15,15]})).toBeTruthy(); expect(examError({...exam,reminderMinutes:[1]})).toBeTruthy(); });
  it('strictly rejects malformed data and duplicate ids', () => { expect(parseExams(undefined)).toEqual([]); expect(() => parseExams([{...exam, seat:42}])).toThrow(); expect(() => parseExams([{...exam,reminderMinutes:null}])).toThrow(); expect(() => parseExams([exam,exam])).toThrow(); expect(() => parseExams(Array(1001).fill(exam))).toThrow(); });
  it('detects overlapping exams but allows touching endpoints', () => { expect(examConflicts(exam,[{...exam,id:'other',startTime:'10:00'}])).toHaveLength(1); expect(examConflicts(exam,[{...exam,id:'other',startTime:'11:00',endTime:'12:00'}])).toHaveLength(0); expect(examConflicts(exam,[exam])).toHaveLength(0); });
  it('shows transitions at exact start and end', () => { expect(examState(exam,new Date('2026-12-24T09:00:00'))).toBe('明天考试'); expect(examState(exam,new Date('2026-12-25T08:59:59'))).toBe('今天考试'); expect(examState(exam,new Date('2026-12-25T09:00:00'))).toBe('考试中'); expect(examState(exam,new Date('2026-12-25T11:00:00'))).toBe('已结束'); });
  it('merges without duplicating records', () => { expect(mergeExams([exam],[{...exam,id:'new-id'}])).toEqual([exam]); });
  it('schedules multiple reminders without needing a term or course', () => { const items=buildExamReminders([exam],true,new Date('2026-12-23T12:00:00')); expect(items).toHaveLength(2); expect(items[0].at).toEqual(new Date('2026-12-24T09:00:00')); expect(items[1].at).toEqual(new Date('2026-12-25T08:30:00')); expect(items[0].body).toContain('座位 12'); expect(items.every(item=>isCourseReminderNotificationId(item.id))).toBe(true); expect(items.map(item=>item.id)).toEqual(buildExamReminders([exam],true,new Date('2026-12-23T12:00:00')).map(item=>item.id)); });
  it('does not schedule disabled or past notifications; leaves selection ids unmanaged', () => { expect(buildExamReminders([exam],false)).toEqual([]); expect(buildExamReminders([exam],true,new Date('2026-12-25T08:30:00'))).toEqual([]); expect(isCourseReminderNotificationId(2000000001)).toBe(false); });
  it('round trips exams in JSON backup, but preserves them on course-only rollback', () => {
    const snapshot = {courses:[],presets:defaultPresets,activePresetId:'summer',exams:[exam]};
    const json=buildScheduleJson({snapshot,preset:defaultPresets[0],calendar:{weekOneStartsOn:new Date(2026,8,14,12),teachingStartsOn:new Date(2026,8,17,12)},termName:'测试'});
    expect(parseScheduleBackup(json).exams).toEqual([exam]);
    const backup=createImportSafetyBackup({...snapshot,exams:[]},'测试');
    expect(restoreImportSafetyBackup({...snapshot,importBackup:backup}).exams).toEqual([exam]);
    const legacy=JSON.parse(json); delete legacy.exams;
    expect(parseScheduleBackup(JSON.stringify(legacy)).exams).toBeUndefined();
    expect(() => parseScheduleBackup(JSON.stringify({...legacy,exams:[{...exam,date:'wrong'}]}))).toThrow();
  });
});
