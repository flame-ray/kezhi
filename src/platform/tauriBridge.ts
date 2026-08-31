import { invoke } from "@tauri-apps/api/core";
import type { LocalAccountProfile } from "../domain/account";
import type { ScheduleSnapshot } from "../domain/schedule";

export interface SchoolLoginRequest {
  schoolId: string;
  accountId: string;
}

export interface LoginWindowInfo {
  windowLabel: string;
  reused: boolean;
}

export interface LoginStatus {
  windowOpen: boolean;
  authenticated: boolean;
  sessionCookieCount: number;
}

export interface ScheduleFetchRequest extends SchoolLoginRequest {
  academicYear: number;
  semester: 1 | 2;
}

export interface SchedulePayload {
  rows: unknown;
}

export function isTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window;
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
