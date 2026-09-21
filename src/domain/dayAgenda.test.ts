import { describe, expect, it } from "vitest";
import { defaultPresets, demoCourses } from "../data/demo";
import { academicPositionForDate, agendaCourseState, coursesForAcademicDate, visibleAcademicWeek } from "./dayAgenda";

const calendar = {
  weekOneStartsOn: new Date(2026, 8, 14, 12),
  teachingStartsOn: new Date(2026, 8, 17, 12),
};

describe("daily agenda", () => {
  it("opens the actual week, including a Thursday teaching start", () => {
    expect(visibleAcademicWeek(new Date(2026, 8, 20, 18), calendar)).toBe(1);
    expect(visibleAcademicWeek(new Date(2026, 8, 21, 0), calendar)).toBe(2);
    expect(visibleAcademicWeek(new Date(2026, 9, 8, 12), calendar)).toBe(4);
  });
  it("clamps out-of-term dates without changing calendar data", () => {
    expect(visibleAcademicWeek(new Date(2026, 7, 1), calendar)).toBe(1);
    expect(visibleAcademicWeek(new Date(2028, 0, 1), calendar)).toBe(30);
    expect(calendar.teachingStartsOn.getDate()).toBe(17);
  });
  it("handles year boundaries and a different saved academic calendar", () => {
    const other = {...calendar, weekOneStartsOn: new Date(2026, 11, 28)};
    expect(visibleAcademicWeek(new Date(2027, 0, 3), other)).toBe(1);
    expect(visibleAcademicWeek(new Date(2027, 0, 4), other)).toBe(2);
    expect(visibleAcademicWeek(new Date(2026, 8, 20), {...calendar,weekOneStartsOn: new Date(2026, 7, 31)})).toBe(3);
  });
  it("maps a calendar date to its academic week and weekday", () => {
    expect(academicPositionForDate(new Date(2026, 8, 17, 12), calendar)).toEqual({ week: 1, day: 4 });
  });

  it("does not show courses before the official teaching start date", () => {
    expect(coursesForAcademicDate(demoCourses, calendar, new Date(2026, 8, 15, 12))).toEqual([]);
    expect(coursesForAcademicDate(demoCourses, calendar, new Date(2026, 8, 17, 12)).length).toBeGreaterThan(0);
  });

  it("reports live course state using the active timetable", () => {
    const course = { ...demoCourses[0], startPeriod: 1, endPeriod: 2 };
    expect(agendaCourseState(course, defaultPresets[0], new Date(2026, 8, 17, 12), new Date(2026, 8, 17, 8, 30))).toBe("active");
    expect(agendaCourseState(course, defaultPresets[0], new Date(2026, 8, 17, 12), new Date(2026, 8, 17, 10, 0))).toBe("finished");
  });
});
