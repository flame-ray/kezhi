import type { CourseMeeting, ReminderSettings, TimetablePreset } from "../domain/schedule";
import { effectiveReminderMinutes } from "../reminders/reminderSchedule";
import { Icon } from "../ui/Icon";
import { DialogSurface } from "../ui/DialogSurface";
import { MotionRegion, Presence, useCompactLayout } from "../ui/Motion";

const dayNames = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

interface CourseDetailsProps {
  meeting?: CourseMeeting;
  preset: TimetablePreset;
  reminderSettings: ReminderSettings;
  onClose: () => void;
  onEdit: () => void;
  onReminderChange: (minutes: number | undefined) => void;
  onOpenReminderSettings: () => void;
  onOccurrence?: () => void;
}

export function CourseDetails(props: CourseDetailsProps) {
  const compact = useCompactLayout();
  if (compact) return <Presence>{props.meeting && <DialogSurface className="course-detail-dialog" labelledBy="course-detail-title" onClose={props.onClose}><CourseDetailContent {...props} /></DialogSurface>}</Presence>;
  return <MotionRegion className="desktop-course-details" motionKey={props.meeting?.id ?? "empty"}><CourseDetailContent {...props} /></MotionRegion>;
}

function CourseDetailContent({ meeting, preset, reminderSettings, onClose, onEdit, onReminderChange, onOpenReminderSettings, onOccurrence }: CourseDetailsProps) {
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
  const reminderMinutes = effectiveReminderMinutes(meeting, reminderSettings);
  const reminderActive = reminderSettings.enabled && reminderMinutes > 0;

  return (
    <aside className="detail-panel">
      <div className="detail-actions">
        <button className="icon-button" onClick={onEdit} title="编辑课程"><Icon name="edit" /></button>
        <button className="icon-button" onClick={onClose} title="关闭"><Icon name="close" /></button>
      </div>
      <span className={`detail-color color-${meeting.color}`} />
      <div className="detail-code">{meeting.courseCode}</div>
      <h2 id="course-detail-title">{meeting.title}</h2>
      <p className="detail-subtitle">{weekText}</p>
      {meeting.occurrence && <p className="changed-banner">{meeting.note}</p>}
      {onOccurrence && <button className="soft-button occurrence-action" onClick={onOccurrence}>{meeting.occurrence ? "修改／撤销这次变更" : "仅这一次调课／停课"}</button>}

      <div className="detail-list">
        <div><Icon name="clock" /><span><strong>{dayNames[meeting.day - 1]} · 第{meeting.startPeriod}–{meeting.endPeriod}节</strong><small>{start}–{end}</small></span></div>
        <div><Icon name="location" /><span><strong>{meeting.location}</strong><small>点击可复制教室</small></span></div>
        <div><Icon name="person" /><span><strong>{meeting.teacher}</strong><small>任课教师</small></span></div>
      </div>

      {meeting.status === "changed" && !meeting.occurrence && (
        <div className="changed-banner">
          <strong>本地调整</strong>
          <span>下次同步时将询问保留哪个版本。</span>
        </div>
      )}

      <button
        className="reminder-row"
        onClick={() => reminderSettings.enabled ? onReminderChange(reminderMinutes > 0 ? 0 : undefined) : onOpenReminderSettings()}
      >
        <span><Icon name="bell" /><span><strong>{meeting.occurrence ? "整门课程的提醒设置" : "上课提醒"}</strong><small>{meeting.status === "cancelled" ? "本次不提醒；以下开关仅影响其他上课日期" :
          !reminderSettings.enabled
            ? "总开关已关闭 · 点击设置"
            : reminderMinutes > 0
              ? `${meeting.reminderMinutes ? "单独设置" : "跟随默认"} · 提前 ${reminderMinutes} 分钟`
              : "这门课不提醒"
        }</small></span></span>
        <i className={`switch ${reminderActive ? "active" : ""}`} />
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
