import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Icon } from '../ui/Icon';
import { describeWidgetDiagnostics, formatWidgetSyncTime, parseWidgetDiagnostics, type WidgetDiagnostics } from './widgetDiagnostics';

export function WidgetStatusPanel({onRefresh, syncStatus}: {onRefresh: () => Promise<void>; syncStatus?: string}) {
  const [data, setData] = useState<WidgetDiagnostics | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [reading, setReading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(false), request = useRef(0), refreshingRef = useRef(false);
  const read = useCallback(async () => {
    const sequence = ++request.current;
    setReading(true);
    try {
      const result = parseWidgetDiagnostics(await invoke('read_course_widget_status'));
      if (mounted.current && sequence === request.current) { setData(result); setError(''); }
    } catch {
      if (mounted.current && sequence === request.current) { setData(null); setError('暂时无法读取状态，请重试。读取失败不表示课表已丢失。'); }
    } finally {
      if (mounted.current && sequence === request.current) setReading(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const resume = () => { if (document.visibilityState === 'visible') void read(); };
    void read();
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    return () => { mounted.current = false; ++request.current; window.removeEventListener('focus', resume); document.removeEventListener('visibilitychange', resume); };
  }, [read, syncStatus]);
  const refresh = async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true; setRefreshing(true); setMessage('');
    try {
      await onRefresh();
      if (mounted.current) setMessage('当前课表已重新同步，并已请求桌面刷新。若显示未变，请检查桌面或省电限制。');
    } catch {
      if (mounted.current) setMessage('刷新失败，请确认课表已加载后重试。原有课程不会删除。');
    } finally {
      refreshingRef.current = false;
      if (mounted.current) { setRefreshing(false); void read(); }
    }
  };
  const description = data ? describeWidgetDiagnostics(data) : null;
  return <section className="widget-status-panel" aria-labelledby="widget-status-title">
    <header><span className="settings-icon"><Icon name="shield" /></span><div><h3 id="widget-status-title">小组件同步状态</h3><small>仅检查本机缓存，不连接教务系统</small></div></header>
    <p className="widget-status-summary" role="status">{error || description?.title || '正在读取本机状态…'}</p>
    {data && <dl>
      <div><dt>桌面组件</dt><dd>{data.widgetCount} 个</dd></div>
      <div><dt>今天课程</dt><dd>{data.cacheState === 'ready' ? data.todayCount + ' 次' : '—'}</dd></div>
      <div className="widget-status-wide"><dt>课程同步时间</dt><dd>{formatWidgetSyncTime(data.syncedAt)}</dd></div>
      <div className="widget-status-wide"><dt>课程日期范围</dt><dd>{data.firstDate && data.lastDate ? data.firstDate + ' 至 ' + data.lastDate : '暂无课程日期'}</dd></div>
      <div className="widget-status-wide"><dt>本地课程安排</dt><dd>{data.cacheState === 'ready' ? data.eventCount + ' 次（按每次上课计数）' : '尚无可读取的缓存'}</dd></div>
    </dl>}
    {description && <p className="widget-status-hint">{description.hint}</p>}
    <div className="widget-status-actions">
      <button className="primary-button" onClick={() => void refresh()} disabled={refreshing}><Icon name="refresh" />{refreshing ? '正在刷新…' : '立即刷新'}</button>
      <button className="soft-button" onClick={() => void read()} disabled={reading || refreshing}>{reading ? '读取中…' : '重新检查'}</button>
    </div>
    {message && <p role="status" className="widget-status-hint">{message}</p>}
    <small className="widget-status-footnote">刷新不会重新导入教务课表，也不会改变课程、周次或组件外观。</small>
  </section>;
}
