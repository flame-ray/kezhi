import { invoke } from "@tauri-apps/api/core";
import type { PhoneCalendarEvent } from "../exporting/phoneCalendar";
import { getRuntimeCapabilities } from "./runtime";

export interface PhoneCalendarResult { inserted: number; updated: number; calendarName: string }
export async function writePhoneCalendar(events: PhoneCalendarEvent[]): Promise<PhoneCalendarResult> {
  if (getRuntimeCapabilities().platform !== "android") throw new Error("直接写入手机日历需要 Android 安装版");
  return invoke("write_phone_calendar", { request: { events } });
}
