import { useEffect, useLayoutEffect, useMemo, useRef, useState, type UIEvent } from "react";
import { academicPositionForDate, agendaCourseState, coursesForAcademicDate, sameLocalDate } from "../domain/dayAgenda";
import type { ResolvedAcademicCalendar } from "../domain/academicCalendar";
import type { CourseMeeting, DayOfWeek, TimetablePreset } from "../domain/schedule";
import { alternatingWeekLabel } from "../domain/weekPattern";
import { Icon } from "../ui/Icon";
import { SwipePager } from "../ui/SwipePager";
import { reducedMotion } from "../ui/Motion";

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
  const dateStripRef = useRef<HTMLDivElement>(null);
  const dateStripTimerRef = useRef<number | undefined>(undefined);
  const centerDateStripRef = useRef(true);
  const userScrolling = useRef(false);
  const position = academicPositionForDate(selectedDate, calendar);
  const dayCourses = useMemo(() => coursesForAcademicDate(courses, calendar, selectedDate), [calendar, courses, selectedDate]);
  const dateStrip = useMemo(() => buildDateStrip(calendar.weekOneStartsOn, selectedDate), [calendar.weekOneStartsOn, selectedDate]);
  const isToday = sameLocalDate(selectedDate, new Date());

  const goToDate = (date: Date, centerDateStrip = true) => {
    if (dateStripTimerRef.current !== undefined) window.clearTimeout(dateStripTimerRef.current);
    userScrolling.current = false;
    centerDateStripRef.current = centerDateStrip;
    if (!sameLocalDate(date, selectedDate)) setSelectedDate(atNoon(date));
  };

  useLayoutEffect(() => {
    if (!centerDateStripRef.current) { centerDateStripRef.current = true; return; }
    const strip = dateStripRef.current;
    const active = strip?.querySelector<HTMLElement>('[aria-current="date"]');
    if (!strip || !active) return;
    userScrolling.current = false;
    strip.scrollTo({
      left: active.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2,
      behavior: strip.dataset.ready === "true" && !reducedMotion() ? "smooth" : "auto",
    });
    strip.dataset.ready = "true";
  }, [selectedDate, dateStrip]);

  useEffect(() => () => {
    if (dateStripTimerRef.current !== undefined) window.clearTimeout(dateStripTimerRef.current);
  }, []);

  const selectCenteredDate = (event: UIEvent<HTMLDivElement>) => {
    // Ignore programmatic centering; otherwise smooth scrolling selects intermediate days.
    if (!userScrolling.current) return;
    if (dateStripTimerRef.current !== undefined) window.clearTimeout(dateStripTimerRef.current);
    const strip = event.currentTarget;
    dateStripTimerRef.current = window.setTimeout(() => {
      if (!userScrolling.current) return;
      const center = strip.scrollLeft + strip.clientWidth / 2;
      let closest: HTMLButtonElement | undefined;
      let distance = Infinity;
      strip.querySelectorAll<HTMLButtonElement>("button[data-date-time]").forEach((button) => {
        const next = Math.abs(button.offsetLeft + button.offsetWidth / 2 - center);
        if (next < distance) { closest = button; distance = next; }
      });
      const timestamp = Number(closest?.dataset.dateTime);
      if (Number.isFinite(timestamp)) goToDate(new Date(timestamp), false);
    }, 160);
  };

  const renderDay = (date: Date) => {
    const coursesOnDate = coursesForAcademicDate(courses, calendar, date);
    const dayPosition = academicPositionForDate(date, calendar);
    return <div className="today-agenda-list">
      {coursesOnDate.length ? coursesOnDate.map((course) => {
        const start = preset.periods.find((period) => period.index === course.startPeriod)?.start ?? `第${course.startPeriod}节`;
        const end = preset.periods.find((period) => period.index === course.endPeriod)?.end ?? `第${course.endPeriod}节`;
        const state = agendaCourseState(course, preset, date);
        const pattern = alternatingWeekLabel(course.weeks);
        return <button className={`agenda-course color-${course.color} state-${state}`} key={course.id} onClick={() => onSelect(course)}>
          <span className="agenda-time"><strong>{start}</strong><small>{end}</small></span><i className="agenda-line" />
          <span className="agenda-course-copy"><small>{stateLabels[state]} · 第 {course.startPeriod}–{course.endPeriod} 节{pattern ? ` · ${pattern}` : ""}</small><strong>{course.title}</strong><span><Icon name="location" />{course.location}</span><span><Icon name="person" />{course.teacher}</span></span>
          <Icon name="chevron-right" />
        </button>;
      }) : <div className="today-empty"><span><Icon name="today" /></span><h3>{dayPosition.week < 1 || dayPosition.week > 30 ? "不在当前学期" : "这一天没有课程"}</h3><p>留一点时间，给课表之外的生活。</p><button className="primary-button" onClick={() => onCreate(dayPosition.day, 1)}><Icon name="plus" />添加课程</button></div>}
    </div>;
  };

  return <section className="today-panel page-surface">
    <header className="today-hero">
      <div><span className="eyebrow">{isToday ? "今天的安排" : weekNames[selectedDate.getDay()]}</span><h2>{formatLongDate(selectedDate)}</h2><p>{position.week >= 1 && position.week <= 30 ? `第 ${position.week} 周 · ${position.week % 2 ? "单周" : "双周"} · ${dayCourses.length} 门课程` : "当前日期不在本学期内"}</p></div>
      <div className="today-hero-actions">
        {!isToday && <button className="soft-button" onClick={() => goToDate(new Date())}>回到今天</button>}
        {position.week >= 1 && position.week <= 30 && <button className="soft-button" onClick={() => onOpenWeek(position.week)}>周课表<Icon name="arrow-right" /></button>}
      </div>
    </header>
    <div ref={dateStripRef} className="date-strip" aria-label="可左右滑动的日期选择" onScroll={selectCenteredDate}
      onPointerDown={() => { userScrolling.current = true; }} onWheel={() => { userScrolling.current = true; }}>
      {dateStrip.map((date) => {
        const active = sameLocalDate(date, selectedDate), today = sameLocalDate(date, new Date());
        return <button key={dateKey(date)} data-date-time={date.getTime()} aria-current={active ? "date" : undefined} aria-label={formatLongDate(date)}
          className={`${active ? "active" : ""} ${today ? "today" : ""}`} onClick={() => goToDate(date)}><span>{date.getDate() === 1 ? `${date.getMonth() + 1}月` : weekNames[date.getDay()].slice(1)}</span><strong>{date.getDate()}</strong><i /></button>;
      })}
    </div>
    <SwipePager pageKey={dateKey(selectedDate)} pages={[renderDay(addDays(selectedDate,-1)),renderDay(selectedDate),renderDay(addDays(selectedDate,1))]} onPage={(delta) => goToDate(addDays(selectedDate,delta))} />
    <div className="today-swipe-hint"><Icon name="chevron-left" />左右滑动日期或课程区域<Icon name="chevron-right" /></div>
  </section>;
}

function addDays(date: Date, amount: number): Date {
  const result = atNoon(date);
  result.setDate(result.getDate() + amount);
  return result;
}
function buildDateStrip(weekOneStartsOn: Date, selectedDate: Date): Date[] {
  const termStart = addDays(weekOneStartsOn,-14), termEnd = addDays(weekOneStartsOn,30 * 7 + 13), selected = atNoon(selectedDate);
  const outside = selected < addDays(termStart,-60) || selected > addDays(termEnd,60);
  const start = outside ? addDays(selected,-31) : selected < termStart ? addDays(selected,-14) : termStart;
  const end = outside ? addDays(selected,31) : selected > termEnd ? addDays(selected,14) : termEnd;
  return Array.from({length: Math.round((end.getTime()-start.getTime())/86_400_000)+1},(_,index)=>addDays(start,index));
}
function atNoon(date: Date) { return new Date(date.getFullYear(),date.getMonth(),date.getDate(),12); }
function dateKey(date: Date) { return `${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`; }
function formatLongDate(date: Date) { return `${date.getMonth()+1} 月 ${date.getDate()} 日，${weekNames[date.getDay()]}`; }
