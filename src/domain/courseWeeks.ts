import { MAX_ACADEMIC_WEEK, MIN_ACADEMIC_WEEK } from "./schedule";

export type CourseWeekRule = "continuous" | "odd" | "even" | "custom";

export function detectCourseWeekRule(weeks: number[]): CourseWeekRule {
  const normalized = normalizeWeeks(weeks);
  if (normalized.length === 0) return "continuous";
  if (normalized.every((week) => week % 2 === 1)) return "odd";
  if (normalized.every((week) => week % 2 === 0)) return "even";
  if (normalized.every((week, index) => index === 0 || week === normalized[index - 1] + 1)) return "continuous";
  return "custom";
}

export function resolveCourseWeeks(
  rule: CourseWeekRule,
  start: number,
  end: number,
  expression: string,
): number[] {
  if (rule === "custom") return parseWeekExpression(expression);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
  const lower = clampWeek(Math.min(Math.round(start), Math.round(end)));
  const upper = clampWeek(Math.max(Math.round(start), Math.round(end)));
  return Array.from({ length: upper - lower + 1 }, (_, index) => lower + index)
    .filter((week) => rule === "continuous" || (rule === "odd" ? week % 2 === 1 : week % 2 === 0));
}

export function parseWeekExpression(expression: string): number[] {
  const result = new Set<number>();
  expression.replace(/，/g, ",").split(",").forEach((part) => {
    const value = part.trim();
    if (!value) return;
    const range = value.match(/^(\d+)\s*[-–—~至]\s*(\d+)$/);
    if (range) {
      const rawStart = Number(range[1]);
      const rawEnd = Number(range[2]);
      const lower = Math.max(MIN_ACADEMIC_WEEK, Math.min(rawStart, rawEnd));
      const upper = Math.min(MAX_ACADEMIC_WEEK, Math.max(rawStart, rawEnd));
      for (let week = lower; week <= upper; week += 1) result.add(week);
    } else if (/^\d+$/.test(value)) {
      const week = Number(value);
      if (week >= MIN_ACADEMIC_WEEK && week <= MAX_ACADEMIC_WEEK) result.add(week);
    }
  });
  return [...result].sort((a, b) => a - b);
}

export function formatCourseWeekExpression(weeks: number[]): string {
  const normalized = normalizeWeeks(weeks);
  return normalized.length ? normalized.join(", ") : "1-18";
}

function normalizeWeeks(weeks: number[]): number[] {
  return [...new Set(weeks.filter((week) => Number.isInteger(week) && week >= MIN_ACADEMIC_WEEK && week <= MAX_ACADEMIC_WEEK))]
    .sort((left, right) => left - right);
}

function clampWeek(week: number): number {
  return Math.min(MAX_ACADEMIC_WEEK, Math.max(MIN_ACADEMIC_WEEK, week));
}
