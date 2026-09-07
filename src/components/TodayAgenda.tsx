import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type UIEvent as ReactUIEvent } from "react";
import { academicPositionForDate, agendaCourseState, coursesForAcademicDate, sameLocalDate } from "../domain/dayAgenda";
import type { ResolvedAcademicCalendar } from "../domain/academicCalendar";
import type { CourseMeeting, DayOfWeek, TimetablePreset } from "../domain/schedule";
import { alternatingWeekLabel } from "../domain/weekPattern";
import { Icon } from "../ui/Icon";

const weekNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const stateLabels = { upcoming: "待上课", active: "上课中", finished: "已结束", scheduled: "已安排" } as const;

interface TodayAgendaProps {
  courses: CourseMeeting[];
  preset: TimetablePreset;
  calendar: ResolvedAcademicCalendar;
  onSelect: (course: CourseMeeting) => void;
  onCreate: (day: DayOfWeek, period: number) => void;
  onOpenWeek: (week: number) => void;
}

export function TodayAgenda({ courses, preset, calendar, onSelect, onCreate, onOpenWeek }: TodayAgendaProps) {
  const [selectedDate, setSelectedDate] = useState(() => atNoon(new Date()));
  const [direction, setDirection] = useState<"previous" | "next">("next");
  const pointerRef = useRef<{ id: number; x: number; y: number } | undefined>(undefined);
  const dateStripRef = useRef<HTMLDivElement>(null);
  const dateStripTimerRef = useRef<number | undefined>(undefined);
  const centerDateStripRef = useRef(true);
  const position = academicPositionForDate(selectedDate, calendar);
  const dayCourses = useMemo(() => coursesForAcademicDate(courses, calendar, selectedDate), [calendar, courses, selectedDate]);
  const dateStrip = useMemo(() => buildDateStrip(calendar.weekOneStartsOn, selectedDate), [calendar.weekOneStartsOn, selectedDate]);
  const isToday = sameLocalDate(selectedDate, new Date());

  const goToDate = (date: Date, centerDateStrip = true) => {
    centerDateStripRef.current = centerDateStrip;
    setDirection(date.getTime() < selectedDate.getTime() ? "previous" : "next");
    setSelectedDate(atNoon(date));
  };

  const shiftDay = (delta: -1 | 1) => goToDate(addDays(selectedDate, delta));

  useLayoutEffect(() => {
    if (!centerDateStripRef.current) {
      centerDateStripRef.current = true;
      return;
    }
    const strip = dateStripRef.current;
    const active = strip?.querySelector<HTMLElement>('[aria-current="date"]');
    if (!strip || !active) return;
    strip.scrollTo({
      left: active.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2,
      behavior: strip.dataset.ready === "true" ? "smooth" : "auto",
    });
    strip.dataset.ready = "true";
  }, [selectedDate, dateStrip]);

  useEffect(() => () => {
    if (dateStripTimerRef.current !== undefined) window.clearTimeout(dateStripTimerRef.current);
  }, []);

  const selectCenteredDate = (event: ReactUIEvent<HTMLDivElement>) => {
    if (dateStripTimerRef.current !== undefined) window.clearTimeout(dateStripTimerRef.current);
    const strip = event.currentTarget;
    dateStripTimerRef.current = window.setTimeout(() => {
      const center = strip.scrollLeft + strip.clientWidth / 2;
      let closest: HTMLButtonElement | undefined;
      let closestDistance = Number.POSITIVE_INFINITY;
      strip.querySelectorAll<HTMLButtonElement>("button[data-date-time]").forEach((button) => {
        const distance = Math.abs(button.offsetLeft + button.offsetWidth / 2 - center);
        if (distance < closestDistance) {
          closest = button;
          closestDistance = distance;
        }
      });
      const timestamp = Number(closest?.dataset.dateTime);
      if (Number.isFinite(timestamp)) {
        const date = new Date(timestamp);
        if (!sameLocalDate(date, selectedDate)) goToDate(date, false);
      }
    }, 120);
  };

  const beginSwipe = (event: ReactPointerEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (!event.isPrimary || event.pointerType === "mouse" || target.closest(".date-strip") || target.closest("button")) return;
    pointerRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };

  const endSwipe = (event: ReactPointerEvent<HTMLElement>) => {
    const origin = pointerRef.current;
    pointerRef.current = undefined;
    if (!origin || origin.id !== event.pointerId) return;
    const deltaX = event.clientX - origin.x;
    const deltaY = event.clientY - origin.y;
    if (Math.abs(deltaX) >= 56 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) shiftDay(deltaX < 0 ? 1 : -1);
  };

  return (
    <section className="today-panel page-surface" onPointerDown={beginSwipe} onPointerUp={endSwipe} onPointerCancel={() => { pointerRef.current = undefined; }}>
      <header className="today-hero">
        <div><span className="eyebrow">{isToday ? "TODAY" : weekNames[selectedDate.getDay()]}</span><h2>{formatLongDate(selectedDate)}</h2><p>{position.week >= 1 && position.week <= 30 ? `第 ${position.week} 周 · ${dayCourses.length} 门课程` : "当前日期不在本学期内"}</p></div>
        <div className="today-hero-actions">
          {!isToday && <button className="soft-button" onClick={() => goToDate(new Date())}>回到今天</button>}
          {position.week >= 1 && position.week <= 30 && <button className="soft-button" onClick={() => onOpenWeek(position.week)}>周课表<Icon name="arrow-right" /></button>}
        </div>
      </header>

      <div ref={dateStripRef} className="date-strip" aria-label="可左右滑动的日期选择" onScroll={selectCenteredDate}>
        {dateStrip.map((date) => {
          const active = sameLocalDate(date, selectedDate);
          const today = sameLocalDate(date, new Date());
          return <button key={dateKey(date)} data-date-time={date.getTime()} aria-current={active ? "date" : undefined} className={`${active ? "active" : ""} ${today ? "today" : ""}`} onClick={() => goToDate(date)}><span>{weekNames[date.getDay()].slice(1)}</span><strong>{date.getDate()}</strong><i /></button>;
        })}
      </div>

      <div key={dateKey(selectedDate)} className={`today-agenda-list slide-${direction}`}>
        {dayCourses.length > 0 ? dayCourses.map((course) => {
          const start = preset.periods.find((period) => period.index === course.startPeriod)?.start ?? `第${course.startPeriod}节`;
          const end = preset.periods.find((period) => period.index === course.endPeriod)?.end ?? `第${course.endPeriod}节`;
          const state = agendaCourseState(course, preset, selectedDate);
          const weekPattern = alternatingWeekLabel(course.weeks);
          return (
            <button className={`agenda-course color-${course.color} state-${state}`} key={course.id} onClick={() => onSelect(course)}>
              <span className="agenda-time"><strong>{start}</strong><small>{end}</small></span>
              <i className="agenda-line" />
              <span className="agenda-course-copy"><small>{stateLabels[state]} · 第 {course.startPeriod}-{course.endPeriod} 节{weekPattern ? ` · ${weekPattern}` : ""}</small><strong>{course.title}</strong><span><Icon name="location" />{course.location}</span><span><Icon name="person" />{course.teacher}</span></span>
              <Icon name="chevron-right" />
            </button>
          );
        }) : (
          <div className="today-empty">
            <span><Icon name="today" /></span>
            <h3>{position.week < 1 || position.week > 30 ? "不在当前学期" : "这一天没有课程"}</h3>
            <p>可以放松一下，也可以从这个日期快速添加安排。</p>
            <button className="primary-button" onClick={() => onCreate(position.day, 1)}><Icon name="plus" />添加课程</button>
          </div>
        )}
      </div>

      <div className="today-swipe-hint"><Icon name="chevron-left" />滑动上方日期条或空白区域切换日期<Icon name="chevron-right" /></div>
    </section>
  );
}

function addDays(date: Date, amount: number): Date {
  const result = atNoon(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function buildDateStrip(weekOneStartsOn: Date, selectedDate: Date): Date[] {
  const termStart = addDays(weekOneStartsOn, -14);
  const termEnd = addDays(weekOneStartsOn, 30 * 7 + 13);
  const selected = atNoon(selectedDate);
  const farOutsideTerm = selected.getTime() < addDays(termStart, -60).getTime() || selected.getTime() > addDays(termEnd, 60).getTime();
  const start = farOutsideTerm ? addDays(selected, -31) : selected.getTime() < termStart.getTime() ? addDays(selected, -14) : termStart;
  const end = farOutsideTerm ? addDays(selected, 31) : selected.getTime() > termEnd.getTime() ? addDays(selected, 14) : termEnd;
  const count = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return Array.from({ length: count }, (_, index) => addDays(start, index));
}

function atNoon(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function formatLongDate(date: Date): string {
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日，${weekNames[date.getDay()]}`;
}
