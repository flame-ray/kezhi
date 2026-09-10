import { resolvePortalWeekReview, type PortalWeekDecision, type PortalWeekReview } from "../importing/portalWeekReview";

export function PortalWeekReviewPanel({ reviews, decisions, onChange }: {
  reviews: PortalWeekReview[];
  decisions: Record<string, PortalWeekDecision>;
  onChange: (id: string, decision: PortalWeekDecision) => void;
}) {
  if (!reviews.length) return null;
  return <section className="portal-week-review" aria-labelledby="week-review-title">
    <h3 id="week-review-title">补充缺失的上课周次</h3>
    <p>这些记录的周次缺失或无法完整识别。请查阅学校课表后填写，不会自动补成整学期。</p>
    {reviews.map(review => {
      const { course } = review;
      const decision = decisions[course.id] ?? { text: "" };
      const resolved = resolvePortalWeekReview(review, decision.text);
      return <article key={course.id} className="portal-week-review-item">
        <strong>{course.title}</strong>
        <small>周{"一二三四五六日"[course.day - 1]} · 第 {course.startPeriod}–{course.endPeriod} 节 · {course.location}</small>
        {review.parity && <small>网页标注{review.parity === "odd" ? "单周" : "双周"}，填写范围后仅保留对应周次。</small>}
        <details><summary>查看网页原文</summary><pre>{review.sourceText}</pre></details>
        <label><span>上课周次 · {course.title}</span><input value={decision.text} disabled={decision.skip} maxLength={240} placeholder="例如 1-16 或 1,3,5,7" aria-invalid={!decision.skip && !!decision.text && !resolved} onChange={event => onChange(course.id, { ...decision, text: event.target.value })} /></label>
        {!decision.skip && <small className={resolved ? "week-review-valid" : "week-review-pending"} role="status">{resolved ? `将导入第 ${resolved.weeks.join("、")} 周` : decision.text ? "请填写 1–30 周内的完整范围或列表，且须符合网页单双周标注。" : "待填写；也可以勾选跳过这条记录。"}</small>}
        <label className="week-review-skip"><input type="checkbox" checked={decision.skip ?? false} onChange={event => onChange(course.id, { ...decision, skip: event.target.checked })} /><span>本次跳过这条记录</span></label>
      </article>;
    })}
  </section>;
}
