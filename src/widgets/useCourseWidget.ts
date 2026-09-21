import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { CourseMeeting, TimetablePreset } from '../domain/schedule';
import type { ResolvedAcademicCalendar } from '../domain/academicCalendar';
import { buildWidgetSnapshot } from './widgetSnapshot';

/** Keep the native cache independent of React/Activity lifetime. Serialize writes
 * so a slow earlier save cannot overwrite a newer imported or edited timetable. */
export function useCourseWidget(enabled: boolean, courses: CourseMeeting[], calendar: ResolvedAcademicCalendar, preset: TimetablePreset) {
  const [status, setStatus] = useState('等待同步课程');
  const payload = useMemo(() => {
    if (!enabled) return {content: '', error: ''};
    try { return {content: JSON.stringify(buildWidgetSnapshot(courses, calendar, preset)), error: ''}; }
    catch { return {content: '', error: '课程数据暂时无法同步，请检查周次与作息后重试'}; }
  }, [enabled, courses, calendar, preset]);
  const latest = useRef(payload);
  latest.current = payload;
  const saved = useRef('');
  const queue = useRef<Promise<void>>(Promise.resolve());
  const syncNow = useCallback(() => {
    const task = queue.current.catch(() => undefined).then(async () => {
      const current = latest.current;
      if (current.error || !current.content) throw new Error(current.error || '课表仍在加载，请稍后重试');
      if (saved.current === current.content) { setStatus('桌面课表已同步'); return; }
      try {
        await invoke('sync_course_widget', {content: current.content});
        saved.current = current.content;
        if (latest.current === current) setStatus('桌面课表已同步');
      } catch {
        if (latest.current === current) setStatus('桌面课表同步失败，可点击下方按钮重试');
        throw new Error('桌面课表同步失败，请稍后重试');
      }
    });
    queue.current = task;
    return task;
  }, []);
  useEffect(() => {
    if (!enabled) return;
    if (payload.error) { setStatus(payload.error); return; }
    setStatus('正在同步桌面课表…');
    const timer = window.setTimeout(() => { void syncNow().catch(() => undefined); }, 400);
    return () => window.clearTimeout(timer);
  }, [enabled, payload, syncNow]);
  const pin = useCallback(async () => {
    if (!enabled) throw new Error('课表仍在加载，请稍后重试');
    await syncNow();
    const requested = await invoke<boolean>('pin_course_widget');
    return requested
      ? '已请求添加，请在系统弹窗中确认；若未弹出，可长按桌面 → 小组件 → 课织。'
      : '请长按手机桌面空白处 → 小组件（或工具）→ 课织 → 今天与下一节课。';
  }, [enabled, syncNow]);
  return {status, pin};
}
