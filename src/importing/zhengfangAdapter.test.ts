import { describe, expect, it } from "vitest";
import { parseWeeks, parseZhengfangSchedule } from "./zhengfangAdapter";

describe("Zhengfang schedule adapter", () => {
  it("parses ranges, lists, and odd/even week rules", () => {
    expect(parseWeeks("1-8周")).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(parseWeeks("1-8周(单)")).toEqual([1, 3, 5, 7]);
    expect(parseWeeks("2-8周（双）,10周")).toEqual([2, 4, 6, 8, 10]);
  });

  it("maps official rows and skips malformed records", () => {
    const result = parseZhengfangSchedule([
      {
        kch_id: "MATH101",
        kcmc: "高等数学（一）",
        xm: "林老师",
        cdmc: "讲堂群206",
        xqj: "2",
        jc: "1-2节",
        zcd: "1-16周(单)",
        jxbmc: "高数教学班",
      },
      {
        kch: "EN101",
        kcmc: "大学英语（一）",
        jsxx: "陈老师",
        jxdd: "B-301",
        xqjmc: "星期四",
        jcs: "3,4",
        zcdmc: "1-18周",
      },
      { kcmc: "缺失时间" },
    ]);

    expect(result.sourceRows).toBe(3);
    expect(result.courses).toHaveLength(2);
    expect(result.warnings).toHaveLength(1);
    expect(result.courses[0]).toMatchObject({
      courseCode: "MATH101",
      title: "高等数学（一）",
      day: 2,
      startPeriod: 1,
      endPeriod: 2,
      weeks: [1, 3, 5, 7, 9, 11, 13, 15],
    });
    expect(result.courses[1]).toMatchObject({ day: 4, startPeriod: 3, endPeriod: 4 });
  });

  it("assigns stable ids to the same official record", () => {
    const row = { kcmc: "大学英语", xqj: "1", jc: "1-2", zcd: "1-16周" };
    expect(parseZhengfangSchedule([row]).courses[0].id).toBe(parseZhengfangSchedule([row]).courses[0].id);
  });
});
