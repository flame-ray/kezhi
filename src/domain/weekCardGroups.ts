import type { CourseMeeting, DayOfWeek, WeekView } from "./schedule";

export interface WeekCardEntry {
  meeting: CourseMeeting;
  inactive: boolean;
  beforeTeaching: boolean;
}
export interface WeekCardGroup {
  day: DayOfWeek;
  startPeriod: number;
  endPeriod: number;
  entries: WeekCardEntry[];
}

/** Each connected time range has exactly one card, even with partial overlaps. */
export function groupWeekCards(view: WeekView): WeekCardGroup[] {
  return view.days.flatMap(day => {
    const entries: WeekCardEntry[] = [
      ...day.meetings.map(meeting => ({ meeting, inactive: false, beforeTeaching: Boolean(day.beforeTeaching) })),
      ...(day.inactiveMeetings ?? []).map(meeting => ({ meeting, inactive: true, beforeTeaching: Boolean(day.beforeTeaching) })),
    ];
    entries.sort((a, b) => a.meeting.startPeriod - b.meeting.startPeriod || a.meeting.endPeriod - b.meeting.endPeriod);
    const groups: WeekCardGroup[] = [];
    for (const entry of entries) {
      const last = groups.at(-1);
      if (last && entry.meeting.startPeriod <= last.endPeriod) {
        last.endPeriod = Math.max(last.endPeriod, entry.meeting.endPeriod);
        last.entries.push(entry);
      } else {
        groups.push({ day: day.day, startPeriod: entry.meeting.startPeriod, endPeriod: entry.meeting.endPeriod, entries: [entry] });
      }
    }
    for (const group of groups) {
      group.entries.sort((a, b) => Number(a.inactive) - Number(b.inactive)
        || Number(a.meeting.status === "cancelled") - Number(b.meeting.status === "cancelled")
        || a.meeting.startPeriod - b.meeting.startPeriod
        || a.meeting.id.localeCompare(b.meeting.id));
    }
    return groups;
  });
}
