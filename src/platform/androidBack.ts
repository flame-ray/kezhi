import { onBackButtonPress } from "@tauri-apps/api/app";
import type { RuntimePlatform } from "./runtime";

export type RemoveAndroidBackHandler = () => void;

export async function installAndroidBackHandler(
  platform: RuntimePlatform,
  handler: () => void,
): Promise<RemoveAndroidBackHandler> {
  if (platform !== "android") return () => undefined;

  const listener = await onBackButtonPress(handler);
  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    void listener.unregister();
  };
}
