import {describe,expect,it} from 'vitest';
import {parseWidgetTarget,resolveWidgetCourse} from './widgetNavigation';
import {demoCourses} from '../data/demo';
import {resolveCourseOccurrences} from '../domain/courseExceptions';
const calendar={weekOneStartsOn:new Date(2026,8,14,12),teachingStartsOn:new Date(2026,8,17,12)};
const course={...demoCourses[0],id:'sample',day:4 as const,weeks:[1,3]};
const target={id:'sample',date:'2026-09-17',token:'test-token'};
describe('widget navigation',()=>{
  it('accepts only bounded valid identifiers and calendar dates',()=>{
    expect(parseWidgetTarget(target)).toEqual(target);
    for(const value of [null,{}, {...target,date:'2026-02-30'},{...target,date:'bad'},{...target,id:''},{...target,token:'x'.repeat(129)}]) expect(parseWidgetTarget(value)).toBeUndefined();
  });
  it('matches occurrence ID and actual date instead of ambiguous course names',()=>{
    expect(resolveWidgetCourse(target,[course],calendar)).toEqual(course);
    expect(resolveWidgetCourse({...target,date:'2026-09-24'},[course],calendar)).toBeUndefined();
    expect(resolveWidgetCourse(target,[{...course,id:'another'}],calendar)).toBeUndefined();
    expect(resolveWidgetCourse(target,[{...course,status:'cancelled'}],calendar)).toBeUndefined();
  });
  it('opens moved instances and rejects their stale original target',()=>{
    const effective=resolveCourseOccurrences([course],[{courseId:'sample',originalDate:'2026-09-17',kind:'move',targetDate:'2026-09-18',startPeriod:3,endPeriod:4,location:'B301'}],calendar);
    expect(resolveWidgetCourse(target,effective,calendar)).toBeUndefined();
    const moved=effective.find(c=>c.status==='changed')!;
    expect(resolveWidgetCourse({...target,id:moved.id,date:'2026-09-18'},effective,calendar)?.location).toBe('B301');
  });
});
