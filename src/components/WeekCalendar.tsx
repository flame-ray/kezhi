import {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type TransitionEvent as ReactTransitionEvent,
} from "react";
import type { CourseMeeting, DayOfWeek, TimetablePreset, WeekView } from "../domain/schedule";
import { alternatingWeekLabel } from "../domain/weekPattern";
import {
  LONG_PRESS_DELAY_MS,
  LONG_PRESS_FEEDBACK_MS,
  shouldCancelLongPress,
} from "../interaction/longPress";
import { resistedWeekOffset, resolveWeekSwipe, type WeekDelta } from "../interaction/weekPaging";
import { Icon } from "../ui/Icon";
import { reducedMotion } from "../ui/Motion";

const dayNames = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const shortDayNames = ["一", "二", "三", "四", "五", "六", "日"];
const MIN_PAGE_TRANSITION_MS = 190;
const MAX_PAGE_TRANSITION_MS = 310;

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
  const trackRef = useRef<HTMLDivElement>(null);
  const previousPageRef = useRef<HTMLDivElement>(null);
  const activePageRef = useRef<HTMLDivElement>(null);
  const nextPageRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const transitionTimerRef = useRef<number | undefined>(undefined);
  const transitioningRef = useRef(false);
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

  const markSwiping = (active: boolean) => {
    viewportRef.current?.classList.toggle("swiping", active);
  };

  const cancelAnimationFrame = () => {
    if (animationFrameRef.current !== undefined) window.cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = undefined;
  };

  const writeTrackOffset = (offset: number) => {
    trackRef.current?.style.setProperty("--week-drag", `${offset}px`);
  };

  const scheduleTrackOffset = (offset: number) => {
    dragOffsetRef.current = offset;
    if (animationFrameRef.current !== undefined) return;
    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = undefined;
      writeTrackOffset(dragOffsetRef.current);
    });
  };

  const completeTransition = () => {
    if (!transitioningRef.current) return;
    transitioningRef.current = false;
    if (transitionTimerRef.current !== undefined) window.clearTimeout(transitionTimerRef.current);
    transitionTimerRef.current = undefined;
    cancelAnimationFrame();
    const delta = settlingDelta.current;
    settlingDelta.current = 0;
    const track = trackRef.current;
    track?.classList.remove("settling");
    markSwiping(false);
    if (delta !== 0) {
      onChangeWeek(delta);
      return;
    }
    dragOffsetRef.current = 0;
    writeTrackOffset(0);
  };

  useLayoutEffect(() => {
    gestureRef.current = undefined;
    settlingDelta.current = 0;
    markSwiping(false);
    transitioningRef.current = false;
    if (transitionTimerRef.current !== undefined) window.clearTimeout(transitionTimerRef.current);
    transitionTimerRef.current = undefined;
    cancelAnimationFrame();
    trackRef.current?.classList.remove("settling");
    dragOffsetRef.current = 0;
    writeTrackOffset(0);
  }, [view.week]);

  useEffect(() => () => {
    cancelAnimationFrame();
    if (transitionTimerRef.current !== undefined) window.clearTimeout(transitionTimerRef.current);
  }, []);

  const beginSwipe = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.pointerType === "mouse" || transitioningRef.current) return;
    if ((event.target as HTMLElement).closest(".course-card")) return;
    const scrollTop = activePageRef.current?.scrollTop ?? 0;
    if (previousPageRef.current) previousPageRef.current.scrollTop = scrollTop;
    if (nextPageRef.current) nextPageRef.current.scrollTop = scrollTop;
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
    if (!gesture || gesture.pointerId !== event.pointerId || transitioningRef.current) return;
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (!gesture.horizontal) {
      if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 8) {
        gestureRef.current = undefined;
        return;
      }
      if (Math.abs(deltaX) < 8) return;
      gesture.horizontal = true;
      markSwiping(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
    const elapsed = Math.max(1, event.timeStamp - gesture.lastAt);
    const instantVelocity = (event.clientX - gesture.lastX) / elapsed;
    gesture.velocity = gesture.velocity === 0 ? instantVelocity : gesture.velocity * .55 + instantVelocity * .45;
    gesture.lastX = event.clientX;
    gesture.lastAt = event.timeStamp;
    const width = viewportRef.current?.clientWidth ?? window.innerWidth;
    const nextOffset = resistedWeekOffset(deltaX, width, canGoPrevious, canGoNext);
    scheduleTrackOffset(nextOffset);
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
    transitioningRef.current = true;
    markSwiping(false);
    cancelAnimationFrame();
    writeTrackOffset(dragOffsetRef.current);
    const targetOffset = delta === 1 ? -width : delta === -1 ? width : 0;
    const remainingRatio = Math.min(1, Math.abs(targetOffset - dragOffsetRef.current) / Math.max(1, width));
    const duration = reducedMotion() ? 0 : Math.round(MIN_PAGE_TRANSITION_MS + (MAX_PAGE_TRANSITION_MS - MIN_PAGE_TRANSITION_MS) * remainingRatio);
    const track = trackRef.current;
    track?.style.setProperty("--week-duration", `${duration}ms`);
    track?.classList.add("settling");
    void track?.offsetWidth;
    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = undefined;
      dragOffsetRef.current = targetOffset;
      writeTrackOffset(targetOffset);
    });
    transitionTimerRef.current = window.setTimeout(completeTransition, duration + 100);
  };

  const cancelSwipe = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gestureRef.current = undefined;
    if (!gesture.horizontal) return;
    settlingDelta.current = 0;
    transitioningRef.current = true;
    markSwiping(false);
    cancelAnimationFrame();
    writeTrackOffset(dragOffsetRef.current);
    const track = trackRef.current;
    track?.style.setProperty("--week-duration", `${MIN_PAGE_TRANSITION_MS}ms`);
    track?.classList.add("settling");
    void track?.offsetWidth;
    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = undefined;
      dragOffsetRef.current = 0;
      writeTrackOffset(0);
    });
    transitionTimerRef.current = window.setTimeout(completeTransition, MIN_PAGE_TRANSITION_MS + 100);
  };

  const finishTransition = (event: ReactTransitionEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || event.propertyName !== "transform") return;
    completeTransition();
  };

  return (
    <div
      ref={viewportRef}
      className="week-swipe-viewport"
      onPointerDown={beginSwipe}
      onPointerMove={moveSwipe}
      onPointerUp={finishSwipe}
      onPointerCancel={cancelSwipe}
    >
      <div ref={trackRef} className="week-swipe-track" onTransitionEnd={finishTransition}>
        <div ref={previousPageRef} className="calendar-scroll week-page" aria-hidden="true">
          <CalendarGrid view={previousView} preset={preset} interactive={false} />
        </div>
        <div ref={activePageRef} className="calendar-scroll week-page active-page">
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
        <div ref={nextPageRef} className="calendar-scroll week-page" aria-hidden="true">
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

const CalendarGrid = memo(function CalendarGrid({ view, preset, selectedId, interactive, onSelect, onMove, onCreate }: CalendarGridProps) {
  const meetings = view.days.flatMap((day) => day.meetings);
  const today = new Date();
  const rowCount = preset.periods.length;

  return (
    <div
      className={`calendar-grid ${interactive ? "" : "preview-grid"}`}
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
            <span className="day-name-long">{dayNames[day - 1]}</span>
            <span className="day-name-short" aria-hidden="true">{shortDayNames[day - 1]}</span>
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
        preset.periods.map((period) => {
          const style = { gridColumn: day + 1, gridRow: period.index + 1 };
          if (!interactive) return <span className="calendar-cell preview-cell" style={style} key={`${day}-${period.index}`} />;
          return (
            <CalendarCell
              style={style}
              key={`${day}-${period.index}`}
              label={`${dayNames[day - 1]} ${dateLabel(date)} 第 ${period.index} 节`}
              onCreate={() => onCreate?.(day, period.index)}
              onMove={(id) => onMove?.(id, day, period.index)}
            />
          );
        }),
      )}

      {meetings.map((meeting) => {
        const span = meeting.endPeriod - meeting.startPeriod + 1;
        const weekPattern = alternatingWeekLabel(meeting.weeks);
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
            {weekPattern && <span className="course-week-pattern">{weekPattern}</span>}
            {meeting.status === "changed" && <span className="change-dot" title="本地已修改" />}
          </button>
        );
      })}
    </div>
  );
});

interface CalendarCellProps {
  style: CSSProperties;
  label: string;
  onCreate?: () => void;
  onMove?: (id: string) => void;
}

function CalendarCell({ style, label, onCreate, onMove }: CalendarCellProps) {
  const timerRef = useRef<number | undefined>(undefined);
  const feedbackTimerRef = useRef<number | undefined>(undefined);
  const originRef = useRef<{ x: number; y: number } | undefined>(undefined);
  const pointerRef = useRef<number | undefined>(undefined);
  const firedRef = useRef(false);
  const cleanupPressRef = useRef<(() => void) | undefined>(undefined);
  const [pressing, setPressing] = useState(false);

  const cancelPress = () => {
    if (timerRef.current !== undefined) window.clearTimeout(timerRef.current);
    if (feedbackTimerRef.current !== undefined) window.clearTimeout(feedbackTimerRef.current);
    timerRef.current = undefined;
    feedbackTimerRef.current = undefined;
    originRef.current = undefined;
    pointerRef.current = undefined;
    cleanupPressRef.current?.();
    cleanupPressRef.current = undefined;
    setPressing(false);
  };

  useEffect(() => () => {
    if (timerRef.current !== undefined) window.clearTimeout(timerRef.current);
    if (feedbackTimerRef.current !== undefined) window.clearTimeout(feedbackTimerRef.current);
    cleanupPressRef.current?.();
  }, []);

  const triggerCreate = () => {
    if (!onCreate || firedRef.current) return;
    firedRef.current = true;
    cancelPress();
    navigator.vibrate?.(24);
    onCreate();
  };

  return (
    <button
      type="button"
      tabIndex={onCreate ? 0 : -1}
      className={`calendar-cell ${pressing ? "long-pressing" : ""}`}
      style={style}
      aria-label={onCreate ? `${label}，按住约 0.8 秒添加课程` : label}
      onPointerDown={(event) => {
        if (!onCreate || !event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
        if ((event.target as HTMLElement).closest(".week-swipe-viewport")?.querySelector(".settling")) return;
        cancelPress();
        firedRef.current = false;
        pointerRef.current = event.pointerId;
        originRef.current = { x: event.clientX, y: event.clientY };
        // Capture-phase listeners survive the pager taking pointer capture.
        const move = (e: PointerEvent) => {
          if (e.pointerId === pointerRef.current && originRef.current && shouldCancelLongPress(originRef.current, { x: e.clientX, y: e.clientY })) cancelPress();
        };
        const end = (e: PointerEvent) => { if (e.pointerId === pointerRef.current) cancelPress(); };
        const anotherPointer = (e: PointerEvent) => { if (e.pointerId !== pointerRef.current) cancelPress(); };
        window.addEventListener("pointermove", move, true);
        window.addEventListener("pointerup", end, true);
        window.addEventListener("pointercancel", end, true);
        window.addEventListener("pointerdown", anotherPointer, true);
        window.addEventListener("scroll", cancelPress, true);
        window.addEventListener("blur", cancelPress);
        cleanupPressRef.current = () => {
          window.removeEventListener("pointermove", move, true);
          window.removeEventListener("pointerup", end, true);
          window.removeEventListener("pointercancel", end, true);
          window.removeEventListener("pointerdown", anotherPointer, true);
          window.removeEventListener("scroll", cancelPress, true);
          window.removeEventListener("blur", cancelPress);
        };
        feedbackTimerRef.current = window.setTimeout(() => setPressing(true), LONG_PRESS_FEEDBACK_MS);
        timerRef.current = window.setTimeout(triggerCreate, LONG_PRESS_DELAY_MS);
      }}
      onPointerMove={(event) => {
        const origin = originRef.current;
        if (!origin || pointerRef.current !== event.pointerId) return;
        if (shouldCancelLongPress(origin, { x: event.clientX, y: event.clientY })) cancelPress();
      }}
      onPointerUp={cancelPress}
      onPointerCancel={cancelPress}
      onLostPointerCapture={cancelPress}
      onPointerLeave={(event) => { if (event.pointerType === "mouse") cancelPress(); }}
      onContextMenu={(event) => {
        event.preventDefault();
      }}
      onClick={(event) => {
        if (event.detail === 0 && !(event.nativeEvent as PointerEvent).pointerType) {
          firedRef.current = false;
          triggerCreate();
        }
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
