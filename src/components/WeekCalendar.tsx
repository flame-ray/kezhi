import {
  forwardRef,
  useImperativeHandle,
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
import { Presence, reducedMotion } from "../ui/Motion";
import { DialogSurface } from "../ui/DialogSurface";
import { groupWeekCards, type WeekCardGroup } from "../domain/weekCardGroups";

const dayNames = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const shortDayNames = ["一", "二", "三", "四", "五", "六", "日"];
const MIN_PAGE_TRANSITION_MS = 190;
const MAX_PAGE_TRANSITION_MS = 310;

export interface WeekCalendarHandle { cancelDraft: () => boolean; cancelOverlay: () => boolean; }
interface DraftRange { day: DayOfWeek; startPeriod: number; endPeriod: number; }

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
  onCreate: (day: DayOfWeek, period: number, endPeriod?: number) => void;
  onChangeWeek: (delta: -1 | 1) => void;
}

export const WeekCalendar = forwardRef<WeekCalendarHandle, WeekCalendarProps>(function WeekCalendar({
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
}: WeekCalendarProps, ref) {
  const [draft, setDraft] = useState<DraftRange>();
  const [overlap, setOverlap] = useState<WeekCardGroup>();
  useImperativeHandle(ref, () => ({
    cancelDraft: () => { if (!draft) return false; setDraft(undefined); return true; },
    cancelOverlay: () => { if (!overlap) return false; setOverlap(undefined); return true; },
  }), [draft, overlap]);
  useEffect(() => { setOverlap(undefined); }, [view.week]);
  useEffect(() => { setDraft(undefined); }, [view.week, preset]);
  useEffect(() => {
    if (!draft) return;
    const dismiss = (event: KeyboardEvent) => { if (event.key === "Escape") { setDraft(undefined); event.preventDefault(); } };
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, [draft]);
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
    if ((event.target as HTMLElement).closest(".course-card, .course-range-picker, .course-draft-slot")) return;
    setDraft(undefined);
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
            draft={draft}
            onDraft={setDraft}
            onShowOverlap={setOverlap}
          />
        </div>
        <div ref={nextPageRef} className="calendar-scroll week-page" aria-hidden="true">
          <CalendarGrid view={nextView} preset={preset} interactive={false} />
        </div>
      </div>
      {draft && <div className="course-range-picker" role="group" aria-label="调整课程时间">
        <div className="draft-time-caption" aria-live="polite">{dayNames[draft.day - 1]} · 第 {draft.startPeriod}–{draft.endPeriod} 节
          <small>{preset.periods.find(p => p.index === draft.startPeriod)?.start}–{preset.periods.find(p => p.index === draft.endPeriod)?.end}</small>
        </div>
        <div className="draft-time-controls">
          <span>开始</span>
          <button aria-label="开始提前一节" disabled={draft.startPeriod <= 1} onClick={() => setDraft({ ...draft, startPeriod: draft.startPeriod - 1 })}>↑</button>
          <button aria-label="开始推后一节" disabled={draft.startPeriod >= draft.endPeriod} onClick={() => setDraft({ ...draft, startPeriod: draft.startPeriod + 1 })}>↓</button>
          <span>结束</span>
          <button aria-label="结束提前一节" disabled={draft.endPeriod <= draft.startPeriod} onClick={() => setDraft({ ...draft, endPeriod: draft.endPeriod - 1 })}>↑</button>
          <button aria-label="结束推后一节" disabled={draft.endPeriod >= preset.periods.length} onClick={() => setDraft({ ...draft, endPeriod: draft.endPeriod + 1 })}>↓</button>
          <button aria-label="取消时间选择" onClick={() => setDraft(undefined)}><Icon name="close" /></button>
          <button className="draft-confirm" aria-label="按选定时间添加课程" onClick={() => { onCreate(draft.day, draft.startPeriod, draft.endPeriod); setDraft(undefined); }}><Icon name="plus" /></button>
        </div>
      </div>}
      <Presence>{overlap && <DialogSurface className="overlap-courses-dialog" labelledBy="overlap-courses-title" onClose={() => setOverlap(undefined)}>
        <header className="dialog-header">
          <div><span className="eyebrow">{dayNames[overlap.day - 1]} · 第 {overlap.startPeriod}–{overlap.endPeriod} 节</span><h2 id="overlap-courses-title">此时段共 {overlap.entries.length} 门课程</h2><p className="dialog-description">本周课程排在前面，点击查看课程详情</p></div>
          <button className="icon-button" aria-label="关闭课程列表" onClick={() => setOverlap(undefined)}><Icon name="close" /></button>
        </header>
        <div className="overlap-course-list">
          {overlap.entries.map(({ meeting, inactive, beforeTeaching }) => <button key={meeting.id} className={`overlap-course-item color-${meeting.color}`} onClick={() => { setOverlap(undefined); onSelect(meeting); }}>
            <strong>{meeting.title}</strong>
            <span>第 {meeting.startPeriod}–{meeting.endPeriod} 节 · {meeting.location}</span>
            <span>{meeting.teacher}</span>
            <small>{meeting.status === "cancelled" ? (meeting.occurrence?.kind === "move" ? "本次已调走" : "本次停课") : inactive ? "非本周" : beforeTeaching ? "本周 · 未开课" : "本周上课"}{alternatingWeekLabel(meeting.weeks) ? ` · ${alternatingWeekLabel(meeting.weeks)}` : ""} · 第 {meeting.weeks.join("、")} 周</small>
          </button>)}
        </div>
      </DialogSurface>}</Presence>
    </div>
  );
});

interface CalendarGridProps {
  view: WeekView;
  preset: TimetablePreset;
  selectedId?: string;
  interactive: boolean;
  onSelect?: (meeting: CourseMeeting) => void;
  onMove?: (id: string, day: DayOfWeek, period: number) => void;
  onCreate?: (day: DayOfWeek, period: number, endPeriod?: number) => void;
  draft?: DraftRange;
  onDraft?: (draft: DraftRange | undefined) => void;
  onShowOverlap?: (group: WeekCardGroup) => void;
}

const CalendarGrid = memo(function CalendarGrid({ view, preset, selectedId, interactive, onSelect, onMove, onCreate, draft, onDraft, onShowOverlap }: CalendarGridProps) {
  const draftClickArmed = useRef(false);
  useEffect(() => { draftClickArmed.current = false; }, [draft]);
  const groups = groupWeekCards(view);
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
              onCreate={() => onDraft?.({ day, startPeriod: period.index, endPeriod: period.index })}
              onMove={(id) => onMove?.(id, day, period.index)}
            />
          );
        }),
      )}

      {groups.map((group) => {
        const { meeting, inactive, beforeTeaching } = group.entries[0];
        const multiple = group.entries.length > 1;
        const span = group.endPeriod - group.startPeriod + 1;
        const weekPattern = alternatingWeekLabel(meeting.weeks);
        return (
          <button
            type="button"
            draggable={interactive && !multiple && !meeting.occurrence}
            aria-haspopup={multiple ? "dialog" : undefined}
            tabIndex={interactive ? 0 : -1}
            className={`course-card color-${meeting.color} ${selectedId === meeting.id ? "selected" : ""} ${meeting.status === "changed" ? "changed" : ""} ${meeting.status === "cancelled" ? "occurrence-cancelled" : ""} ${inactive ? "not-this-week" : ""} ${beforeTeaching ? "before-teaching" : ""}`}
            style={{
              gridColumn: meeting.day + 1,
              gridRow: `${group.startPeriod + 1} / span ${span}`,
            }}
            key={meeting.id}
            onClick={() => { if (!interactive) return; if (multiple) onShowOverlap?.(group); else onSelect?.(meeting); }}
            onDragStart={(event) => {
              if (!interactive || multiple || meeting.occurrence) { event.preventDefault(); return; }
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/course-id", meeting.id);
            }}
          >
            {multiple && <span className="course-stack-count">共 {group.entries.length} 门 ›</span>}
            <span className="course-title">{meeting.title}</span>
            {multiple && (meeting.startPeriod !== group.startPeriod || meeting.endPeriod !== group.endPeriod) && <span className="course-stack-period">第{meeting.startPeriod}–{meeting.endPeriod}节</span>}
            <span className="course-meta"><Icon name="location" />{meeting.location}</span>
            {span > 1 && <span className="course-teacher">{meeting.teacher}</span>}
            {meeting.note && !meeting.occurrence && <span className="course-badge">{meeting.note}</span>}
            {(weekPattern || inactive || beforeTeaching) && <span className="course-week-pattern">{[weekPattern, inactive ? "非本周" : beforeTeaching ? "未开课" : ""].filter(Boolean).join(" · ")}</span>}
            {meeting.status === "cancelled" && <small className="occurrence-card-label">{meeting.occurrence?.kind === "move" ? "本次已调走" : "本次停课"}</small>}
            {meeting.status === "changed" && <span className="change-dot" title={meeting.occurrence ? "仅本次调课" : "本地已修改"} />}
          </button>
        );
      })}
      {draft && interactive && <button
        className="course-draft-slot"
        style={{ gridColumn: draft.day + 1, gridRow: `${draft.startPeriod + 1} / span ${draft.endPeriod - draft.startPeriod + 1}` }}
        aria-label={`添加周${shortDayNames[draft.day - 1]}第${draft.startPeriod}至${draft.endPeriod}节课程`}
        onPointerDown={() => { draftClickArmed.current = true; }}
        onPointerCancel={() => { draftClickArmed.current = false; }}
        onClick={(event) => {
          // The release of the original long press may click the new overlay.
          // Only a fresh tap or a keyboard activation confirms the time range.
          if (!draftClickArmed.current && (event.detail !== 0 || (event.nativeEvent as PointerEvent).pointerType)) return;
          draftClickArmed.current = false;
          onCreate?.(draft.day, draft.startPeriod, draft.endPeriod);
          onDraft?.(undefined);
        }}
      ><Icon name="plus" /><small>{draft.startPeriod}–{draft.endPeriod}节</small></button>}
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
