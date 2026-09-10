import { invoke } from "@tauri-apps/api/core";
import type { PhoneCalendarEvent } from "../exporting/phoneCalendar";
import { getRuntimeCapabilities } from "./runtime";

export interface PhoneCalendarResult { inserted: number; updated: number; deleted?: number; calendarName: string }
export interface PhoneCalendarPreview extends PhoneCalendarResult {
  token: string; deleted: number; unchanged: number; legacyPreserved: number;
  changes: Array<{ kind: "insert" | "update" | "delete"; title: string; startMs: number; location: string; previousStartMs?: number; previousLocation?: string }>;
}
export async function previewPhoneCalendar(events: PhoneCalendarEvent[], scope: string, cleanupLegacy: boolean): Promise<PhoneCalendarPreview> {
  if (getRuntimeCapabilities().platform !== "android") throw new Error("直接更新手机日历需要 Android 安装版");
  return invoke("write_phone_calendar", { request: { action: "preview", events, scope, cleanupLegacy } });
}
export async function applyPhoneCalendar(token: string): Promise<PhoneCalendarResult> {
  if (getRuntimeCapabilities().platform !== "android") throw new Error("直接更新手机日历需要 Android 安装版");
  return invoke("write_phone_calendar", { request: { action: "apply", token } });
}
export async function writePhoneCalendar(events: PhoneCalendarEvent[]): Promise<PhoneCalendarResult> {
  if (getRuntimeCapabilities().platform !== "android") throw new Error("直接写入手机日历需要 Android 安装版");
  return invoke("write_phone_calendar", { request: { events } });
}
