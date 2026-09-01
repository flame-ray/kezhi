import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type TransitionEvent as ReactTransitionEvent,
} from "react";
import type { CourseMeeting, DayOfWeek, TimetablePreset, WeekView } from "../domain/schedule";
import { resistedWeekOffset, resolveWeekSwipe, type WeekDelta } from "../interaction/weekPaging";
import { Icon } from "../ui/Icon";

const dayNames = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const PAGE_TRANSITION_MS = 260;

interface WeekCalendarProps {
  view: WeekView;
  previousView: WeekView;
  nextView: WeekView;
  preset: TimetablePreset;
  selectedId?: string;
  canGoPrevious: boolean;
  canGoNext: boolean;
  onSelect: (meeting: CourseMeeting) => void;
  onMove: (id: string, day: DayOfWeek, period: number) => void;
  onCreate: (day: DayOfWeek, period: number) => void;
  onChangeWeek: (delta: -1 | 1) => void;
}

export function WeekCalendar({
  view,
  previousView,
  nextView,
  preset,
  selectedId,
  canGoPrevious,
  canGoNext,
  onSelect,
  onMove,
  onCreate,
  onChangeWeek,
}: WeekCalendarProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    lastX: number;
    lastAt: number;
    velocity: number;
    horizontal: boolean;
  } | undefined>(undefined);
  const settlingDelta = useRef<WeekDelta>(0);
  const dragOffsetRef = useRef(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [swiping, setSwiping] = useState(false);

  useLayoutEffect(() => {
    gestureRef.current = undefined;
    settlingDelta.current = 0;
    setSwiping(false);
    setTransitioning(false);
    dragOffsetRef.current = 0;
    setDragOffset(0);
  }, [view.week]);

  const beginSwipe = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.pointerType === "mouse" || transitioning) return;
    if ((event.target as HTMLElement).closest(".course-card")) return;
    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastAt: event.timeStamp,
      velocity: 0,
      horizontal: false,
    };
  };

  const moveSwipe = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || transitioning) return;
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (!gesture.horizontal) {
      if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 8) {
        gestureRef.current = undefined;
        return;
      }
      if (Math.abs(deltaX) < 8) return;
      gesture.horizontal = true;
      setSwiping(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
    const elapsed = Math.max(1, event.timeStamp - gesture.lastAt);
    gesture.velocity = (event.clientX - gesture.lastX) / elapsed;
    gesture.lastX = event.clientX;
    gesture.lastAt = event.timeStamp;
    const width = viewportRef.current?.clientWidth ?? window.innerWidth;
    const nextOffset = resistedWeekOffset(deltaX, width, canGoPrevious, canGoNext);
    dragOffsetRef.current = nextOffset;
    setDragOffset(nextOffset);
  };

  const finishSwipe = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gestureRef.current = undefined;
    if (!gesture.horizontal) return;
    const width = viewportRef.current?.clientWidth ?? window.innerWidth;
    const delta = resolveWeekSwipe({
      offset: dragOffsetRef.current,
      velocity: gesture.velocity,
      width,
      canPrevious: canGoPrevious,
      canNext: canGoNext,
    });
    settlingDelta.current = delta;
    setTransitioning(true);
    setSwiping(false);
    dragOffsetRef.current = delta === 1 ? -width : delta === -1 ? width : 0;
    setDragOffset(delta === 1 ? -width : delta === -1 ? width : 0);
  };

  const finishTransition = (event: ReactTransitionEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || event.propertyName !== "transform" || !transitioning) return;
    const delta = settlingDelta.current;
    settlingDelta.current = 0;
    if (delta !== 0) onChangeWeek(delta);
    setTransitioning(false);
    dragOffsetRef.current = 0;
    setDragOffset(0);
  };

  const trackStyle = {
    transform: `translate3d(calc(-100% + ${dragOffset}px), 0, 0)`,
    transition: transitioning ? `transform ${PAGE_TRANSITION_MS}ms cubic-bezier(.2,.78,.2,1)` : "none",
  } as CSSProperties;

  return (
    <div
      ref={viewportRef}
      className={`week-swipe-viewport ${swiping ? "swiping" : ""}`}
      onPointerDown={beginSwipe}
      onPointerMove={moveSwipe}
      onPointerUp={finishSwipe}
      onPointerCancel={finishSwipe}
    >
      <div className="week-swipe-track" style={trackStyle} onTransitionEnd={finishTransition}>
        <div className="calendar-scroll week-page" aria-hidden="true">
          <CalendarGrid view={previousView} preset={preset} interactive={false} />
        </div>
        <div className="calendar-scroll week-page active-page">
          <CalendarGrid
            view={view}
            preset={preset}
            selectedId={selectedId}
            interactive
            onSelect={onSelect}
            onMove={onMove}
            onCreate={onCreate}
          />
        </div>
        <div className="calendar-scroll week-page" aria-hidden="true">
          <CalendarGrid view={nextView} preset={preset} interactive={false} />
        </div>
      </div>
    </div>
  );
}

interface CalendarGridProps {
  view: WeekView;
  preset: TimetablePreset;
  selectedId?: string;
  interactive: boolean;
  onSelect?: (meeting: CourseMeeting) => void;
  onMove?: (id: string, day: DayOfWeek, period: number) => void;
  onCreate?: (day: DayOfWeek, period: number) => void;
}

function CalendarGrid({ view, preset, selectedId, interactive, onSelect, onMove, onCreate }: CalendarGridProps) {
  const meetings = view.days.flatMap((day) => day.meetings);
  const today = new Date();
  const rowCount = preset.periods.length;

  return (
    <div
      className="calendar-grid"
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
            <strong>{date.getMonth() + 1}/{date.getDate()}</strong>
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

      {view.days.flatMap(({ day, date }) =>
        preset.periods.map((period) => (
          <CalendarCell
            style={{ gridColumn: day + 1, gridRow: period.index + 1 }}
            key={`${day}-${period.index}`}
            label={`${dayNames[day - 1]} ${dateLabel(date)} 第 ${period.index} 节`}
            onCreate={interactive ? () => onCreate?.(day, period.index) : undefined}
            onMove={interactive ? (id) => onMove?.(id, day, period.index) : undefined}
          />
        )),
      )}

      {meetings.map((meeting) => {
        const span = meeting.endPeriod - meeting.startPeriod + 1;
        return (
          <button
            type="button"
            draggable={interactive}
            tabIndex={interactive ? 0 : -1}
            className={`course-card color-${meeting.color} ${selectedId === meeting.id ? "selected" : ""} ${meeting.status === "changed" ? "changed" : ""}`}
            style={{
              gridColumn: meeting.day + 1,
              gridRow: `${meeting.startPeriod + 1} / span ${span}`,
            }}
            key={meeting.id}
            onClick={() => interactive && onSelect?.(meeting)}
            onDragStart={(event) => {
              if (!interactive) return;
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
  );
}

interface CalendarCellProps {
  style: CSSProperties;
  label: string;
  onCreate?: () => void;
  onMove?: (id: string) => void;
}

function CalendarCell({ style, label, onCreate, onMove }: CalendarCellProps) {
  const timerRef = useRef<number | undefined>(undefined);
  const originRef = useRef<{ x: number; y: number } | undefined>(undefined);
  const firedRef = useRef(false);
  const [pressing, setPressing] = useState(false);

  const cancelPress = () => {
    if (timerRef.current !== undefined) window.clearTimeout(timerRef.current);
    timerRef.current = undefined;
    originRef.current = undefined;
    setPressing(false);
  };

  useEffect(() => () => {
    if (timerRef.current !== undefined) window.clearTimeout(timerRef.current);
  }, []);

  const triggerCreate = () => {
    if (!onCreate || firedRef.current) return;
    firedRef.current = true;
    cancelPress();
    navigator.vibrate?.(18);
    onCreate();
  };

  return (
    <button
      type="button"
      tabIndex={onCreate ? 0 : -1}
      className={`calendar-cell ${pressing ? "long-pressing" : ""}`}
      style={style}
      aria-label={onCreate ? `${label}，长按添加课程` : label}
      onPointerDown={(event) => {
        if (!onCreate || event.button !== 0) return;
        firedRef.current = false;
        originRef.current = { x: event.clientX, y: event.clientY };
        setPressing(true);
        timerRef.current = window.setTimeout(triggerCreate, 520);
      }}
      onPointerMove={(event) => {
        const origin = originRef.current;
        if (!origin) return;
        if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 10) cancelPress();
      }}
      onPointerUp={cancelPress}
      onPointerCancel={cancelPress}
      onPointerLeave={(event) => { if (event.pointerType === "mouse") cancelPress(); }}
      onContextMenu={(event) => {
        event.preventDefault();
        triggerCreate();
      }}
      onClick={(event) => {
        if (event.detail === 0) triggerCreate();
      }}
      onDragOver={(event) => { if (onMove) event.preventDefault(); }}
      onDrop={(event) => {
        if (!onMove) return;
        event.preventDefault();
        const id = event.dataTransfer.getData("text/course-id");
        if (id) onMove(id);
      }}
    />
  );
}

function dateLabel(date: Date): string {
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}
