import { describe, it, expect } from 'vitest';
import { examCourseSuggestions, examSuggestionGroups, parseStudyTasks, studyProgress } from './studyTasks';
import { mergeExams, parseExams, type ExamRecord } from './exams';
import type { GradeRecord } from '../grades/gradeCenter';
import { buildExamCalendar, parseExamCalendar } from './examCalendar';
import { buildScheduleJson } from '../exporting/scheduleExport';
import { parseScheduleBackup } from '../importing/backupImport';
import { createImportSafetyBackup, restoreImportSafetyBackup } from '../importing/importSafetyBackup';
import { defaultPresets, demoCourses } from '../data/demo';
const tasks = [{id:'one',title:'复习第一章',done:true},{id:'two',title:'整理私人错题',done:false}];
const exam: ExamRecord = {id:'study-exam',title:'数学期末',date:'2090-12-25',startTime:'09:00',endTime:'11:00',location:'',seat:'',note:'带证件',reminderMinutes:[],studyTasks:tasks};
describe('exam preparation',()=>{
  it('shows empty, partial and complete progress without dividing by zero',()=>{expect(studyProgress()).toEqual({total:0,completed:0,fraction:0});expect(studyProgress(tasks)).toEqual({total:2,completed:1,fraction:.5});expect(studyProgress(tasks.map(task=>({...task,done:true}))).fraction).toBe(1);});
  it('clones and normalizes valid tasks',()=>{const parsed=parseStudyTasks([{...tasks[0],title:'  第一章  '}]);expect(parsed[0].title).toBe('第一章');parsed[0].done=false;expect(tasks[0].done).toBe(true);});
  it('rejects malformed, duplicate, overlong or oversized checklists',()=>{for(const input of [null,{},[tasks[0],tasks[0]],[{...tasks[0],done:'true'}],[{...tasks[0],title:' '}],[{...tasks[0],title:'字'.repeat(101)}],Array(31).fill(tasks[0])])expect(()=>parseStudyTasks(input)).toThrow();});
  it('keeps legacy exams valid and rejects corrupted new fields',()=>{const {studyTasks:_,...legacy}=exam;expect(parseExams([legacy])).toEqual([legacy]);expect(parseExams([exam])).toEqual([exam]);expect(()=>parseExams([{...exam,studyTasks:[{...tasks[0],done:1}]}])).toThrow();});
  it('deduplicates course meetings by name and never supplies an exam location',()=>{const sample=demoCourses[0];const names=examCourseSuggestions([{...sample,title:'高等数学'},{...sample,id:'two',title:' 高等数学 '},{...sample,id:'three',title:'英语'}]);expect(names).toHaveLength(2);expect(names).toContain('高等数学');expect(names).toContain('英语');expect(examCourseSuggestions([])).toEqual([]);});
  it('preserves study tasks in JSON backups and course-only recovery',()=>{const snapshot={courses:[],presets:defaultPresets,activePresetId:'summer',exams:[exam]};const json=buildScheduleJson({snapshot,preset:defaultPresets[0],calendar:{weekOneStartsOn:new Date(2090,8,4,12),teachingStartsOn:new Date(2090,8,4,12)},termName:'测试'});expect(parseScheduleBackup(json).exams?.[0].studyTasks).toEqual(tasks);const importBackup=createImportSafetyBackup({...snapshot,exams:[]},'测试');expect(restoreImportSafetyBackup({...snapshot,importBackup}).exams?.[0].studyTasks).toEqual(tasks);});
  it('does not leak private study tasks into ICS exports',()=>{const ics=buildExamCalendar([exam]);expect(ics).not.toContain('整理私人错题');expect(ics).not.toContain('studyTasks');expect(parseExamCalendar(ics).exams[0].studyTasks).toBeUndefined();});
  it('groups transcript names without duplicating timetable or revealing grades', () => {
    const grade: GradeRecord = { id:'grade',courseName:'离散数学',courseCode:'M101',academicYear:2025,semester:1,score:'58',credits:3,source:'manual',updatedAt:'2026-09-14T00:00:00Z' };
    const groups=examSuggestionGroups([demoCourses[0]], [grade,{...grade,id:'two',courseName:' 离散数学 '},{...grade,id:'three',courseName:demoCourses[0].title}]);
    expect(groups).toEqual([{label:'来自课表',names:[demoCourses[0].title]},{label:'来自成绩（含历史学期）',names:['离散数学']}]);
    expect(examSuggestionGroups([], [grade])).toEqual([{label:'来自成绩（含历史学期）',names:['离散数学']}]);
    expect(examSuggestionGroups([], [{...grade,courseName:' '},{...grade,courseName:'长'.repeat(161)}])).toEqual([]);
  });
  it('keeps private progress when the same calendar is imported again', () => {
    const incoming=parseExamCalendar(buildExamCalendar([exam])).exams;
    expect(mergeExams([exam],incoming)).toEqual([exam]);
    expect(mergeExams([exam],incoming.map(item=>({...item,id:'new-calendar-id'})))).toEqual([exam]);
    const merged=mergeExams([exam],[{...exam,id:'other-exam',title:'物理期末'}]);
    expect(merged).toHaveLength(2);
    merged[0].studyTasks![0].done=false;
    expect(exam.studyTasks![0].done).toBe(true);
  });
  it('rejects damaged checklist backups instead of silently losing tasks', () => {
    const snapshot={courses:[],presets:defaultPresets,activePresetId:'summer',exams:[exam]};
    const json=buildScheduleJson({snapshot,preset:defaultPresets[0],calendar:{weekOneStartsOn:new Date(2090,8,4,12),teachingStartsOn:new Date(2090,8,4,12)},termName:'测试'});
    const damaged=JSON.parse(json); damaged.exams[0].studyTasks[0].done='yes';
    expect(()=>parseScheduleBackup(JSON.stringify(damaged))).toThrow();
    expect(snapshot.exams[0].studyTasks).toEqual(tasks);
    expect(parseScheduleBackup(json).exams?.[0].studyTasks).toEqual(tasks);
  });
});
