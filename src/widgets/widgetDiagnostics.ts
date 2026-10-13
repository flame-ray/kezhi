export interface WidgetDiagnostics {
  cacheState: 'missing' | 'invalid' | 'ready';
  syncedAt: number;
  checkedAt: number;
  today: string;
  widgetCount: number;
  eventCount: number;
  todayCount: number;
  firstDate: string | null;
  lastDate: string | null;
}
function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 10000;
}
function isTime(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 8640000000000000;
}
export function parseWidgetDiagnostics(value: unknown): WidgetDiagnostics {
  if (!value || typeof value !== 'object') throw new Error('小组件状态格式无效');
  const v = value as Record<string, unknown>;
  if (!['missing', 'invalid', 'ready'].includes(String(v.cacheState)) || !isTime(v.syncedAt) || !isTime(v.checkedAt)
    || !isDate(v.today) || !isCount(v.widgetCount) || !isCount(v.eventCount) || !isCount(v.todayCount)
    || v.todayCount > v.eventCount || !(v.firstDate === null || isDate(v.firstDate)) || !(v.lastDate === null || isDate(v.lastDate))
    || (v.eventCount === 0 ? v.firstDate !== null || v.lastDate !== null : !v.firstDate || !v.lastDate || v.firstDate > v.lastDate)
    || (v.cacheState !== 'ready' && v.eventCount !== 0)) throw new Error('小组件状态格式无效');
  return {cacheState: v.cacheState as WidgetDiagnostics['cacheState'], syncedAt: v.syncedAt, checkedAt: v.checkedAt,
    today: v.today, widgetCount: v.widgetCount, eventCount: v.eventCount, todayCount: v.todayCount,
    firstDate: v.firstDate, lastDate: v.lastDate};
}
export function describeWidgetDiagnostics(d: WidgetDiagnostics): {title: string; hint: string} {
  if (d.cacheState === 'missing') return {title: '还没有同步记录', hint: '课表加载后点击“立即刷新”，将当前课表写入小组件。'};
  if (d.cacheState === 'invalid') return {title: '小组件缓存无法读取', hint: '点击“立即刷新”重建缓存，不会删除应用内的课程。'};
  if (d.widgetCount === 0) return {title: '课表已准备，尚未添加组件', hint: '使用“添加桌面小组件”，再在桌面确认添加。'};
  if (d.eventCount === 0) return {title: '已同步空课表', hint: '当前没有可展示的课程，请先导入或添加课程，并检查开课日期与周次。'};
  if (d.lastDate! < d.today) return {title: '缓存中的课程日期已结束', hint: '请检查是否仍在使用上一学期的课表，以及开学日期和课程周次是否正确。'};
  if (d.firstDate! > d.today) return {title: '课程尚未开始', hint: '课表已同步；今天没有课程，请核对下方课程日期范围。'};
  if (d.todayCount === 0) return {title: '今天没有安排课程', hint: '缓存中有其他日期的课程。若与你预期不同，请检查单双周、调课记录与开学日期。'};
  return {title: '本机课表已就绪', hint: '已将课程提供给桌面；实际显示可能受桌面刷新和系统省电限制。'};
}
export function formatWidgetSyncTime(time: number): string {
  return time === 0 ? '暂无记录' : new Date(time).toLocaleString('zh-CN', {year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false});
}
