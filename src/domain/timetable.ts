import type { TimetablePreset } from "./schedule";

const MAX_PERIODS = 30;

export function validateTimetablePreset(preset: TimetablePreset): string | undefined {
  if (!preset.id.trim() || preset.id.length > 200) return "作息方案标识无效";
  if (!preset.name.trim() || preset.name.length > 100) return "作息方案名称不能为空或超过 100 字";
  if (!preset.periods.length || preset.periods.length > MAX_PERIODS) return `作息方案需要包含 1–${MAX_PERIODS} 节课`;
  for (let index = 0; index < preset.periods.length; index += 1) {
    const period = preset.periods[index];
    if (period.index !== index + 1) return "节次必须从 1 开始连续排列";
    const start = timeMinutes(period.start);
    const end = timeMinutes(period.end);
    if (start === undefined || end === undefined || start >= end) return `第 ${period.index} 节的结束时间必须晚于开始时间`;
  }
  return undefined;
}

export function appendTimetablePeriod(preset: TimetablePreset): TimetablePreset | undefined {
  if (preset.periods.length >= MAX_PERIODS || validateTimetablePreset(preset)) return undefined;
  const previousEnd = timeMinutes(preset.periods.at(-1)?.end ?? "");
  if (previousEnd === undefined) return undefined;
  const start = previousEnd + 5;
  const end = start + 45;
  if (end >= 24 * 60) return undefined;
  return {
    ...preset,
    periods: [...preset.periods, { index: preset.periods.length + 1, start: formatTime(start), end: formatTime(end) }],
  };
}

function timeMinutes(value: string): number | undefined {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return undefined;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? hour * 60 + minute : undefined;
}

function formatTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
