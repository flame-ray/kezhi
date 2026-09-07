export type AlternatingWeekLabel = "单周" | "双周";

export function alternatingWeekLabel(weeks: number[]): AlternatingWeekLabel | undefined {
  const unique = [...new Set(weeks.filter((week) => Number.isInteger(week) && week > 0))];
  if (unique.length < 2) return undefined;
  if (unique.every((week) => week % 2 === 1)) return "单周";
  if (unique.every((week) => week % 2 === 0)) return "双周";
  return undefined;
}
