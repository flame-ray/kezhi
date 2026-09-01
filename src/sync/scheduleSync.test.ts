import { describe, expect, it } from "vitest";
import type { CourseMeeting } from "../domain/schedule";
import { applyScheduleSyncPlan, createScheduleSyncPlan } from "./scheduleSync";

function course(id: string, overrides: Partial<CourseMeeting> = {}): CourseMeeting {
  return {
    id,
    courseCode: "MATH101",
    title: "高等数学",
    teacher: "林老师",
    location: "A101",
    day: 1,
    startPeriod: 1,
    endPeriod: 2,
    weeks: [1, 2, 3, 4],
    color: "blue",
    source: "school",
    sourceKey: "class-math",
    ...overrides,
  };
}

describe("schedule sync module", () => {
  it("finds additions, removals, modifications, and unchanged courses", () => {
    const local = [
      course("same"),
      course("old-room", { sourceKey: "room", location: "A101" }),
      course("removed", { sourceKey: "removed", title: "大学物理" }),
    ];
    const official = [
      course("same"),
      course("new-room", { sourceKey: "room", location: "A202" }),
      course("added", { sourceKey: "added", title: "大学英语" }),
    ];

    const plan = createScheduleSyncPlan(local, official, new Date("2026-08-31T00:00:00.000Z"));
    expect(plan.unchangedCount).toBe(1);
    expect(plan.changes.map((change) => change.kind).sort()).toEqual(["added", "modified", "removed"]);
    expect(plan.changes.find((change) => change.kind === "modified")?.changedFields).toContain("教室");
  });

  it("preserves manual courses and applies each user choice", () => {
    const manual = course("manual", { source: "local", sourceKey: undefined, title: "自习" });
    const local = [manual, course("old", { sourceKey: "room", location: "A101", reminderMinutes: 30 })];
    const official = [
      course("new", { sourceKey: "room", location: "A202" }),
      course("added", { sourceKey: "pe", title: "大学体育" }),
    ];
    const plan = createScheduleSyncPlan(local, official);
    const choices = Object.fromEntries(plan.changes.map((change) => [change.id, "official" as const]));
    const applied = applyScheduleSyncPlan(local, plan, choices);

    expect(applied.some((item) => item.id === "manual")).toBe(true);
    expect(applied.some((item) => item.location === "A202")).toBe(true);
    expect(applied.find((item) => item.location === "A202")?.reminderMinutes).toBe(30);
    expect(applied.some((item) => item.title === "大学体育")).toBe(true);
  });

  it("keeps local changes when the local choice is selected", () => {
    const local = [course("old", { sourceKey: "room", location: "本地教室" })];
    const plan = createScheduleSyncPlan(local, [course("new", { sourceKey: "room", location: "官方教室" })]);
    const choices = Object.fromEntries(plan.changes.map((change) => [change.id, "local" as const]));
    expect(applyScheduleSyncPlan(local, plan, choices)[0].location).toBe("本地教室");
  });
});
