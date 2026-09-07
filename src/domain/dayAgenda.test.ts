import { describe, expect, it } from "vitest";
import { defaultPresets, demoCourses } from "../data/demo";
import { academicPositionForDate, agendaCourseState, coursesForAcademicDate } from "./dayAgenda";

const calendar = {
  weekOneStartsOn: new Date(2026, 8, 14, 12),
  teachingStartsOn: new Date(2026, 8, 17, 12),
};

describe("daily agenda", () => {
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
