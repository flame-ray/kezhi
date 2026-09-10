import { useState } from "react";
import type { ReminderSettings } from "../domain/schedule";
import { Icon } from "../ui/Icon";
import { DialogSurface } from "../ui/DialogSurface";

interface SettingsDialogProps {
  settings: ReminderSettings;
  scheduledCount: number;
  nativeNotifications: boolean;
  onToggleReminders: (enabled: boolean) => Promise<boolean>;
  onDefaultMinutesChange: (minutes: number) => void;
  onTestNotification: () => Promise<void>;
  onClose: () => void;
  onOpenExport?: () => void;
  onOpenChanges?: () => void;
  onOpenBackup?: () => void;
}

const reminderChoices = [5, 10, 15, 20, 30, 45, 60];
const developerContacts = [{ label: "邮箱", value: "rayflame1949@outlook.com" }, { label: "QQ", value: "3886269343" }];

export function SettingsDialog({
  settings,
  scheduledCount,
  nativeNotifications,
  onToggleReminders,
  onDefaultMinutesChange,
  onTestNotification,
  onClose,
  onOpenExport,
  onOpenChanges,
  onOpenBackup,
}: SettingsDialogProps) {
  const [busy, setBusy] = useState(false);
  const [contactMessage, setContactMessage] = useState("");
  const copyContact = async (label: string, value: string) => {
    try { await navigator.clipboard.writeText(value); setContactMessage(`${label}已复制`); }
    catch { setContactMessage("系统不允许自动复制，请长按下方联系方式手动复制"); }
  };

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    await onToggleReminders(!settings.enabled);
    setBusy(false);
  };

  const testNotification = async () => {
    if (busy) return;
    setBusy(true);
    await onTestNotification();
    setBusy(false);
  };

  return (
    <DialogSurface className="settings-dialog" labelledBy="settings-title" onClose={onClose}>
        <header className="dialog-header">
          <div><span className="eyebrow">应用设置</span><h2 id="settings-title">课表与提醒</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="关闭"><Icon name="close" /></button>
        </header>

        <div className="settings-body">
          <section className="developer-contact" aria-labelledby="developer-contact-title">
            <div className="developer-contact-heading"><span className="settings-icon"><Icon name="person" /></span><span><h3 id="developer-contact-title">联系开发者</h3><p>反馈问题或提出建议，欢迎通过以下方式联系。</p></span></div>
            {developerContacts.map(contact => <div className="developer-contact-row" key={contact.label}><span><small>{contact.label}</small><strong>{contact.value}</strong></span><button className="soft-button" aria-label={`复制${contact.label}`} onClick={() => void copyContact(contact.label, contact.value)}>复制</button></div>)}
            <p role="status" className="contact-copy-status">{contactMessage}</p>
            <small>反馈时请勿发送密码、验证码或包含个人隐私的截图。</small>
          </section>
          {onOpenChanges && <button className="settings-toggle-card" onClick={onOpenChanges}><span className="settings-icon"><Icon name="clock" /></span><span className="settings-toggle-copy"><strong>调课记录中心</strong><small>查看、修改或撤销单次调课／停课</small></span><Icon name="chevron-right" /></button>}
          {onOpenBackup && <button className="settings-toggle-card" onClick={onOpenBackup}><span className="settings-icon"><Icon name="shield" /></span><span className="settings-toggle-copy"><strong>导入前自动备份</strong><small>恢复上一次导入前的课表</small></span><Icon name="chevron-right" /></button>}
          {onOpenExport && <button className="settings-toggle-card" onClick={onOpenExport}>
            <span className="settings-icon"><Icon name="calendar" /></span>
            <span className="settings-toggle-copy"><strong>导入手机日历</strong><small>系统日历、ICS 文件与课表备份</small></span>
            <Icon name="chevron-right" />
          </button>}
          <button className="settings-toggle-card" onClick={toggle} disabled={busy || !nativeNotifications}>
            <span className="settings-icon"><Icon name="bell" /></span>
            <span className="settings-toggle-copy">
              <strong>系统课程通知</strong>
              <small>{nativeNotifications ? settings.enabled ? `已预定 ${scheduledCount} 条未来提醒` : "开启后由系统在后台按时提醒" : "请在 Windows 或 Android 安装版中使用"}</small>
            </span>
            <i className={`switch ${settings.enabled ? "active" : ""}`} />
          </button>

          <label className="settings-select-row">
            <span><strong>默认提前时间</strong><small>未单独设置的课程会使用此时间</small></span>
            <select value={settings.defaultMinutes} onChange={(event) => onDefaultMinutesChange(Number(event.target.value))} disabled={!settings.enabled}>
              {reminderChoices.map((minutes) => <option value={minutes} key={minutes}>提前 {minutes} 分钟</option>)}
            </select>
          </label>

          <div className="settings-note"><Icon name="shield" /><span><strong>全部在本机完成</strong><small>课程内容不会上传。修改课程、周次、日期或作息后，系统提醒会自动重新安排。</small></span></div>
          <div className="settings-note reminder-limit-note"><Icon name="clock" /><span><strong>滚动预定下一批提醒</strong><small>每次最多安排未来 128 条；每次启动课织都会补充后续提醒。</small></span></div>
        </div>

        <footer className="dialog-footer">
          <button className="soft-button" onClick={testNotification} disabled={busy || !nativeNotifications}>发送测试通知</button>
          <button className="primary-button" onClick={onClose}>完成</button>
        </footer>
    </DialogSurface>
  );
}
