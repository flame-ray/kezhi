export const OFFICIAL_RELEASES_URL = 'https://github.com/flame-ray/kezhi/releases';
export const RELEASE_API_URL = 'https://api.github.com/repos/flame-ray/kezhi/releases/latest';
export interface ReleaseInfo { version: string; notes: string; publishedAt: string; assets: { name: string; size: number }[] }
function versionParts(value: string): number[] | undefined {
  if (!/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) return undefined;
  const parts = value.replace(/^v/, '').split('.').map(Number);
  return parts.every(Number.isSafeInteger) ? parts : undefined;
}
export function isNewerVersion(candidate: string, current: string): boolean {
  const a = versionParts(candidate), b = versionParts(current);
  if (!a || !b) return false;
  for (let index = 0; index < 3; index++) { if (a[index] !== b[index]) return a[index] > b[index]; }
  return false;
}
export function parseRelease(value: unknown): ReleaseInfo {
  if (!value || typeof value !== 'object') throw new Error('更新服务返回了无效数据');
  const raw = value as Record<string, unknown>;
  if (raw.draft !== false || raw.prerelease !== false || typeof raw.tag_name !== 'string' || !versionParts(raw.tag_name)
    || raw.html_url !== `${OFFICIAL_RELEASES_URL}/tag/${raw.tag_name}`) throw new Error('未读取到有效的正式版本');
  if (typeof raw.published_at !== 'string' || !Number.isFinite(Date.parse(raw.published_at)) || !Array.isArray(raw.assets)) throw new Error('更新信息不完整，请稍后重试');
  return { version: raw.tag_name.replace(/^v/, ''), notes: typeof raw.body === 'string' ? raw.body.slice(0, 30000) : '开发者未提供更新说明', publishedAt: raw.published_at,
    assets: raw.assets.filter((asset): asset is { name: string; size: number } => !!asset && typeof asset === 'object' && typeof asset.name === 'string' && /^Kezhi-.*\.(apk|exe)$/.test(asset.name) && Number.isSafeInteger(asset.size) && asset.size > 0).map(({ name, size }) => ({ name, size })) };
}
