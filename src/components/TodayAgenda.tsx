import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
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
  const position = academicPositionForDate(selectedDate, calendar);
  const dayCourses = useMemo(() => coursesForAcademicDate(courses, calendar, selectedDate), [calendar, courses, selectedDate]);
  const dateStrip = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(selectedDate, index - 3)), [selectedDate]);
  const isToday = sameLocalDate(selectedDate, new Date());

  const goToDate = (date: Date) => {
    setDirection(date.getTime() < selectedDate.getTime() ? "previous" : "next");
    setSelectedDate(atNoon(date));
  };

  const shiftDay = (delta: -1 | 1) => goToDate(addDays(selectedDate, delta));

  const beginSwipe = (event: ReactPointerEvent<HTMLElement>) => {
    if (!event.isPrimary || event.pointerType === "mouse" || (event.target as HTMLElement).closest("button")) return;
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

      <div className="date-strip" aria-label="日期选择">
        {dateStrip.map((date) => {
          const active = sameLocalDate(date, selectedDate);
          const today = sameLocalDate(date, new Date());
          return <button key={dateKey(date)} className={`${active ? "active" : ""} ${today ? "today" : ""}`} onClick={() => goToDate(date)}><span>{weekNames[date.getDay()].slice(1)}</span><strong>{date.getDate()}</strong><i /></button>;
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

      <div className="today-swipe-hint"><Icon name="chevron-left" />在空白区域左右滑动切换日期<Icon name="chevron-right" /></div>
    </section>
  );
}

function addDays(date: Date, amount: number): Date {
  const result = atNoon(date);
  result.setDate(result.getDate() + amount);
  return result;
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
