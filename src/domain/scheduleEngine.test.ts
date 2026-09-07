import { describe, expect, it } from "vitest";
import { demoCourses } from "../data/demo";
import { parseWeekExpression } from "../components/CourseEditorDialog";
import { buildWeekView, moveMeeting } from "./scheduleEngine";

describe("schedule engine", () => {
  it("builds seven days and hides meetings outside the selected week", () => {
    const firstMonday = new Date(2026, 7, 31, 12);
    const view = buildWeekView(
      demoCourses,
      { weekOneStartsOn: firstMonday, teachingStartsOn: firstMonday }, 1,
    );
    expect(view.days).toHaveLength(7);
    expect(view.days.flatMap((day) => day.meetings).length).toBeGreaterThan(0);
    expect(view.days.flatMap((day) => day.meetings).every((meeting) => meeting.weeks.includes(1))).toBe(true);
  });

  it("keeps week one on Monday but hides freshman courses before Thursday", () => {
    const monday = { ...demoCourses[0], id: "monday", day: 1 as const, weeks: [1] };
    const thursday = { ...demoCourses[0], id: "thursday", day: 4 as const, weeks: [1] };
    const view = buildWeekView(
      [monday, thursday],
      {
        weekOneStartsOn: new Date(2026, 8, 14, 12),
        teachingStartsOn: new Date(2026, 8, 17, 12),
      },
      1,
    );
    expect(view.startsOn.getDate()).toBe(14);
    expect(view.days[0].meetings).toEqual([]);
    expect(view.days[3].meetings.map((meeting) => meeting.id)).toEqual(["thursday"]);
  });

  it("moves a meeting while preserving its duration", () => {
    const source = demoCourses[0];
    const next = moveMeeting(demoCourses, source.id, 5, 5).find(
      (meeting) => meeting.id === source.id,
    )!;
    expect(next.day).toBe(5);
    expect(next.startPeriod).toBe(5);
    expect(next.endPeriod - next.startPeriod).toBe(
      source.endPeriod - source.startPeriod,
    );
    expect(next.status).toBe("changed");
  });

  it("parses mixed custom week expressions", () => {
    expect(parseWeekExpression("1-3, 6，9-10")).toEqual([1, 2, 3, 6, 9, 10]);
    expect(parseWeekExpression("0, 31, x")).toEqual([]);
  });
});
