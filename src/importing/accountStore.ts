import type { LocalAccountProfile } from "../domain/account";
import { isTauriRuntime, loadStoredAccounts, saveStoredAccount } from "../platform/tauriBridge";

const STORAGE_KEY = "kezhi.local-accounts.v1";

function loadLegacyAccounts(): LocalAccountProfile[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter(isAccountProfile);
  } catch {
    return [];
  }
}

export async function loadLocalAccounts(): Promise<LocalAccountProfile[]> {
  const legacy = loadLegacyAccounts();
  if (!isTauriRuntime()) return legacy;
  const stored = await loadStoredAccounts();
  if (stored.length > 0 || legacy.length === 0) return stored;
  await Promise.all(legacy.map((account) => saveStoredAccount(account)));
  return legacy;
}

export async function createLocalAccount(schoolId: string, label: string): Promise<LocalAccountProfile> {
  const profile: LocalAccountProfile = {
    id: crypto.randomUUID(),
    schoolId,
    label: label.trim().slice(0, 40) || "账号 1",
    createdAt: new Date().toISOString(),
  };
  if (isTauriRuntime()) {
    await saveStoredAccount(profile);
  } else {
    const accounts = [...loadLegacyAccounts(), profile];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
  }
  return profile;
}

function isAccountProfile(value: unknown): value is LocalAccountProfile {
  if (!value || typeof value !== "object") return false;
  const account = value as Partial<LocalAccountProfile>;
  return typeof account.id === "string"
    && /^[a-zA-Z0-9_-]{1,64}$/.test(account.id)
    && typeof account.schoolId === "string"
    && typeof account.label === "string"
    && typeof account.createdAt === "string";
}
