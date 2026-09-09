import { describe, expect, it } from "vitest";
import { groupWeekCards } from "./weekCardGroups";
import { buildWeekView } from "./scheduleEngine";
import { demoCourses } from "../data/demo";

const calendar = { weekOneStartsOn: new Date(2026, 8, 14), teachingStartsOn: new Date(2026, 8, 17) };
const meeting = (id: string, startPeriod: number, endPeriod: number, weeks = [1]) =>
  ({ ...demoCourses[0], id, day: 2 as const, startPeriod, endPeriod, weeks });
describe("week card groups", () => {
  it("uses one card for odd/even courses and gives the current course priority", () => {
    const odd = meeting("odd", 3, 4), even = meeting("even", 3, 4, [2]);
    const courses = [even, odd], before = JSON.stringify(courses);
    for (const week of [1, 2]) {
      const groups = groupWeekCards(buildWeekView(courses, calendar, week));
      expect(groups).toHaveLength(1);
      expect(groups[0].entries[0].meeting.id).toBe(week === 1 ? "odd" : "even");
      expect(groups[0].entries).toHaveLength(2);
    }
    expect(JSON.stringify(courses)).toBe(before);
  });
  it("also groups multiple non-current courses without dropping them", () => {
    const groups = groupWeekCards(buildWeekView([meeting("a", 3, 4, [2]), meeting("b", 3, 4, [3])], calendar, 1));
    expect(groups).toHaveLength(1);
    expect(groups[0].entries.every(entry => entry.inactive)).toBe(true);
  });
  it("groups partial and chained overlaps while keeping adjacent periods separate", () => {
    const groups = groupWeekCards(buildWeekView([
      meeting("a", 1, 2), meeting("b", 2, 3), meeting("c", 3, 4), meeting("d", 5, 6),
    ], calendar, 1));
    expect(groups.map(group => [group.startPeriod, group.endPeriod, group.entries.length])).toEqual([[1, 4, 3], [5, 6, 1]]);
  });
  it("does not combine different days or lose pre-opening courses", () => {
    const groups = groupWeekCards(buildWeekView([meeting("a", 1, 2), { ...meeting("b", 1, 2), day: 4 }], calendar, 1));
    expect(groups).toHaveLength(2);
    expect(groups[0].entries[0].beforeTeaching).toBe(true);
    expect(groups[1].entries[0].beforeTeaching).toBe(false);
  });
});
