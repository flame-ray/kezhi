import { useEffect, useRef, useState } from 'react';
import { version } from '../../package.json';
import { checkRelease, openReleasePage } from '../platform/updates';
import { isNewerVersion, OFFICIAL_RELEASES_URL, type ReleaseInfo } from '../updates/releases';
import { DialogSurface } from '../ui/DialogSurface';
import { Icon } from '../ui/Icon';

export function UpdateDialog({ onClose }: { onClose: () => void }) {
  const [release, setRelease] = useState<ReleaseInfo>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => request.current?.abort(), []);
  const close = () => { request.current?.abort(); onClose(); };
  const check = async () => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError(''); setRelease(undefined);
    try { const next = await checkRelease(controller.signal); if (!controller.signal.aborted) setRelease(next); }
    catch (cause) { if (!controller.signal.aborted) setError(typeof cause === 'string' ? cause : cause instanceof Error && cause.name !== 'AbortError' ? cause.message : '连接超时，请检查网络后重试'); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };
  const download = async () => {
    try { await openReleasePage(); }
    catch { setError('无法打开浏览器，请复制下方官方更新网址'); }
  };
  return <DialogSurface className="settings-dialog" labelledBy="update-title" onClose={close}>
    <header className="dialog-header"><div><span className="eyebrow">官方版本更新</span><h2 id="update-title">保持课织新鲜</h2><p>当前版本 {version} · 正式更新来自 GitHub</p></div><button className="icon-button" aria-label="关闭更新" onClick={close}><Icon name="close" /></button></header>
    <div className="settings-body update-body" aria-busy={busy}>
      <div className="update-summary" role="status"><Icon name="shield" /><strong>{busy ? '正在检查正式版本…' : release ? isNewerVersion(release.version, version) ? `发现新版本 ${release.version}` : isNewerVersion(version, release.version) ? '当前安装版本高于公开版本' : '已经是最新正式版本' : '检查可用更新'}</strong><p>仅查询公开版本信息，不上传课表、账号或密码。</p></div>
      {release && <><p>发布时间：{new Date(release.publishedAt).toLocaleDateString()} · 公开版本 {release.version}</p><h3>更新说明</h3><pre className="release-notes">{release.notes || '开发者未提供更新说明'}</pre><ul>{release.assets.map(asset => <li key={asset.name}>{asset.name} · {(asset.size / 1048576).toFixed(1)} MB</li>)}</ul></>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <p className="update-address">{OFFICIAL_RELEASES_URL}</p><button className="soft-button" onClick={async () => { try { await navigator.clipboard.writeText(OFFICIAL_RELEASES_URL); setError('更新网址已复制'); } catch { setError('无法自动复制，请长按网址复制'); } }}>复制更新网址</button>
      <small>下载安装包后由系统完成安装，不会静默安装。Android 请使用同一正式签名的安装包覆盖更新。</small>
    </div>
    <footer className="dialog-footer"><button className="soft-button" onClick={() => void download()}>前往下载页</button><button className="primary-button" disabled={busy} onClick={() => void check()}>{busy ? '检查中…' : release ? '重新检查' : '检查更新'}</button></footer>
  </DialogSurface>;
}
