import { describe, expect, it } from 'vitest';
import { buildWidgetSnapshot } from './widgetSnapshot';
import { resolveCourseOccurrences } from '../domain/courseExceptions';
import { demoCourses, defaultPresets } from '../data/demo';
const calendar={weekOneStartsOn:new Date(2026,8,14,12),teachingStartsOn:new Date(2026,8,17,12)};
const course={...demoCourses[0],id:'sample',day:4 as const,weeks:[1,3],startPeriod:1,endPeriod:2,title:'数学',location:'A301'};
describe('widget projection',()=>{
  it('expands odd weeks and timetable periods without private fields',()=>{
    const data=buildWidgetSnapshot([course],calendar,defaultPresets[0]);
    expect(data.events.map(e=>e.date)).toEqual(['2026-09-17','2026-10-01']);
    expect(Object.keys(data.events[0]).sort()).toEqual(['date','end','location','start','title']);
    expect(data.events[0].start).toBe(defaultPresets[0].periods[0].start);
    expect(data.events[0].end).toBe(defaultPresets[0].periods[1].end);
  });
  it('excludes pre-opening and cancelled classes and clears empty schedules',()=>{
    expect(buildWidgetSnapshot([{...course,day:1,weeks:[1]},{...course,status:'cancelled'}],calendar,defaultPresets[0]).events).toEqual([]);
    expect(buildWidgetSnapshot([],calendar,defaultPresets[0])).toEqual({version:1,events:[]});
  });
  it('follows a single-date move and cancellation without keeping the old class',()=>{
    const effective=resolveCourseOccurrences([course],[{courseId:'sample',originalDate:'2026-09-17',kind:'move',targetDate:'2026-09-18',startPeriod:3,endPeriod:4,location:'B201'},{courseId:'sample',originalDate:'2026-10-01',kind:'cancel'}],calendar);
    const data=buildWidgetSnapshot(effective,calendar,defaultPresets[0]);
    expect(data.events).toHaveLength(1);
    expect(data.events[0]).toMatchObject({date:'2026-09-18',location:'B201',start:defaultPresets[0].periods[2].start});
  });
  it('deduplicates weeks, skips invalid times and rebuilds for preset changes',()=>{
    expect(buildWidgetSnapshot([{...course,weeks:[1,1,31]}],calendar,defaultPresets[0]).events).toHaveLength(1);
    expect(buildWidgetSnapshot([{...course,endPeriod:99}],calendar,defaultPresets[0]).events).toHaveLength(0);
    const preset={...defaultPresets[0],periods:defaultPresets[0].periods.map(p=>p.index===1?{...p,start:'08:00'}:p)};
    expect(buildWidgetSnapshot([course],calendar,preset).events[0].start).toBe('08:00');
  });
});
