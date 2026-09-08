import { useMemo, useRef, useState } from "react";
import { gradeDistribution, gradeOutcome, mergeGrades, parseGradeCsv, summarizeGrades, type GradeRecord } from "../grades/gradeCenter";
import { Icon } from "../ui/Icon";

interface GradesPageProps {
  records: GradeRecord[];
  defaultYear: number;
  defaultSemester: 1 | 2;
  onChange: (records: GradeRecord[]) => void;
  onEdit: (record?: GradeRecord) => void;
  onToast: (message: string) => void;
}

export function GradesPage({ records, defaultYear, defaultSemester, onChange, onEdit, onToast }: GradesPageProps) {
  const [term, setTerm] = useState("all");
  const [query, setQuery] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const terms = useMemo(() => {
    const values = new Set(records.map((record) => `${record.academicYear}-${record.semester}`));
    values.add(`${defaultYear}-${defaultSemester}`);
    return [...values].sort().reverse();
  }, [defaultSemester, defaultYear, records]);
  const filtered = useMemo(() => records.filter((record) => {
    const matchesTerm = term === "all" || `${record.academicYear}-${record.semester}` === term;
    const keyword = query.trim().toLowerCase();
    return matchesTerm && (!keyword || `${record.courseName} ${record.courseCode} ${record.category ?? ""}`.toLowerCase().includes(keyword));
  }), [query, records, term]);
  const summary = useMemo(() => summarizeGrades(filtered), [filtered]);
  const distribution = useMemo(() => gradeDistribution(filtered), [filtered]);
  const maxBucket = Math.max(1, ...distribution.map((bucket) => bucket.count));

  const importCsv = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 3 * 1024 * 1024) throw new Error("成绩文件不能超过 3 MB");
      const imported = parseGradeCsv(await file.text(), defaultYear, defaultSemester);
      onChange(mergeGrades(records, imported));
      onToast(`已导入 ${imported.length} 条成绩记录`);
    } catch (error) {
      onToast(error instanceof Error ? error.message : String(error));
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  return (
    <div className="view-stage data-page-stage" key="grades">
      <section className="grades-page page-surface">
        <header className="module-hero grades-hero">
          <div><span className="eyebrow">ACADEMIC RECORD</span><h2>成绩中心</h2><p>成绩只保存在本机；绩点算法可用学校公布值覆盖。</p></div>
          <div className="module-actions"><input ref={fileInput} className="hidden-file-input" type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" onChange={(event) => void importCsv(event.target.files?.[0])} /><button className="soft-button" onClick={() => fileInput.current?.click()}><Icon name="upload" />导入 CSV</button><button className="primary-button" onClick={() => onEdit()}><Icon name="plus" />录入成绩</button></div>
        </header>

        <div className="grade-summary-grid">
          <article><span>平均分</span><strong>{summary.averageScore ?? "—"}</strong><small>按学分加权</small></article>
          <article><span>平均绩点</span><strong>{summary.gpa ?? "—"}</strong><small>优先使用学校绩点</small></article>
          <article><span>已获学分</span><strong>{summary.earnedCredits}</strong><small>尝试 {summary.attemptedCredits} 学分</small></article>
          <article><span>通过率</span><strong>{summary.passRate === undefined ? "—" : `${summary.passRate}%`}</strong><small>{summary.passedCount} 通过 · {summary.failedCount} 未通过</small></article>
        </div>

        <div className="grade-content-grid">
          <section className="grade-list-panel">
            <div className="module-toolbar"><label className="compact-search"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索课程" /></label><select value={term} onChange={(event) => setTerm(event.target.value)}><option value="all">全部学期</option>{terms.map((value) => { const [year, semester] = value.split("-"); return <option key={value} value={value}>{year}–{Number(year) + 1} · 第{semester === "1" ? "一" : "二"}学期</option>; })}</select></div>
            <div className="grade-list">
              {filtered.length ? filtered.map((record) => {
                const outcome = gradeOutcome(record.score);
                return <button className="grade-row" key={record.id} onClick={() => onEdit(record)}><span className={`grade-score ${outcome.status}`}>{record.score}</span><span className="grade-copy"><strong>{record.courseName}</strong><small>{record.courseCode || "无课程编号"} · {record.credits} 学分{record.category ? ` · ${record.category}` : ""}</small></span><span className="grade-term">{record.academicYear}–{record.academicYear + 1}<small>第{record.semester === 1 ? "一" : "二"}学期</small></span><Icon name="chevron-right" /></button>;
              }) : <div className="module-empty"><span><Icon name="chart" /></span><h3>{records.length ? "没有匹配的成绩" : "还没有成绩记录"}</h3><p>可以手动录入，或导入包含课程名称、成绩和学分的 CSV。</p><button className="primary-button" onClick={() => onEdit()}><Icon name="plus" />录入第一门成绩</button></div>}
            </div>
          </section>
          <aside className="grade-distribution-panel"><div><span className="eyebrow">分布</span><h3>{summary.completedCount} 门已公布</h3></div><div className="distribution-bars">{distribution.map((bucket) => <div key={bucket.label} className={`distribution-row tone-${bucket.tone}`}><span>{bucket.label}</span><i><b style={{ width: `${bucket.count / maxBucket * 100}%` }} /></i><strong>{bucket.count}</strong></div>)}</div><p><Icon name="shield" />统计结果仅供个人规划，不会上传或公开。</p></aside>
        </div>
      </section>
    </div>
  );
}
