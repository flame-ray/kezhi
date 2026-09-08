import { invoke } from "@tauri-apps/api/core";
import type { LocalAccountProfile } from "../domain/account";
import type { ScheduleSnapshot } from "../domain/schedule";
import type { PortalPageSnapshot } from "../selection/selectionAssistant";
export { isTauriRuntime } from "./runtime";

export interface SchoolLoginRequest {
  schoolId: string;
  accountId: string;
  loginUrl?: string;
  purpose?: "schedule" | "selection";
}

export interface LoginWindowInfo {
  windowLabel: string;
  reused: boolean;
}

export interface LoginStatus {
  windowOpen: boolean;
  authenticated: boolean;
  sessionCookieCount: number;
  currentUrl?: string;
  pageSnapshot?: string;
}

export interface ScheduleFetchRequest extends SchoolLoginRequest {
  academicYear: number;
  semester: 1 | 2;
}

export interface SchedulePayload {
  rows: unknown;
}

export interface PortalResourceRequest extends SchoolLoginRequest {
  endpointUrl: string;
}

export interface PortalResourcePayload {
  body: string;
  contentType: string;
  status: number;
  sourceUrl: string;
}

export function openSchoolLogin(request: SchoolLoginRequest): Promise<LoginWindowInfo> {
  return invoke<LoginWindowInfo>("open_school_login", { request });
}

export function prepareSchoolSession(request: SchoolLoginRequest): Promise<LoginWindowInfo> {
  return invoke<LoginWindowInfo>("prepare_school_session", { request });
}

export function getSchoolLoginStatus(request: SchoolLoginRequest): Promise<LoginStatus> {
  return invoke<LoginStatus>("school_login_status", { request });
}

export function hideSchoolLogin(request: SchoolLoginRequest): Promise<void> {
  return invoke<void>("hide_school_login", { request });
}

export function fetchSchoolSchedule(request: ScheduleFetchRequest): Promise<SchedulePayload> {
  return invoke<SchedulePayload>("fetch_school_schedule", { request });
}

export function fetchPortalResource(request: PortalResourceRequest): Promise<PortalResourcePayload> {
  return invoke<PortalResourcePayload>("fetch_portal_resource", { request });
}

export async function readPortalPageSnapshot(request: SchoolLoginRequest): Promise<PortalPageSnapshot> {
  const status = await getSchoolLoginStatus(request);
  if (!status.windowOpen && !status.pageSnapshot) throw new Error("学校页面已关闭，请重新打开学习模式");
  if (status.pageSnapshot) {
    try {
      const parsed = JSON.parse(status.pageSnapshot) as PortalPageSnapshot;
      if (parsed && typeof parsed.pageUrl === "string") return parsed;
    } catch {
      throw new Error("学校页面结构读取失败，请重新进入选课页");
    }
  }
  if (!status.currentUrl) throw new Error("没有读取到学校页面，请先进入选课页");
  return { pageUrl: status.currentUrl, title: new URL(status.currentUrl).hostname, headings: [], forms: [], links: [], resources: [] };
}

export function loadScheduleSnapshot(): Promise<ScheduleSnapshot | null> {
  return invoke<ScheduleSnapshot | null>("load_schedule_snapshot");
}

export function saveScheduleSnapshot(snapshot: ScheduleSnapshot): Promise<void> {
  return invoke<void>("save_schedule_snapshot", { snapshot });
}

export function loadStoredAccounts(): Promise<LocalAccountProfile[]> {
  return invoke<LocalAccountProfile[]>("load_local_accounts");
}

export function saveStoredAccount(account: LocalAccountProfile): Promise<void> {
  return invoke<void>("save_local_account", { account });
}
