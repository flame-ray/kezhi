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
    expect(result.courses).toHaveLength(2);
    expect(result.courses[0]).toMatchObject({ title: "大学英语(一)", day: 1, startPeriod: 1, location: "讲室 B301" });
    expect(result.weekReviews).toHaveLength(1);
    expect(result.weekReviews[0]).toMatchObject({ course: { title: "高等数学", day: 3 }, parity: "odd" });
    expect(result.warnings).toHaveLength(0);
  });

  it("never infers weeks from classroom numbers, dates or course codes", () => {
    for (const metadata of ["教室：A101", "课程编号：12", "周一 9月14日", "", "1-xx周", "0-16周", "1-99周"]) {
      const result = parsePortalSchedule({ pageUrl: "https://example.edu/table", title: "课表", headings: [], forms: [], links: [], resources: [], tables: [{ headers: ["节次", "周一", "周二"], rows: [["1-2", `大学英语\n${metadata}`, ""]] }] });
      expect(result.courses, metadata).toHaveLength(0);
      expect(result.weekReviews, metadata).toHaveLength(1);
    }
  });

  it("prioritizes weekday labels over date digits and keeps valid week ranges", () => {
    const result = parsePortalSchedule({ pageUrl: "https://example.edu/table", title: "课表", headings: [], forms: [], links: [], resources: [], tables: [{ headers: [], rows: [["节次", "1/6 周二", "1/7 星期三"], ["1-2", "化学实验\n教室：实验楼101\n周次：1～16周（双）", "数学\n周次：1,3,5"]] }] });
    expect(result.courses[0]).toMatchObject({ title: "化学实验", location: "教室：实验楼101", day: 2, weeks: [2,4,6,8,10,12,14,16] });
    expect(result.courses[1]).toMatchObject({ day: 3, weeks: [1,3,5] });
    expect(result.weekReviews).toHaveLength(0);
  });

  it("does not use metadata as a course title when it precedes the name", () => {
    const result = parsePortalSchedule({ pageUrl: "https://example.edu/table", title: "课表", headings: [], forms: [], links: [], resources: [], tables: [{ headers: ["节次", "周一", "周二"], rows: [["1-2", "周次：1-8\n教室：A101\n教师教育导论", "单周\n教室：A102"]] }] });
    expect(result.courses).toHaveLength(1);
    expect(result.courses[0].title).toBe("教师教育导论");
    expect(result.weekReviews).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
  });
});
