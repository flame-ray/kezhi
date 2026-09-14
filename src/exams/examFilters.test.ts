import { describe, expect, it } from 'vitest';
import { filterExams, type ExamRecord } from './exams';
const now=new Date('2026-09-14T10:00:00');
const base:ExamRecord={id:'partial',title:'数学考试',date:'2026-09-14',startTime:'09:00',endTime:'11:00',location:'A301',seat:'',note:'带证件',reminderMinutes:[],studyTasks:[{id:'one',title:'第一章',done:false},{id:'two',title:'第二章',done:true}]};
const records:ExamRecord[]=[base,{...base,id:'complete',studyTasks:[{id:'one',title:'已完成',done:true}]},{...base,id:'legacy',studyTasks:undefined},{...base,id:'empty',studyTasks:[]},{...base,id:'past',date:'2026-09-13'},{...base,id:'future',date:'2026-09-15'}];
describe('exam filters',()=>{
  it('only shows unfinished checklists on ongoing and upcoming exams',()=>{
    expect(filterExams(records,'study','',now).map(exam=>exam.id)).toEqual(['partial','future']);
  });
  it('combines study filter with trimmed case-insensitive search',()=>{
    expect(filterExams(records,'study',' a301 ',now)).toHaveLength(2);
    expect(filterExams(records,'study','不存在',now)).toEqual([]);
    expect(filterExams(records,'study','证件',now)).toHaveLength(2);
  });
  it('removes exams at the exact end and reflects completed tasks',()=>{
    expect(filterExams([base],'study','',new Date('2026-09-14T11:00:00'))).toEqual([]);
    expect(filterExams([{...base,studyTasks:base.studyTasks!.map(task=>({...task,done:true}))}],'study','',now)).toEqual([]);
    expect(base.studyTasks![0].done).toBe(false);
  });
  it('preserves existing filters and sorting without mutating the input',()=>{
    const original=records.map(exam=>exam.id);
    expect(filterExams(records,'upcoming','',now)).toHaveLength(5);
    expect(filterExams(records,'past','',now).map(exam=>exam.id)).toEqual(['past']);
    expect(filterExams(records,'all','',now)).toHaveLength(6);
    const past=[{...base,id:'older',date:'2026-09-01'},{...base,id:'newer',date:'2026-09-12'}];
    expect(filterExams(past,'past','',now).map(exam=>exam.id)).toEqual(['newer','older']);
    expect(records.map(exam=>exam.id)).toEqual(original);
  });
});
