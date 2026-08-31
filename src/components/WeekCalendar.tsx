import type { CSSProperties } from "react";
import type { CourseMeeting, DayOfWeek, TimetablePreset, WeekView } from "../domain/schedule";
import { Icon } from "../ui/Icon";

const dayNames = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

interface WeekCalendarProps {
  view: WeekView;
  preset: TimetablePreset;
  selectedId?: string;
  direction: "left" | "right";
  onSelect: (meeting: CourseMeeting) => void;
  onMove: (id: string, day: DayOfWeek, period: number) => void;
}

export function WeekCalendar({
  view,
  preset,
  selectedId,
  direction,
  onSelect,
  onMove,
}: WeekCalendarProps) {
  const meetings = view.days.flatMap((day) => day.meetings);
  const today = new Date();
  const rowCount = preset.periods.length;

  return (
    <div className="calendar-scroll">
      <div
        key={view.week}
        className={`calendar-grid week-enter-${direction}`}
        style={{ "--period-count": rowCount } as CSSProperties}
      >
        <div className="calendar-corner">
          <span>节次</span>
          <small>{preset.name}</small>
        </div>

        {view.days.map(({ day, date }) => {
          const isToday =
            today.getFullYear() === date.getFullYear() &&
            today.getMonth() === date.getMonth() &&
            today.getDate() === date.getDate();
          return (
            <div
              className={`day-heading ${isToday ? "today" : ""}`}
              style={{ gridColumn: day + 1, gridRow: 1 }}
              key={day}
            >
              <span>{dayNames[day - 1]}</span>
              <strong>{date.getDate()}</strong>
            </div>
          );
        })}

        {preset.periods.map((period) => (
          <div
            className="period-label"
            style={{ gridColumn: 1, gridRow: period.index + 1 }}
            key={period.index}
          >
            <strong>{period.index}</strong>
            <span>{period.start}</span>
            <small>{period.end}</small>
          </div>
        ))}

        {view.days.flatMap(({ day }) =>
          preset.periods.map((period) => (
            <div
              className="calendar-cell"
              style={{ gridColumn: day + 1, gridRow: period.index + 1 }}
              key={`${day}-${period.index}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const id = event.dataTransfer.getData("text/course-id");
                if (id) onMove(id, day, period.index);
              }}
            />
          )),
        )}

        {meetings.map((meeting) => {
          const span = meeting.endPeriod - meeting.startPeriod + 1;
          return (
            <button
              draggable
              className={`course-card color-${meeting.color} ${selectedId === meeting.id ? "selected" : ""} ${meeting.status === "changed" ? "changed" : ""}`}
              style={{
                gridColumn: meeting.day + 1,
                gridRow: `${meeting.startPeriod + 1} / span ${span}`,
              }}
              key={meeting.id}
              onClick={() => onSelect(meeting)}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/course-id", meeting.id);
              }}
            >
              <span className="course-title">{meeting.title}</span>
              <span className="course-meta"><Icon name="location" />{meeting.location}</span>
              {span > 1 && <span className="course-teacher">{meeting.teacher}</span>}
              {meeting.note && <span className="course-badge">{meeting.note}</span>}
              {meeting.status === "changed" && <span className="change-dot" title="本地已修改" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
