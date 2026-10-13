import { describe, expect, it } from 'vitest';
import { describeWidgetDiagnostics, formatWidgetSyncTime, parseWidgetDiagnostics, type WidgetDiagnostics } from './widgetDiagnostics';

const ready: WidgetDiagnostics = {cacheState:'ready', syncedAt:1000, checkedAt:2000, today:'2026-10-13',
  widgetCount:2, eventCount:20, todayCount:3, firstDate:'2026-09-17', lastDate:'2027-01-10'};
describe('widget diagnostics', () => {
  it('keeps only aggregate metadata', () => {
    expect(parseWidgetDiagnostics({...ready, account:'secret', courses:[{title:'private'}]})).toEqual(ready);
  });
  it.each([null, {}, {...ready,today:'2026-02-30'}, {...ready,eventCount:-1}, {...ready,todayCount:21},
    {...ready,syncedAt:NaN}, {...ready,firstDate:null}, {...ready,firstDate:'2027-02-01'},
    {...ready,cacheState:'invalid'}, {...ready,eventCount:0,todayCount:0}])('rejects invalid bridge metadata %j', value => {
    expect(() => parseWidgetDiagnostics(value)).toThrow();
  });
  it('distinguishes empty cache from missing and corrupt cache', () => {
    const empty = {...ready,eventCount:0,todayCount:0,firstDate:null,lastDate:null};
    expect(describeWidgetDiagnostics(parseWidgetDiagnostics(empty)).title).toBe('已同步空课表');
    expect(describeWidgetDiagnostics({...empty,cacheState:'missing'}).title).toBe('还没有同步记录');
    expect(describeWidgetDiagnostics({...empty,cacheState:'invalid'}).title).toBe('小组件缓存无法读取');
  });
  it('gives actionable guidance without promising launcher delivery', () => {
    expect(describeWidgetDiagnostics({...ready,widgetCount:0}).title).toContain('尚未添加');
    expect(describeWidgetDiagnostics({...ready,lastDate:'2026-10-12'}).title).toContain('已结束');
    expect(describeWidgetDiagnostics({...ready,firstDate:'2026-10-14'}).title).toContain('尚未开始');
    expect(describeWidgetDiagnostics({...ready,todayCount:0}).title).toContain('没有安排');
    expect(describeWidgetDiagnostics(ready).hint).toContain('省电限制');
  });
  it('has no fabricated timestamp for missing sync', () => {
    expect(formatWidgetSyncTime(0)).toBe('暂无记录');
  });
});
