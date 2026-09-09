import { describe, expect, it } from "vitest";
import { parsePortalSchedule } from "./portalScheduleAdapter";

describe("parsePortalSchedule", () => {
  it("reads a common Monday-to-Friday HTML timetable", () => {
    const result = parsePortalSchedule({
      pageUrl: "https://school.example.edu/course/table",
      title: "我的课表",
      headings: [], forms: [], links: [], resources: [],
      tables: [{
        headers: ["节次", "周一", "周二", "周三"],
        rows: [
          ["节次", "周一", "周二", "周三"],
          ["1", "大学英语(一)\n讲室 B301\n1-16周", "", "高等数学\n讲室 C401\n单周"],
          ["3", "", "中国近现代史\n讲室 303\n2-16周", ""],
        ],
      }],
    });
    expect(result.courses).toHaveLength(3);
    expect(result.courses[0]).toMatchObject({ title: "大学英语(一)", day: 1, startPeriod: 1, location: "讲室 B301" });
    expect(result.courses[1]).toMatchObject({ title: "高等数学", day: 3, weeks: [1, 3, 5, 7, 9, 11, 13, 15, 17, 19] });
    expect(result.warnings).toHaveLength(0);
  });
});
