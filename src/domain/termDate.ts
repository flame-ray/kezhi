export const DEFAULT_TERM_START_KEY = "2026-09-14";
export const DEFAULT_TEACHING_START_KEY = "2026-09-17";

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDateKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = parseDateKey(value);
  return parsed !== undefined;
}

export function normalizeTermStartKey(value: unknown): string {
  const date = typeof value === "string" ? parseDateKey(value) : undefined;
  if (!date) return DEFAULT_TERM_START_KEY;
  const day = date.getDay();
  const offsetToMonday = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + offsetToMonday);
  return toDateKey(date);
}

export function resolveTermStartDate(value: unknown): Date {
  return parseDateKey(normalizeTermStartKey(value)) ?? new Date(2026, 8, 14, 12);
}

export function normalizeTeachingStartKey(value: unknown, termStartsOn: unknown, fallback?: unknown): string {
  const termStart = resolveTermStartDate(termStartsOn);
  const selected = typeof value === "string" ? parseDateKey(value) : undefined;
  const suggested = typeof fallback === "string" ? parseDateKey(fallback) : undefined;
  const date = selected ?? suggested ?? termStart;
  return toDateKey(date.getTime() < termStart.getTime() ? termStart : date);
}

export function resolveTeachingStartDate(value: unknown, termStartsOn: unknown): Date {
  return parseDateKey(normalizeTeachingStartKey(value, termStartsOn)) ?? resolveTermStartDate(termStartsOn);
}

export function suggestTermStartKey(academicYear: number, semester: 1 | 2): string {
  const safeYear = Number.isInteger(academicYear) && academicYear >= 2000 && academicYear <= 2100
    ? academicYear
    : 2026;
  const year = semester === 1 ? safeYear : safeYear + 1;
  const month = semester === 1 ? 8 : 1;
  const firstDay = new Date(year, month, 1, 12);
  const daysUntilMonday = (8 - firstDay.getDay()) % 7;
  firstDay.setDate(1 + daysUntilMonday + 7);
  return toDateKey(firstDay);
}

function parseDateKey(value: string): Date | undefined {
  const match = DATE_KEY_PATTERN.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return undefined;
  return date;
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
