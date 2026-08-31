import type { CourseMeeting, TimetablePreset } from "../domain/schedule";
import { Icon } from "../ui/Icon";

const dayNames = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

interface CourseDetailsProps {
  meeting?: CourseMeeting;
  preset: TimetablePreset;
  onClose: () => void;
  onEdit: () => void;
}

export function CourseDetails({ meeting, preset, onClose, onEdit }: CourseDetailsProps) {
  if (!meeting) {
    return (
      <aside className="detail-panel detail-empty">
        <div className="next-label">接下来</div>
        <div className="empty-orbit">
          <span className="orbit-dot" />
          <Icon name="calendar" />
        </div>
        <h3>点选一门课程</h3>
        <p>查看教师、教室、周次以及提醒设置。课程卡片也可以直接拖动。</p>
        <div className="privacy-note"><Icon name="shield" /><span>姓名与学号默认隐藏，仅保存在本机。</span></div>
      </aside>
    );
  }

  const start = preset.periods.find((period) => period.index === meeting.startPeriod)?.start;
  const end = preset.periods.find((period) => period.index === meeting.endPeriod)?.end;
  const weekText = compressWeeks(meeting.weeks);

  return (
    <aside className="detail-panel">
      <div className="detail-actions">
        <button className="icon-button" onClick={onEdit} title="编辑课程"><Icon name="edit" /></button>
        <button className="icon-button" onClick={onClose} title="关闭"><Icon name="close" /></button>
      </div>
      <span className={`detail-color color-${meeting.color}`} />
      <div className="detail-code">{meeting.courseCode}</div>
      <h2>{meeting.title}</h2>
      <p className="detail-subtitle">{weekText}</p>

      <div className="detail-list">
        <div><Icon name="clock" /><span><strong>{dayNames[meeting.day - 1]} · 第{meeting.startPeriod}–{meeting.endPeriod}节</strong><small>{start}–{end}</small></span></div>
        <div><Icon name="location" /><span><strong>{meeting.location}</strong><small>点击可复制教室</small></span></div>
        <div><Icon name="person" /><span><strong>{meeting.teacher}</strong><small>任课教师</small></span></div>
      </div>

      {meeting.status === "changed" && (
        <div className="changed-banner">
          <strong>本地调整</strong>
          <span>下次同步时将询问保留哪个版本。</span>
        </div>
      )}

      <button className="reminder-row">
        <span><Icon name="clock" /><span><strong>上课提醒</strong><small>提前 15 分钟</small></span></span>
        <i className="switch active" />
      </button>
    </aside>
  );
}

function compressWeeks(weeks: number[]): string {
  if (weeks.length === 0) return "未设置周次";
  const isOdd = weeks.every((week) => week % 2 === 1);
  const isEven = weeks.every((week) => week % 2 === 0);
  const first = Math.min(...weeks);
  const last = Math.max(...weeks);
  if (isOdd) return `${first}–${last}周 · 单周`;
  if (isEven) return `${first}–${last}周 · 双周`;
  return `${first}–${last}周`;
}
