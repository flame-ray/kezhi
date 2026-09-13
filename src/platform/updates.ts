import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { OFFICIAL_RELEASES_URL, RELEASE_API_URL, parseRelease } from '../updates/releases';

export async function checkRelease(signal?: AbortSignal) {
  if ('__TAURI_INTERNALS__' in window) return parseRelease(await invoke('check_app_update'));
  const controller = new AbortController();
  const stop = () => controller.abort();
  signal?.addEventListener('abort', stop, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = window.setTimeout(stop, 15000);
  try {
    const response = await fetch(RELEASE_API_URL, { signal: controller.signal, credentials: 'omit', headers: { Accept: 'application/vnd.github+json' } });
    if (!response.ok) throw new Error(response.status === 403 || response.status === 429 ? '更新服务访问频繁，请稍后重试' : '暂时无法连接 GitHub，请检查网络后重试');
    const data = await response.text();
    if (data.length > 524288) throw new Error('更新信息过大');
    return parseRelease(JSON.parse(data));
  } finally { window.clearTimeout(timer); signal?.removeEventListener('abort', stop); }
}
export async function openReleasePage(): Promise<void> {
  if ('__TAURI_INTERNALS__' in window) await openUrl(OFFICIAL_RELEASES_URL);
  else window.open(OFFICIAL_RELEASES_URL, '_blank', 'noopener,noreferrer');
}
