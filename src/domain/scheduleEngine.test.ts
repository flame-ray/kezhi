import { describe, expect, it } from "vitest";
import { demoCourses } from "../data/demo";
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

  it("keeps Monday courses visible before Thursday teaching starts without changing source weeks", () => {
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
    expect(view.days[0].meetings.map((meeting) => meeting.id)).toEqual(["monday"]);
    expect(view.days[0].beforeTeaching).toBe(true);
    expect(view.days[3].beforeTeaching).toBe(false);
    expect(monday.weeks).toEqual([1]);
    expect(view.days[3].meetings.map((meeting) => meeting.id)).toEqual(["thursday"]);
  });

  it("separates non-current courses for translucent display without duplicating current courses", () => {
    const odd = { ...demoCourses[0], id: "odd", day: 1 as const, weeks: [1, 3] };
    const even = { ...odd, id: "even", weeks: [2, 4] };
    const date = new Date(2026, 8, 14, 12);
    const view = buildWeekView([odd, even], { weekOneStartsOn: date, teachingStartsOn: date }, 2);
    expect(view.days[0].meetings.map(course => course.id)).toEqual(["even"]);
    expect(view.days[0].inactiveMeetings?.map(course => course.id)).toEqual(["odd"]);
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

  it("keeps a dragged meeting inside the timetable", () => {
    const source = { ...demoCourses[0], startPeriod: 1, endPeriod: 2 };
    const next = moveMeeting([source], source.id, 5, 10, 10)[0];
    expect(next.startPeriod).toBe(9);
    expect(next.endPeriod).toBe(10);
  });
});
