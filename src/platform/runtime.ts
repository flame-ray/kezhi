export type RuntimePlatform = "web" | "windows" | "android" | "ios";

export interface RuntimeCapabilities {
  platform: RuntimePlatform;
  native: boolean;
  accountStorage: "sqlite" | "local-storage";
  schoolLogin: "separate-window" | "embedded-window" | "unavailable";
}

let cachedCapabilities: RuntimeCapabilities | undefined;

export function getRuntimeCapabilities(): RuntimeCapabilities {
  if (cachedCapabilities) return cachedCapabilities;

  const native = "__TAURI_INTERNALS__" in window;
  const userAgent = navigator.userAgent.toLowerCase();
  const platform: RuntimePlatform = !native
    ? "web"
    : userAgent.includes("android")
      ? "android"
      : /iphone|ipad|ipod/.test(userAgent)
        ? "ios"
        : "windows";

  cachedCapabilities = {
    platform,
    native,
    accountStorage: native ? "sqlite" : "local-storage",
    schoolLogin: native && platform === "windows"
      ? "separate-window"
      : native && platform === "android"
        ? "embedded-window"
        : "unavailable",
  };
  return cachedCapabilities;
}

export function isTauriRuntime(): boolean {
  return getRuntimeCapabilities().native;
}
