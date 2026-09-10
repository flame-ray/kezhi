import type { CourseMeeting } from "../domain/schedule";

export interface PortalWeekReview {
  course: Omit<CourseMeeting, "weeks">;
  sourceText: string;
  parity?: "odd" | "even";
}
export interface PortalWeekDecision { text: string; skip?: boolean; }

/** Strict whole-expression parsing: never interpret a room number or partial malformed range as weeks. */
export function parseConfirmedPortalWeeks(text: string): number[] {
  const normalized = text.trim().replace(/[（]/g, "(").replace(/[）]/g, ")")
    .replace(/[～~—–至]/g, "-").replace(/[，、；;]/g, ",").replace(/\s+/g, "")
    .replace(/^周次[:：]?/, "").replace(/第/g, "").replace(/单周/g, "周(单)").replace(/双周/g, "周(双)");
  if (!normalized || normalized.length > 240) return [];
  const result = new Set<number>();
  for (const segment of normalized.split(",")) {
    const match = segment.match(/^(\d{1,2})(?:-(\d{1,2}))?周?(?:\(([单双])\))?$/);
    if (!match) return [];
    const first = Number(match[1]), last = Number(match[2] ?? match[1]);
    if (first < 1 || last > 30 || last < first) return [];
    for (let week = first; week <= last; week++) {
      if (!match[3] || week % 2 === (match[3] === "单" ? 1 : 0)) result.add(week);
    }
  }
  return [...result].sort((a, b) => a - b);
}

export function resolvePortalWeekReview(review: PortalWeekReview, text: string): CourseMeeting | undefined {
  const weeks = parseConfirmedPortalWeeks(text).filter(week => !review.parity || week % 2 === (review.parity === "odd" ? 1 : 0));
  if (!weeks.length) return undefined;
  return { ...review.course, weeks };
}
