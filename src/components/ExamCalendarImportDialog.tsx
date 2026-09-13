import { useEffect, useMemo, useRef, useState } from 'react';
import { parseExamCalendar, type ExamCalendarResult } from '../exams/examCalendar';
import { examConflicts, mergeExams, type ExamRecord } from '../exams/exams';
import { DialogSurface } from '../ui/DialogSurface';
import { Icon } from '../ui/Icon';

export function ExamCalendarImportDialog({ exams, onImport, onClose }: { exams: ExamRecord[]; onImport: (exams: ExamRecord[]) => void; onClose: () => void }) {
  const input=useRef<HTMLInputElement>(null), generation=useRef(0);
  const [result,setResult]=useState<ExamCalendarResult>(), [selected,setSelected]=useState<string[]>([]), [error,setError]=useState(''), [busy,setBusy]=useState(false), [fileName,setFileName]=useState(''), [confirmed,setConfirmed]=useState(false);
  useEffect(()=>()=>{generation.current++;},[]);
  const read = async (file?: File) => {
    if(!file) return;
    const current=++generation.current;
    setResult(undefined);setSelected([]);setError('');setBusy(true);setConfirmed(false);setFileName(file.name);
    try {
      if(!file.name.toLowerCase().endsWith('.ics') || file.size>4*1024*1024) throw new Error('请选择不超过 4 MB 的 .ics 文件');
      const text=await file.text(); if(current!==generation.current)return;
      const parsed=parseExamCalendar(text); setResult(parsed);setSelected(parsed.exams.map(exam=>exam.id));
    } catch(reason) { if(current===generation.current)setError(reason instanceof Error ? reason.message : '无法读取日历文件'); }
    finally { if(current===generation.current){setBusy(false);if(input.current)input.current.value='';} }
  };
  const incoming=useMemo(()=>result?.exams.filter(exam=>selected.includes(exam.id)) ?? [],[result,selected]);
  const plan=useMemo(()=>{try { const merged=mergeExams(exams,incoming); const added=merged.filter(exam=>!exams.some(item=>item.id===exam.id)); const conflicts=added.filter(exam=>examConflicts(exam,merged).length>0); return {merged,added,conflicts,error:''}; }catch(cause){return {merged:exams,added:[],conflicts:[],error:cause instanceof Error ? cause.message:'考试数据无效'};}},[exams,incoming]);
  const toggle=(id:string)=>{setSelected(old=>old.includes(id)?old.filter(value=>value!==id):[...old,id]);setConfirmed(false);};
  return <DialogSurface className="settings-dialog" labelledBy="exam-import-title" onClose={onClose}>
    <header className="dialog-header"><div><span className="eyebrow">日历文件 · 本地预览</span><h2 id="exam-import-title">导入考试日历</h2><p>只添加勾选的考试，不覆盖已有记录或修改课表。</p></div><button className="icon-button" aria-label="关闭考试导入" onClick={onClose}><Icon name="close" /></button></header>
    <div className="settings-body exam-import-body">
      <input ref={input} className="hidden-file-input" type="file" accept=".ics,text/calendar" onChange={event=>void read(event.target.files?.[0])} />
      <button className="soft-button" disabled={busy} onClick={()=>input.current?.click()}><Icon name="upload" />{busy?'读取中…':fileName?'重新选择 ICS 文件':'选择 ICS 文件'}</button>
      <p className="exam-import-help">按设备当前时区显示。支持 UTC、北京时间及无时区的本地时间；全天、重复和缺少起止时间的事件会跳过并说明原因。外部日历的提醒不自动启用，可导入后编辑。</p>
      {result && <><p role="status">{fileName} · 可解析 {result.exams.length} 场 · 跳过 {result.skipped} 条</p><div className="exam-selection-tools"><button className="soft-button" onClick={()=>{setSelected(result.exams.map(exam=>exam.id));setConfirmed(false);}}>全选</button><button className="soft-button" onClick={()=>{setSelected([]);setConfirmed(false);}}>清空选择</button></div>{result.exams.map(exam=><label className="exam-import-row" key={exam.id}><input type="checkbox" checked={selected.includes(exam.id)} onChange={()=>toggle(exam.id)} /><span><strong>{exam.title}</strong><small>{exam.date} · {exam.startTime}–{exam.endTime}</small><small>{exam.location || '考场待定'}{exam.seat ? ` · 座位 ${exam.seat}`:''}</small></span></label>)}
      <p>将新增 {plan.added.length} 场；重复记录 {incoming.length-plan.added.length} 场不覆盖。</p>
      {result.warnings.length>0 && <details><summary>查看跳过原因（{result.warnings.length}）</summary><ul>{result.warnings.map((warning,index)=><li key={index}>{warning}</li>)}</ul></details>}
      {plan.conflicts.length>0 && <label className="exam-conflict-confirm"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)} /><span>其中 {plan.conflicts.length} 场与其他考试时间重叠，我已核对并仍需添加。</span></label>}</>}
      {(error || plan.error) && <p className="form-error" role="alert">{error || plan.error}</p>}
    </div>
    <footer className="dialog-footer"><button className="cancel-button" onClick={onClose}>取消</button><button className="primary-button" disabled={busy || !plan.added.length || !!plan.error || (plan.conflicts.length>0&&!confirmed)} onClick={()=>onImport(plan.added)}>导入 {plan.added.length} 场考试</button></footer>
  </DialogSurface>;
}
