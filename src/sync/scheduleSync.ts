import type { CourseMeeting } from "../domain/schedule";

export type SyncChoice = "local" | "official";
export type SyncChangeKind = "added" | "removed" | "modified";

export interface ScheduleSyncChange {
  id: string;
  kind: SyncChangeKind;
  title: string;
  local?: CourseMeeting;
  official?: CourseMeeting;
  changedFields: string[];
}

export interface ScheduleSyncPlan {
  changes: ScheduleSyncChange[];
  unchangedCount: number;
  checkedAt: string;
}

const comparableFields: Array<{ key: keyof CourseMeeting; label: string }> = [
  { key: "courseCode", label: "课程编号" },
  { key: "title", label: "课程名称" },
  { key: "teacher", label: "教师" },
  { key: "location", label: "教室" },
  { key: "day", label: "星期" },
  { key: "startPeriod", label: "开始节次" },
  { key: "endPeriod", label: "结束节次" },
  { key: "weeks", label: "周次" },
  { key: "note", label: "备注" },
];

export function createScheduleSyncPlan(localCourses: CourseMeeting[], officialCourses: CourseMeeting[], now = new Date()): ScheduleSyncPlan {
  const localSchoolCourses = localCourses.filter(isSchoolCourse);
  const officialSchoolCourses = officialCourses.map((course) => ({ ...course, source: "school" as const }));
  const unmatchedOfficial = new Map(officialSchoolCourses.map((course) => [course.id, course]));
  const matches: Array<{ local: CourseMeeting; official: CourseMeeting }> = [];
  const removals: CourseMeeting[] = [];

  for (const local of localSchoolCourses) {
    const exact = unmatchedOfficial.get(local.id);
    if (exact) {
      matches.push({ local, official: exact });
      unmatchedOfficial.delete(exact.id);
      continue;
    }

    const candidates = [...unmatchedOfficial.values()].filter((official) => canMatch(local, official));
    const closest = candidates.sort((left, right) => similarity(right, local) - similarity(left, local))[0];
    if (closest) {
      matches.push({ local, official: closest });
      unmatchedOfficial.delete(closest.id);
    } else {
      removals.push(local);
    }
  }

  const changes: ScheduleSyncChange[] = [];
  let unchangedCount = 0;
  for (const pair of matches) {
    const changedFields = findChangedFields(pair.local, pair.official);
    if (changedFields.length === 0) {
      unchangedCount += 1;
      continue;
    }
    changes.push({
      id: changeId("modified", pair.local.id, pair.official.id),
      kind: "modified",
      title: pair.official.title,
      local: pair.local,
      official: pair.official,
      changedFields,
    });
  }
  for (const local of removals) {
    changes.push({
      id: changeId("removed", local.id),
      kind: "removed",
      title: local.title,
      local,
      changedFields: [],
    });
  }
  for (const official of unmatchedOfficial.values()) {
    changes.push({
      id: changeId("added", official.id),
      kind: "added",
      title: official.title,
      official,
      changedFields: [],
    });
  }

  return { changes, unchangedCount, checkedAt: now.toISOString() };
}

export function applyScheduleSyncPlan(
  localCourses: CourseMeeting[],
  plan: ScheduleSyncPlan,
  choices: Record<string, SyncChoice>,
): CourseMeeting[] {
  const result = [...localCourses];
  for (const change of plan.changes) {
    if (choices[change.id] !== "official") continue;

    if (change.kind === "added" && change.official) {
      if (!result.some((course) => course.id === change.official?.id)) result.push(change.official);
      continue;
    }
    if (change.kind === "removed" && change.local) {
      const index = result.findIndex((course) => course.id === change.local?.id);
      if (index >= 0) result.splice(index, 1);
      continue;
    }
    if (change.kind === "modified" && change.local && change.official) {
      const index = result.findIndex((course) => course.id === change.local?.id);
      if (index >= 0) {
        result.splice(index, 1, { ...change.official, color: change.local.color, reminderMinutes: change.local.reminderMinutes, status: "normal" });
      }
    }
  }
  return result;
}

function findChangedFields(local: CourseMeeting, official: CourseMeeting): string[] {
  return comparableFields
    .filter(({ key }) => !sameValue(local[key], official[key]))
    .map(({ label }) => label);
}

function sameValue(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) && Array.isArray(right)) return left.join(",") === right.join(",");
  return left === right;
}

function isSchoolCourse(course: CourseMeeting): boolean {
  return course.source === "school" || course.id.startsWith("zf-");
}

function canMatch(left: CourseMeeting, right: CourseMeeting): boolean {
  if (left.sourceKey && right.sourceKey && left.sourceKey.trim().toLowerCase() === right.sourceKey.trim().toLowerCase()) return true;
  return fallbackMatchKey(left) === fallbackMatchKey(right);
}

function fallbackMatchKey(course: CourseMeeting): string {
  return [course.courseCode, course.title, course.teacher].map((value) => value.trim().toLowerCase()).join("|");
}

function similarity(left: CourseMeeting, right: CourseMeeting): number {
  let score = 0;
  if (left.day === right.day) score += 4;
  if (left.startPeriod === right.startPeriod && left.endPeriod === right.endPeriod) score += 4;
  if (sameValue(left.weeks, right.weeks)) score += 3;
  if (left.location === right.location) score += 2;
  if (left.teacher === right.teacher) score += 1;
  return score;
}

function changeId(kind: SyncChangeKind, ...ids: string[]): string {
  return `${kind}:${ids.join(":")}`;
}
