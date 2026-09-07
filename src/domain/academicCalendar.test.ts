import { describe, expect, it } from "vitest";
import {
  alignImportedWeeks,
  inferStudentGrade,
  normalizeAcademicCalendar,
  resolveAcademicCalendar,
  suggestAcademicCalendar,
} from "./academicCalendar";

describe("academic calendar", () => {
  it("infers the grade from the admission year in a student account", () => {
    expect(inferStudentGrade(2026, "20260000001")).toBe(1);
    expect(inferStudentGrade(2026, "20230000001")).toBe(4);
    expect(inferStudentGrade(2026, "teacher")).toBeUndefined();
  });

  it("maps NDNU freshmen to a partial first teaching week", () => {
    const calendar = suggestAcademicCalendar({
      schoolId: "ndnu",
      academicYear: 2026,
      semester: 1,
      loginName: "20260000001",
    });
    expect(calendar.studentGrade).toBe(1);
    expect(calendar.termStartsOn).toBe("2026-09-14");
    expect(calendar.teachingStartsOn).toBe("2026-09-17");
    expect(calendar.inferredFromAccount).toBe(true);
    expect(calendar.importWeekOffset).toBe(2);
    expect(calendar.source).toBe("official");
  });

  it("uses the continuing-student date when the selected grade is higher", () => {
    const calendar = suggestAcademicCalendar({
      schoolId: "ndnu",
      academicYear: 2026,
      semester: 1,
      studentGrade: 3,
    });
    expect(calendar.termStartsOn).toBe("2026-08-31");
    expect(calendar.teachingStartsOn).toBe("2026-08-31");
  });

  it("rebases school-global week numbers only when the imported data needs it", () => {
    const course = {
      id: "course", courseCode: "C1", title: "课程", teacher: "教师", location: "教室",
      day: 4 as const, startPeriod: 1, endPeriod: 2, weeks: [3, 4], color: "blue" as const,
    };
    const aligned = alignImportedWeeks([course], 2);
    expect(aligned.appliedOffset).toBe(2);
    expect(aligned.courses[0].weeks).toEqual([1, 2]);

    const alreadyRelative = alignImportedWeeks([{ ...course, weeks: [1, 2] }], 2);
    expect(alreadyRelative.appliedOffset).toBe(0);
    expect(alreadyRelative.courses[0].weeks).toEqual([1, 2]);
  });

  it("upgrades legacy freshman snapshots without changing their week-one Monday", () => {
    const settings = normalizeAcademicCalendar({
      schoolId: "ndnu",
      academicYear: 2026,
      semester: 1,
      termStartsOn: "2026-09-14",
    });
    expect(settings).toEqual({
      studentGrade: 1,
      termStartsOn: "2026-09-14",
      teachingStartsOn: "2026-09-17",
    });
    expect(resolveAcademicCalendar(settings).teachingStartsOn.getDate()).toBe(17);
  });
});
