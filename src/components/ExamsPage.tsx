import { useEffect, useMemo, useState } from 'react';
import { examEnd, examStart, examState, type ExamRecord } from '../exams/exams';
import { Icon } from '../ui/Icon';
import { exportExamCalendar } from '../platform/examCalendar';

export function ExamsPage({ exams, onEdit, onBack, onSettings, deleted, onUndo, onImport, onToast }: {
  exams: ExamRecord[]; onEdit: (exam?: ExamRecord) => void; onBack: () => void; onSettings: () => void; deleted?: ExamRecord; onUndo: () => void;
  onImport: () => void; onToast: (message: string) => void;
}) {
  const [filter, setFilter] = useState<'upcoming' | 'past' | 'all'>('upcoming');
  const [query, setQuery] = useState('');
  const [exporting, setExporting] = useState(false);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const refresh = () => setNow(new Date()); const timer = window.setInterval(refresh, 30000); document.addEventListener('visibilitychange', refresh); return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); }; }, []);
  const upcoming = exams.filter(item => examEnd(item) > now);
  const filtered = useMemo(() => exams.filter(item => (filter === 'all' || (filter === 'past' ? examEnd(item) <= now : examEnd(item) > now)) && `${item.title} ${item.location} ${item.note}`.toLowerCase().includes(query.trim().toLowerCase())).sort((a,b) => (filter === 'past' ? -1 : 1) * (examStart(a).getTime() - examStart(b).getTime())), [exams,filter,query,now]);
  return <div className="view-stage data-page-stage" key="exams"><section className="grades-page page-surface exams-page">
    <header className="module-hero"><div><span className="eyebrow">EXAM PLANNER</span><h2>考试中心</h2><p>{upcoming.length ? `${upcoming.length} 场考试待完成 · 按实际日期安排` : '从容安排复习，把重要考试记在这里。'}</p></div><div className="module-actions"><button className="soft-button" onClick={onBack}>返回今天</button><button className="primary-button" onClick={() => onEdit()}><Icon name="plus" />添加考试</button></div></header>
    <div className="module-toolbar"><label className="compact-search"><Icon name="search" /><input aria-label="搜索考试" placeholder="搜索考试或考场" value={query} onChange={e => setQuery(e.target.value)} /></label><select aria-label="考试筛选" value={filter} onChange={e => setFilter(e.target.value as typeof filter)}><option value="upcoming">待考试</option><option value="past">已结束</option><option value="all">全部</option></select></div>
    <div className="exam-calendar-actions"><button className="soft-button" onClick={onImport}><Icon name="upload" />导入考试 ICS</button><button className="soft-button" disabled={exporting || !filtered.length} onClick={async()=>{setExporting(true);try {const saved=await exportExamCalendar(filtered);onToast(saved?'已导出考试日历，可用日历应用打开':'已取消导出');}catch(error){onToast(typeof error==='string'?error:error instanceof Error?error.message:'导出失败，请重试');}finally{setExporting(false);}}}>{exporting?'正在导出…':`导出所列 ${filtered.length} 场`}</button></div>
    <div className="exam-list">
      {deleted && <div className="exam-undo" role="status"><span>已删除「{deleted.title}」</span><button className="soft-button" onClick={onUndo}>撤销删除</button></div>}
      {!filtered.length && <div className="today-empty"><span><Icon name="calendar" /></span><h3>{query ? '没有匹配的考试' : filter === 'past' ? '还没有已结束的考试' : '这里还没有考试'}</h3><p>录入日期、考场与座位号，考试也会出现在“今天”。</p></div>}
      {filtered.map(exam => <button className={`exam-card ${examEnd(exam) <= now ? 'finished' : ''}`} key={exam.id} onClick={() => onEdit(exam)}><span className="exam-date"><strong>{Number(exam.date.slice(8))}</strong><small>{Number(exam.date.slice(5,7))} 月 · {exam.date.slice(0,4)}</small></span><span className="exam-copy"><small>{examState(exam, now)}</small><strong>{exam.title}</strong><span>{exam.startTime}–{exam.endTime} · {exam.location || '考场待定'}{exam.seat ? ` · ${exam.seat} 号座位` : ''}</span>{exam.note && <span className="exam-note">{exam.note}</span>}</span><Icon name="chevron-right" /></button>)}
    </div><footer className="exam-footnote"><span>仅存本机 · JSON 备份包含考试</span><button className="soft-button" onClick={onSettings}>提醒设置</button></footer>
  </section></div>;
}
