import { describe, expect, it } from "vitest";
import { gradeDistribution, mergeGrades, parseGradeCsv, summarizeGrades, type GradeRecord } from "./gradeCenter";

const records: GradeRecord[] = [
  { id: "1", courseCode: "A", courseName: "高等数学", academicYear: 2026, semester: 1, score: "92", credits: 4, source: "manual", updatedAt: "2026-09-07T00:00:00.000Z" },
  { id: "2", courseCode: "B", courseName: "大学英语", academicYear: 2026, semester: 1, score: "58", credits: 2, source: "manual", updatedAt: "2026-09-07T00:00:00.000Z" },
  { id: "3", courseCode: "C", courseName: "体育", academicYear: 2026, semester: 1, score: "通过", credits: 1, gradePoint: 2, source: "manual", updatedAt: "2026-09-07T00:00:00.000Z" },
];

describe("grade center", () => {
  it("calculates weighted score, GPA, credits, and pass rate", () => {
    expect(summarizeGrades(records)).toMatchObject({ courseCount: 3, completedCount: 3, passedCount: 2, failedCount: 1, earnedCredits: 5, attemptedCredits: 7, averageScore: 80.7, gpa: 2.57, passRate: 66.7 });
  });

  it("builds a four-band distribution", () => {
    expect(gradeDistribution(records).map((bucket) => bucket.count)).toEqual([1, 0, 1, 1]);
  });

  it("imports Chinese CSV and merges matching term/course records", () => {
    const imported = parseGradeCsv("课程代码,课程名称,成绩,学分,绩点,学年,学期\nA,高等数学,95,4,4.0,2026-2027,1", 2025, 2);
    expect(imported[0]).toMatchObject({ courseCode: "A", courseName: "高等数学", score: "95", credits: 4, academicYear: 2026, semester: 1 });
    expect(mergeGrades(records, imported)).toHaveLength(3);
    expect(mergeGrades(records, imported).find((record) => record.courseCode === "A")?.score).toBe("95");
  });
});
