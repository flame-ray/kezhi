import { useState } from "react";
import type { ReminderSettings } from "../domain/schedule";
import { Icon } from "../ui/Icon";

interface SettingsDialogProps {
  settings: ReminderSettings;
  scheduledCount: number;
  nativeNotifications: boolean;
  onToggleReminders: (enabled: boolean) => Promise<boolean>;
  onDefaultMinutesChange: (minutes: number) => void;
  onTestNotification: () => Promise<void>;
  onClose: () => void;
}

const reminderChoices = [5, 10, 15, 20, 30, 45, 60];

export function SettingsDialog({
  settings,
  scheduledCount,
  nativeNotifications,
  onToggleReminders,
  onDefaultMinutesChange,
  onTestNotification,
  onClose,
}: SettingsDialogProps) {
  const [busy, setBusy] = useState(false);

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
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="dialog settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="dialog-header">
          <div><span className="eyebrow">应用设置</span><h2 id="settings-title">上课提醒</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="关闭"><Icon name="close" /></button>
        </header>

        <div className="settings-body">
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
      </section>
    </div>
  );
}
