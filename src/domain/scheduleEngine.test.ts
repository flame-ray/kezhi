import { describe, expect, it } from "vitest";
import { demoCourses } from "../data/demo";
import { parseWeekExpression } from "../components/CourseEditorDialog";
import { buildWeekView, moveMeeting } from "./scheduleEngine";

describe("schedule engine", () => {
  it("builds seven days and hides meetings outside the selected week", () => {
    const view = buildWeekView(demoCourses, new Date(2026, 7, 31), 1);
    expect(view.days).toHaveLength(7);
    expect(view.days.flatMap((day) => day.meetings).length).toBeGreaterThan(0);
    expect(view.days.flatMap((day) => day.meetings).every((meeting) => meeting.weeks.includes(1))).toBe(true);
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
